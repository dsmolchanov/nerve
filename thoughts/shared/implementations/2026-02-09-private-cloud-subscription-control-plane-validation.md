# Validation Report: Private Cloud Subscription Control Plane

**Plan**: `thoughts/shared/plans/2026-02-05-private-cloud-subscription-control-plane.md`
**Validated**: 2026-02-09
**Commit**: `bb15f39 Add cloud subscription control plane and entitlement pipeline`

## Implementation Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Cloud Data Model, Indexing, Meter Foundations | Fully implemented | All tables, indexes, config, tool costs |
| Phase 2: Cloud Auth, Principal Resolution, Tenant Isolation | Fully implemented | Auth, RLS, scope enforcement, ownership checks |
| Phase 3: Entitlement Enforcement, Quota, Metering | Fully implemented | Policy matrix, atomic reserve, rate limiter, observability |
| Phase 4A: Stripe Webhook Adapter, Entitlement Sync | Fully implemented | Webhook handler, idempotency, entitlement sync |
| Phase 4B: Control Plane API Surface, Credential Issuance | Fully implemented | All 6 endpoints, token issuance, handler tests |
| Phase 5: Cloud Operations, Security, Commercial Readiness | Fully implemented | Docker Compose, E2E smoke, reconciliation, docs |

## Automated Verification Results

| Check | Result |
|-------|--------|
| `go build ./...` | PASS |
| `go test ./...` | PASS (all 12 test packages green) |
| `go vet ./...` | 3 warnings (pre-existing IPv6 format issues, not related to this implementation) |

### Test Package Results

- `internal/auth` -- PASS (0.386s)
- `internal/billing` -- PASS (0.259s)
- `internal/cloudapi` -- PASS (0.674s)
- `internal/config` -- PASS (0.505s)
- `internal/entitlements` -- PASS (1.555s)
- `internal/mcp` -- PASS (1.393s)
- `internal/reconcile` -- PASS (0.984s)
- `internal/store` -- PASS (1.140s)

## Code Review Findings

### Matches Plan

**Phase 1:**
- All 7 new tables (`plan_entitlements`, `subscriptions`, `org_entitlements`, `org_usage_counters`, `usage_events`, `webhook_events`, `cloud_api_keys`) with correct constraints and unique indexes
- Tenant hardening: `threads.org_id` and `messages.org_id` added, backfilled from inboxes, NOT NULL enforced
- All planned indexes including partial unique index on `usage_events.replay_id`
- Cloud/Auth/Billing/Metering config structs with env overrides
- Tool cost config at `configs/meters/tool_costs.yaml`

**Phase 2:**
- Principal model with all 5 fields (OrgID, ActorID, TokenID, Scopes, AuthMethod)
- Dual-path auth: JWT bearer + cloud API key via `X-Nerve-Cloud-Key` header
- Scope enforcement with 5 families: `nerve:email.read/search/draft/send`, `nerve:admin.billing`
- Wildcard scope matching (`nerve:email.*`, `*`)
- RLS on inboxes/threads/messages with `FORCE ROW LEVEL SECURITY` and cloud-mode bypass
- `RunAsOrg` uses parameterized `set_config` (safer than `SET LOCAL` -- positive deviation)
- All 6 tool methods have explicit ownership checks (defense-in-depth with RLS)

**Phase 3:**
- All 5 subscription statuses handled deterministically in policy matrix
- Atomic quota reserve with `UPDATE ... WHERE used + $cost <= $monthly_units` pattern
- Lazy usage-period rollover before status check
- Per-org token bucket rate limiter keyed by org_id
- JSON-RPC error codes: `-32040` quota_exceeded, `-32041` subscription_inactive, `-32042` rate_limited with `retry_after_seconds`
- Observability with 80% utilization warnings and deny event alerts
- Usage refund on tool execution failure via `ReleaseOrgUsageUnits`

**Phase 4A:**
- Stripe webhook signature verification (HMAC-SHA256)
- All 5 event types handled: checkout.session.completed, customer.subscription.created/updated/deleted, invoice.paid/payment_failed
- Idempotent via `webhook_events` table with `ON CONFLICT DO NOTHING`
- Deterministic org resolution via `client_reference_id`
- Failed event reprocessing support

**Phase 4B:**
- Control-plane binary with graceful shutdown
- All 6 API routes: POST /v1/orgs, POST /v1/subscriptions/checkout, POST /v1/billing/webhook/stripe, GET /v1/subscriptions/current, POST /v1/tokens/service, POST /v1/billing/portal
- Token issuance with scope validation, 1-hour TTL cap, rotation via revocation, audit trail
- Service tokens migration (0004_service_tokens.sql)

**Phase 5:**
- Docker Compose cloud profile (runtime + control-plane + postgres + redis + qdrant)
- Cloud env example with all required variables
- E2E smoke workflow covering full lifecycle (seed, activate, mint token, MCP call, assert usage, cancel)
- Reconciliation service with counter repair and backstop rollover
- CLOUD_QUICKSTART.md, CLOUD_SECURITY.md, PRICING_AND_ENTITLEMENTS.md, SECURITY.md
- MCP protocol version logging in request handler

### Positive Deviations from Plan

1. **Inboxes backfill CTE** (`0002_cloud_control_plane.sql:94-111`): Added prerequisite backfill for inboxes with NULL org_id. Without this, the threads/messages backfill would fail on legacy databases. Essential addition not explicitly in the plan.

2. **`set_config` over `SET LOCAL`** (`store.go:113-141`): Uses parameterized `set_config('app.current_org_id', $1, true)` instead of string-interpolated `SET LOCAL`. Functionally equivalent but prevents SQL injection in org ID values.

3. **`FORCE ROW LEVEL SECURITY`** (`0003_tenant_rls.sql:6-8`): Applies RLS even to table owners, strengthening the isolation model beyond what the plan specified.

4. **Cloud-mode bypass in RLS policies** (`0003_tenant_rls.sql:16-17`): Policies transparently allow all rows when `app.cloud_mode != 'true'`, ensuring OSS mode is not affected by RLS.

## Critical Issues

### P0 -- No JWT Signature Verification

**Location**: `internal/auth/verifier.go:56-92`

`VerifyJWT` decodes the JWT payload from the second base64 segment but never verifies the cryptographic signature (third segment). The `Auth.JWKSURL` config field is never used. Tests use `alg: none` unsigned tokens and pass.

**Impact**: Any attacker can forge a JWT with arbitrary `org_id`, `sub`, and scopes, completely bypassing tenant isolation in cloud mode.

**Recommendation**: Implement JWKS-based signature verification using a library like `github.com/golang-jwt/jwt/v5`. Reject tokens with `alg: none`. This is the single most critical gap in the entire control plane.

### P0 -- Auth Bypass on GET /v1/subscriptions/current

**Location**: `internal/cloudapi/handler.go:157-165`

When the `org_id` query parameter is provided, the handler skips authentication entirely and returns subscription details for any org. Authentication is only invoked when `org_id` is empty.

**Impact**: Unauthenticated enumeration of subscription/billing state for arbitrary organizations.

**Recommendation**: Always authenticate the caller first, then restrict `org_id` to the caller's own org unless the caller has admin scope.

## High Priority Issues

### P1 -- Stripe Signature Bypass When Secret Is Empty

**Location**: `internal/billing/stripe.go:261-263`

If `StripeWebhookSecret` is empty or whitespace, `verifySignature` silently returns nil, skipping all verification. This enables fake webhook events if the env var is accidentally unset in production.

**Recommendation**: Reject webhooks in cloud mode when secret is empty. Log a warning at startup.

### P1 -- Unbounded Rate Limiter Memory Growth

**Location**: `internal/entitlements/rate_limiter.go:19`

The `buckets` map grows without eviction. For a cloud service with many orgs, this is a memory leak proportional to distinct org count over server lifetime.

**Recommendation**: Add TTL-based bucket eviction (e.g., remove buckets not accessed within 10 minutes).

### P1 -- Raw Error Messages Leaked to HTTP Clients

**Location**: `internal/cloudapi/handler.go:94,145,177,234`

Several handlers return raw `err.Error()` in HTTP responses, potentially leaking database schema details or internal error information to external callers.

**Recommendation**: Use generic error messages in HTTP responses and log details server-side.

### P1 -- Unsigned Service Token JWTs

**Location**: `internal/cloudapi/tokens.go:112-122`

Service tokens are issued as `alg: none` unsigned JWTs. Documented in `CLOUD_SECURITY.md` as "test tokens" but the production control-plane ships this code.

**Recommendation**: Implement HMAC-SHA256 or RSA signing before any production deployment.

## Medium Priority Issues

### P2 -- TOCTOU Race in Inbox Limit Enforcement

**Location**: `internal/cloudapi/handler.go:53-72`

`EnforceInboxLimit` uses check-then-act pattern (count inboxes, compare to limit). Concurrent inbox creation requests could both pass the check and exceed `max_inboxes`.

**Recommendation**: Use an atomic SQL pattern like `INSERT ... WHERE (SELECT count(*)) < limit` or advisory lock.

### P2 -- `initialize` Requires `nerve:email.read` Scope

**Location**: `internal/mcp/server.go:388`

The MCP handshake (`initialize`) requires `nerve:email.read` scope. Clients with only `nerve:email.search` or `nerve:email.send` cannot complete the handshake.

**Recommendation**: Make `initialize` scope-free or require a minimal base scope.

### P2 -- `requiredScope` Defaults to `nerve:email.read` on Parse Error

**Location**: `internal/mcp/server.go:392-393`

If `tools/call` params fail to decode, the fallback scope is `nerve:email.read`. A malformed request could bypass stricter scope requirements for specific tools.

**Recommendation**: Return an error or use the most restrictive default scope.

### P2 -- Vector Search Not Org-Scoped

**Location**: `internal/tools/service.go:132-134`

`searchVector` queries the vector store without `org_id` filtering. If the vector store indexes data across orgs, results could include cross-tenant content.

**Recommendation**: Add `org_id` filter to vector store query metadata.

### P2 -- Observer 80% Warning Never Resets Across Periods

**Location**: `internal/observability/entitlements.go:39`

The `warned80` map is set to true and never cleared. After a period rollover, the 80% utilization warning will not fire again for that org.

**Recommendation**: Key `warned80` by `orgID + periodStart` or add a `ResetPeriod` method.

### P2 -- Redundant Indexes

**Location**: `internal/store/migrations/0002_cloud_control_plane.sql:88,92`

- `idx_subscriptions_org` is redundant with `UNIQUE(org_id)` constraint (which creates an implicit index)
- `idx_org_usage_meter_period` is redundant with `UNIQUE(org_id, meter_name, period_start)`

**Impact**: Minor write overhead from maintaining duplicate indexes.

## Test Coverage Assessment

### Well Covered

- Migration correctness (empty DB, legacy backfill, partial unique index, RLS isolation)
- JWT parsing and field extraction
- Cloud API key authentication
- Scope wildcard matching
- MCP 401/403 responses in cloud/OSS modes
- Atomic quota under 100 concurrent goroutines
- Usage period rollover
- All 5 subscription status policies in isolation
- All 3 JSON-RPC error codes with structured payloads
- Webhook replay/idempotency
- Stripe event-to-status mapping for all event types
- Control-plane auth permission model
- Token scope/TTL validation and rotation
- Reconciliation counter repair and period rollover

### Test Gaps

- No test for expired JWT, `nbf` in the future, or mismatched issuer/audience
- No test for revoked cloud API key rejection
- No end-to-end cloud-mode tool call through MCP
- No service-level integration test for status denial through `PreAuthorizeTool`
- No rate limiter denial test through `PreAuthorizeTool`
- No test for `past_due` with null grace period
- No unit tests for `EnforceInboxLimit`
- No unit tests for `handleCurrentSubscription`, `handleBillingPortal`
- No test for `verifySignature` with invalid timestamps
- E2E smoke test does not exercise Stripe signature verification (empty secret)
- No down-migration tests

## Manual Testing Required

1. **Cloud auth end-to-end**:
   - [ ] Cloud request without credentials returns 401
   - [ ] Insufficient scope returns 403
   - [ ] Org A credential cannot access Org B data
   - [ ] OSS local mode behavior unchanged (`make up && make mcp-test`)

2. **Entitlement lifecycle**:
   - [ ] Active org executes tools with usage increment
   - [ ] Over-quota org receives `-32040` error
   - [ ] `past_due` org works during grace, blocks after
   - [ ] Subscription cancellation suspends MCP access

3. **Billing integration**:
   - [ ] Stripe test event updates entitlement correctly
   - [ ] Duplicate webhook delivery is idempotent
   - [ ] Runtime serves based on local entitlements during Stripe outage

4. **Operations**:
   - [ ] Cloud E2E smoke workflow passes end-to-end
   - [ ] New org onboarded through control-plane APIs
   - [ ] Reconciliation job detects and repairs usage drift

## Summary

The implementation is **comprehensive and faithful to the plan** across all 5 phases (6 execution checkpoints). All 41 files changed introduce the complete cloud subscription control plane with dual-mode auth, tenant isolation (app-layer + RLS), atomic quota enforcement, Stripe webhook lifecycle sync, control-plane API surface, and operational tooling.

**Key strengths**: Atomic quota reserve correctness, defense-in-depth tenant isolation, idempotent webhook processing, clean OSS/cloud mode separation, thorough migration tests with real PostgreSQL.

**Critical gaps before production**: JWT signature verification and control-plane auth bypass on `/v1/subscriptions/current` must be resolved. Service token signing should use a proper cryptographic algorithm.

**Overall assessment**: Implementation is complete for MVP with known security placeholders documented. The two P0 security issues should be addressed before any cloud mode is enabled in a non-development environment.

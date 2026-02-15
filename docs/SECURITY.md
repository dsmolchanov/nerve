# Security

## Threat Model (MVP)
- MCP tools can trigger outbound email and data access.
- Malicious tooling or prompt injection can exfiltrate sensitive data.

## Controls
- `/mcp` allows missing `Origin` only in dev mode.
- In non-dev mode, requests require `Origin` allowlist or `X-API-Key`.
- In cloud mode (`cloud.mode=true`), every `/mcp` request requires one of:
  - `Authorization: Bearer <jwt>`
  - `X-Nerve-Cloud-Key: <scoped_key>`
- `/jmap/push` requires `X-NM-Push-Secret` when configured.
- Outbound send is disabled by default unless `NM_ALLOW_OUTBOUND=true`.
- `send_reply` refuses when `needs_human_approval=true` unless `NM_ALLOW_SEND_WITH_WARNINGS=true`.

## Cloud Token Requirements
- Service JWTs must include:
  - `org_id`: tenant authority for request isolation
  - `scope`: space-separated or array-form tool scopes
  - `sub`: actor identity
  - `jti`: token identifier for audit correlation
- JWTs without `org_id` are rejected by cloud runtime authentication.
- Control-plane token issuance endpoint is the authority for service-token claims.

## MCP Scope Families
- `nerve:email.read`
- `nerve:email.search`
- `nerve:email.draft`
- `nerve:email.send`
- `nerve:admin.billing` (control-plane only)

## Control Plane Endpoint Auth
- `POST /v1/billing/webhook/stripe`:
  - Stripe signature verification only.
- `POST /v1/orgs` and `POST /v1/subscriptions/checkout`:
  - Requires `nerve:admin.billing` or bootstrap admin API key (`X-API-Key`).
- `POST /v1/tokens/service`:
  - High-privilege operation; requires `nerve:admin.billing` or bootstrap admin API key.
  - Enforces short TTL (maximum 1 hour) and explicit scope list.
  - Issuance metadata is written to audit logs.
- `POST /v1/keys`, `GET /v1/keys`, `DELETE /v1/keys/{id}`:
  - Requires `nerve:admin.billing` or bootstrap admin API key.
  - Stores only key hash (never raw key) in `cloud_api_keys`.
  - Raw key is returned only once at creation time.

## Reporting
Please report security issues to `security@nerve.email`.

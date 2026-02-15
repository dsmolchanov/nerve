# Custom Email Domain Setup Implementation Plan

## Overview

Enable tenants to configure their own email domain (e.g., `support@acme.com`) for sending and receiving mail through Nerve. This includes domain ownership verification via DNS, DKIM key generation and signing via a battle-tested Go library (`go-msgauth`), CNAME-based DKIM for zero-touch key rotation, event-driven inbound mail routing via Stalwart webhooks, and a dashboard UI for domain management. Supports outbound-only mode (no MX change required) and full inbound+outbound mode. Works in both cloud (Fly.io) and self-hosted deployments.

## Current State Analysis

### Email Infrastructure
- **Single hardcoded domain**: `local.neuralmail` used everywhere (config defaults, SMTP sender, outbound guards, Stalwart hostname, HELO domain)
- **No domain management**: No `org_domains` table, no DNS verification, no DKIM/SPF/DMARC
- **Single JMAP user**: `dev@local.neuralmail` polls one mailbox on Stalwart
- **No inbox creation API**: Inboxes auto-created at startup via `EnsureDefaults` or direct SQL
- **Free-form inbox address**: `inboxes.address` is unvalidated text with no domain constraint or FK
- **Global SMTP From**: `Config.SMTP.From` used for all outbound mail, not per-inbox
- **Outbound guard hardcoded**: `strings.HasSuffix(to, "@local.neuralmail")` at `internal/tools/service.go:303`
- **No TLS for SMTP**: Zero `StartTLS` / `crypto/tls` usage anywhere in `internal/`
- **HELO derived from From address**: `smtpHeloDomain` at `internal/tools/service.go:401-407` uses the From address domain — incorrect for multi-tenant sending
- **Webhook stub exists**: `internal/app/app.go:119` has `/jmap/push` endpoint that validates `X-NM-Push-Secret` header (currently a stub)
- **No max_domains entitlement**: `plan_entitlements` and `org_entitlements` have `max_inboxes` but no `max_domains` column

### Key Discoveries
- `internal/store/migrations/0001_init.sql:24-31`: `inboxes` table has `address text NOT NULL` but no domain column or FK
- `internal/tools/service.go:295-298`: `SendReply` uses global `Config.SMTP.From`, falls back to `dev@local.neuralmail`
- `internal/tools/service.go:348-399`: `sendSMTP` does raw TCP dial with no TLS, no DKIM, bare-minimum RFC 822 headers
- `internal/tools/service.go:381`: `client.Mail(from)` sets envelope sender to same `from` variable used for headers — SPF alignment is correct as long as `from` is the inbox address
- `internal/tools/service.go:401-407`: `smtpHeloDomain` extracts domain from From address for HELO — will break deliverability with custom domains
- `configs/dev/stalwart.toml`: In-memory user directory with 2 hardcoded principals, no multi-domain support
- `internal/jmap/jmap_client.go:119-148`: Mailbox discovery finds the single "inbox" role mailbox
- `internal/app/app.go:45-49`: Startup creates one inbox from `SMTP.From` config
- `internal/app/app.go:119,133-140`: `/jmap/push` endpoint exists as a stub — foundation for webhook-based inbound
- `internal/cloudapi/handler.go:68-87`: `EnforceInboxLimit` exists but is not wired into any creation flow
- `internal/store/migrations/0002_cloud_control_plane.sql:2-10`: `plan_entitlements` has `features jsonb` column — could store `max_domains` there, but a dedicated column is cleaner
- `go.mod`: No DKIM library, no mail composition library — only standard `net/smtp` and `crypto` packages

## Desired End State

After this plan is complete:

1. **Tenants can add a custom email domain** through the dashboard or API
2. **DNS records are verified automatically** (ownership TXT, SPF, DKIM, DMARC; MX optional)
3. **DKIM keys are generated per-domain** and stored encrypted; signing uses `go-msgauth` library
4. **CNAME-based DKIM** is the primary method — Nerve hosts the DKIM TXT record, enabling key rotation without tenant DNS changes
5. **Inboxes can be created on verified domains** (e.g., `support@acme.com`) with DB-level FK enforcement
6. **Inbound mail arrives via Stalwart webhook** (HTTP POST to Nerve) — event-driven, no polling
7. **Outbound mail uses per-inbox From** addresses with DKIM signatures, STARTTLS, and stable HELO
8. **Outbound-only mode** allows sending from a domain without requiring MX changes
9. **Works in both cloud and self-hosted** modes

### Verification:
- DNS auto-verification completes for a domain with correct records
- Outbound emails carry valid DKIM signatures (verifiable with `opendkim-testkey` or mail-tester.com)
- Inbound emails to `support@acme.com` arrive in the correct org's inbox via webhook push
- Dashboard shows domain status with separate "Outbound ready" / "Inbound ready" indicators
- DKIM private keys are encrypted at rest (app-level AES-GCM)

## What We're NOT Doing

- **Custom MCP API domains**: This plan covers email domains only, not vanity API endpoints
- **Subdomain auto-provisioning**: Tenants bring their own domain; we don't generate `orgname.nerve.email` subdomains
- **Full Stalwart multi-tenant management API**: We configure Stalwart minimally for domain acceptance; full Stalwart admin is out of scope
- **Email forwarding/aliasing**: Each inbox has one address; no aliases or catch-all
- **DMARC reporting**: We set DMARC policy but don't process aggregate/forensic reports
- **IP warmup / deliverability optimization**: Out of scope for MVP
- **RLS cloud_mode pattern refactoring**: The existing `app.cloud_mode` RLS pattern (`0003_tenant_rls.sql`) is an intentional architectural decision for self-hosted vs cloud. Refactoring it is a separate codebase-wide concern. For `org_domains`, we follow the established pattern consistently.
- **Subdomain collision prevention**: Ownership verification handles the real threat. Blocking subdomains of existing verified domains is deferred.

## Implementation Approach

The plan follows a bottom-up approach: schema first, then domain service logic, then API layer, then SMTP improvements, then inbound routing, and finally dashboard UI. Each phase is independently testable.

---

## Phase 1: Database Schema — `org_domains` Table, Inbox FK & Entitlements

### Overview
Add an `org_domains` table with encrypted DKIM key storage, provisioning state machine, and domain canonicalization. Add `org_domain_id` FK to `inboxes` to enforce inbox-to-domain relationships at the DB level. Add `max_domains` to entitlements.

### Changes Required

#### 1. New Migration: `0005_org_domains.sql`
**File**: `internal/store/migrations/0005_org_domains.sql`

```sql
-- +goose Up

CREATE TABLE IF NOT EXISTS org_domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  domain text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
    -- pending: awaiting DNS verification (auto-expires after 7 days)
    -- verified_dns: DNS checks passed, awaiting Stalwart provisioning
    -- provisioning: Stalwart domain/account creation in progress
    -- active: fully operational (outbound + optional inbound)
    -- failed: DNS verification failed
  verification_token text NOT NULL,
  mx_verified boolean NOT NULL DEFAULT false,
  spf_verified boolean NOT NULL DEFAULT false,
  dkim_verified boolean NOT NULL DEFAULT false,
  dmarc_verified boolean NOT NULL DEFAULT false,
  inbound_enabled boolean NOT NULL DEFAULT false,  -- true if MX is verified and user wants inbound
  dkim_selector text NOT NULL DEFAULT 'nerve',
  dkim_private_key_enc text,   -- AES-GCM encrypted PEM-encoded RSA private key
  dkim_public_key text,        -- PEM-encoded RSA public key (for DNS record display, not secret)
  dkim_method text NOT NULL DEFAULT 'cname',  -- 'cname' or 'txt'
  last_check_at timestamptz,
  verified_at timestamptz,
  expires_at timestamptz,      -- auto-expire pending claims after 7 days
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Domain canonicalization: enforce lowercase, no trailing dot
  CONSTRAINT chk_domain_canonical CHECK (domain = lower(domain) AND domain NOT LIKE '%.')
);

-- Only verified/active domains enforce uniqueness (prevents domain-claim DoS)
CREATE UNIQUE INDEX idx_org_domains_verified ON org_domains(lower(domain))
  WHERE status IN ('verified_dns', 'provisioning', 'active');
-- Allow multiple pending claims for the same domain (they expire)
CREATE INDEX idx_org_domains_domain ON org_domains(lower(domain));
CREATE INDEX idx_org_domains_org ON org_domains(org_id);
CREATE INDEX idx_org_domains_expires ON org_domains(expires_at) WHERE status = 'pending';

-- RLS for org_domains (same pattern as inboxes in 0003_tenant_rls.sql)
ALTER TABLE org_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE org_domains FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_org_domains ON org_domains
  USING (
    coalesce(current_setting('app.cloud_mode', true), 'false') <> 'true'
    OR org_id = nullif(current_setting('app.current_org_id', true), '')::uuid
  )
  WITH CHECK (
    coalesce(current_setting('app.cloud_mode', true), 'false') <> 'true'
    OR org_id = nullif(current_setting('app.current_org_id', true), '')::uuid
  );

-- Add FK from inboxes to org_domains (nullable for legacy local.neuralmail inboxes)
ALTER TABLE inboxes ADD COLUMN org_domain_id uuid REFERENCES org_domains(id);

-- Add max_domains to entitlements
ALTER TABLE plan_entitlements ADD COLUMN max_domains int NOT NULL DEFAULT 1;
ALTER TABLE org_entitlements ADD COLUMN max_domains int NOT NULL DEFAULT 1;

-- +goose Down
ALTER TABLE org_entitlements DROP COLUMN IF EXISTS max_domains;
ALTER TABLE plan_entitlements DROP COLUMN IF EXISTS max_domains;
ALTER TABLE inboxes DROP COLUMN IF EXISTS org_domain_id;
DROP POLICY IF EXISTS tenant_isolation_org_domains ON org_domains;
DROP TABLE IF EXISTS org_domains;
```

#### 2. DKIM Key Encryption Helpers
**File**: `internal/domains/crypto.go`

```go
package domains

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"errors"
	"io"
)

// EncryptDKIMKey encrypts a PEM-encoded private key using AES-256-GCM.
// The encryption key is loaded from NM_DKIM_ENCRYPTION_KEY env var.
func EncryptDKIMKey(plainPEM string, encryptionKey []byte) (string, error)

// DecryptDKIMKey decrypts an AES-GCM encrypted DKIM private key.
func DecryptDKIMKey(ciphertext string, encryptionKey []byte) (string, error)
```

The encryption key is a 32-byte key loaded from the `NM_DKIM_ENCRYPTION_KEY` environment variable (base64-encoded). The ciphertext is stored as base64 in the `dkim_private_key_enc` column.

#### 3. Pending Domain Expiry
**File**: `internal/domains/cleanup.go`

```go
// ExpirePendingDomains deletes org_domains where status='pending' and expires_at < now().
// Called periodically (e.g., daily) or on domain registration to garbage-collect stale claims.
func ExpirePendingDomains(ctx context.Context, store *store.Store) (int, error)
```

#### 4. Store Types & Queries
**File**: `internal/store/store.go`
**Changes**: Add `OrgDomain` struct and CRUD methods

```go
type OrgDomain struct {
	ID                string
	OrgID             string
	Domain            string
	Status            string  // "pending", "verified_dns", "provisioning", "active", "failed"
	VerificationToken string
	MXVerified        bool
	SPFVerified       bool
	DKIMVerified      bool
	DMARCVerified     bool
	InboundEnabled    bool
	DKIMSelector      string
	DKIMPrivateKeyEnc sql.NullString  // AES-GCM encrypted PEM
	DKIMPublicKey     sql.NullString  // PEM (not secret)
	DKIMMethod        string          // "cname" or "txt"
	LastCheckAt       sql.NullTime
	VerifiedAt        sql.NullTime
	ExpiresAt         sql.NullTime
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// CreateOrgDomain inserts a new domain registration. Canonicalizes domain (lowercase, strip trailing dot).
// Sets expires_at = now() + 7 days for pending claims.
func (s *Store) CreateOrgDomain(ctx context.Context, orgID, domain, verificationToken, dkimSelector, dkimPrivateKeyEnc, dkimPublicKey, dkimMethod string) (string, error)

// GetOrgDomain retrieves a domain by its canonical domain name (org-scoped via RLS).
func (s *Store) GetOrgDomain(ctx context.Context, domain string) (OrgDomain, error)

// GetOrgDomainByID retrieves a domain by UUID.
func (s *Store) GetOrgDomainByID(ctx context.Context, id string) (OrgDomain, error)

// ListOrgDomains returns all domains for an org.
func (s *Store) ListOrgDomains(ctx context.Context, orgID string) ([]OrgDomain, error)

// UpdateOrgDomainVerification updates DNS verification fields and status.
func (s *Store) UpdateOrgDomainVerification(ctx context.Context, id string, mx, spf, dkim, dmarc bool, status string) error

// UpdateOrgDomainStatus transitions domain to a new status (for provisioning state machine).
func (s *Store) UpdateOrgDomainStatus(ctx context.Context, id string, status string) error

// DeleteOrgDomain removes a domain registration.
func (s *Store) DeleteOrgDomain(ctx context.Context, id string) error

// GetOrgDomainForSending retrieves the active domain + encrypted DKIM key for a given email address domain.
// Only returns domains with status='active'.
func (s *Store) GetOrgDomainForSending(ctx context.Context, domain string) (OrgDomain, error)

// CountDomainsByOrg returns the number of non-expired domains for an org.
func (s *Store) CountDomainsByOrg(ctx context.Context, orgID string) (int, error)

// ExpirePendingDomains deletes pending domains past their expires_at.
func (s *Store) ExpirePendingDomains(ctx context.Context) (int, error)
```

#### 5. Domain Canonicalization Helper
**File**: `internal/domains/canonical.go`

```go
// CanonicalizeDomain normalizes a domain for storage:
// - lowercase
// - trim spaces
// - strip trailing dot
// - validate as a valid hostname (no protocol, no path)
// Returns error if domain is invalid.
func CanonicalizeDomain(domain string) (string, error)
```

### Success Criteria

#### Automated Verification:
- [x] Migration applies cleanly: `go test ./internal/store/ -run TestMigrations`
- [x] All existing tests pass: `go test ./...`
- [x] New store methods compile and have unit tests
- [x] DKIM encryption round-trip test passes: encrypt → decrypt = original PEM
- [x] Domain canonicalization: `"Acme.Com."` → `"acme.com"`, `"ACME.com"` → `"acme.com"`
- [x] Pending domain expiry deletes stale claims
- [x] Partial unique index allows multiple pending claims for the same domain but blocks duplicate verified domains

#### Manual Verification:
- [ ] `org_domains` table exists with correct columns after migration
- [ ] `inboxes.org_domain_id` column exists and accepts null (legacy inboxes)
- [ ] `plan_entitlements.max_domains` and `org_entitlements.max_domains` columns exist
- [ ] RLS policies work: org A cannot see org B's domains via `RunAsOrg`
- [ ] CHECK constraint rejects uppercase domains and trailing dots

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Domain Service — DKIM (via Library) & DNS Verification

### Overview
Create a `domains` package with DKIM keypair generation, DNS record verification (ownership, SPF, DKIM, DMARC, optional MX), and CNAME-based DKIM support. Use the `github.com/emersion/go-msgauth` library for DKIM operations instead of hand-rolling RFC 6376.

### Changes Required

#### 1. Add DKIM Library Dependency
**Command**: `go get github.com/emersion/go-msgauth`

The `go-msgauth` library handles:
- DKIM signature generation with correct canonicalization (`relaxed/relaxed`)
- Header folding rules, CRLF normalization, body length handling
- Tested against known DKIM test vectors
- We own key management and selector logic; the library handles crypto/canonicalization.

#### 2. DKIM Key Generation
**File**: `internal/domains/dkim.go`

```go
package domains

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/base64"
	"encoding/pem"
)

const DKIMKeyBits = 2048

// GenerateDKIMKeypair generates an RSA-2048 keypair and returns PEM-encoded
// private key and the base64-encoded public key (for DNS TXT record).
func GenerateDKIMKeypair() (privateKeyPEM string, publicKeyBase64 string, err error)

// GenerateDKIMSelector generates a unique selector per domain registration.
// Format: "nerve" + year + random suffix (e.g., "nerve2026a").
// Stored in org_domains.dkim_selector. Avoids collisions with existing selectors.
func GenerateDKIMSelector() string
```

#### 3. DNS Verification Service
**File**: `internal/domains/verifier.go`

```go
package domains

type VerificationResult struct {
	OwnershipVerified bool
	MXVerified        bool
	SPFVerified       bool
	DKIMVerified      bool
	DMARCVerified     bool
	OutboundReady     bool   // ownership + SPF + DKIM + DMARC all pass
	InboundReady      bool   // OutboundReady + MX passes
	Details           map[string]string // human-readable details per check
}

type Verifier struct {
	ExpectedMXHosts    []string
	ExpectedSPFInclude string
	DKIMCNAMEZone      string   // e.g., "_domainkey.nerve.email" for CNAME-based DKIM
	Resolver           *net.Resolver
}

// VerifyDomain checks all DNS records for a domain.
// MX verification is optional — if MX is not verified, the domain is outbound-only.
func (v *Verifier) VerifyDomain(ctx context.Context, domain string, dkimSelector string, expectedDKIMPublicKey string, verificationToken string, dkimMethod string) VerificationResult
```

**DNS checks performed:**

| Check | Record Type | What We Look For | Required For |
|-------|-------------|------------------|--------------|
| Ownership | TXT | `_nerve-verify.{domain}` contains `nerve-verification=<token>` | All |
| SPF | TXT | `v=spf1` record containing `ExpectedSPFInclude` (semantic parse, not string equality; accept multi-string TXT) | Outbound |
| DKIM (CNAME) | CNAME | `{selector}._domainkey.{domain}` → `{selector}-{domain}._domainkey.nerve.email` | Outbound (preferred) |
| DKIM (TXT) | TXT | `{selector}._domainkey.{domain}` contains `v=DKIM1` with matching `p=` (handle multi-string TXT, folding) | Outbound (fallback) |
| DMARC | TXT | `_dmarc.{domain}` contains `v=DMARC1` with `p=none` or stricter (`quarantine`, `reject`) | Outbound |
| MX | MX | At least one MX record pointing to `ExpectedMXHosts` | Inbound (optional) |

**Important parsing rules (from expert feedback):**
- SPF records can span multiple TXT strings — concatenate before matching
- Accept DMARC policies stricter than `p=none` (`quarantine`, `reject`)
- DKIM records can be split and folded — handle multi-string TXT correctly
- Keep parsing tolerant; don't require exact template match

#### 4. DNS Instructions Generator
**File**: `internal/domains/instructions.go`

```go
// DNSInstructions returns the DNS records a tenant needs to add.
// Uses CNAME-based DKIM by default (dkimMethod="cname"), with TXT as fallback.
func DNSInstructions(domain, dkimSelector, dkimPublicKeyBase64, verificationToken string, mxHosts []string, spfInclude string, dkimMethod string) []DNSRecord

type DNSRecord struct {
	Type     string `json:"type"`      // "MX", "TXT", "CNAME"
	Host     string `json:"host"`      // e.g., "@", "_dmarc", "nerve2026a._domainkey"
	Value    string `json:"value"`     // record value
	Priority int    `json:"priority"`  // for MX records
	Purpose  string `json:"purpose"`   // human-readable explanation
	Required bool   `json:"required"`  // false for MX (optional for outbound-only)
}
```

Returns records (CNAME method):
1. **Ownership TXT** (required): `_nerve-verify.acme.com` → `nerve-verification=<token>`
2. **SPF TXT** (required): `acme.com` → `v=spf1 include:spf.nerve.email ~all`
3. **DKIM CNAME** (required): `nerve2026a._domainkey.acme.com` → `nerve2026a-acme-com._domainkey.nerve.email`
4. **DMARC TXT** (required): `_dmarc.acme.com` → `v=DMARC1; p=none; rua=mailto:dmarc@acme.com`
5. **MX** (optional): `acme.com` → `mx.nerve.email` (priority 10) — only needed for inbound

**CNAME-based DKIM advantages:**
- Nerve hosts the actual DKIM TXT record on the `nerve.email` DNS zone
- Tenant creates a simple CNAME (no copy-paste of long public key)
- Nerve can rotate DKIM keys without tenant DNS changes
- Reduces DNS formatting errors significantly

For tenants who cannot create CNAME records, fall back to direct TXT method (stored in `dkim_method` column).

#### 5. Configuration Additions
**File**: `internal/config/config.go`

Add to the `Cloud` struct:

```go
Cloud struct {
	Mode           bool     `yaml:"mode"`
	PublicBaseURL  string   `yaml:"public_base_url"`
	MXHosts        []string `yaml:"mx_hosts"`         // e.g., ["mx.nerve.email"]
	SPFInclude     string   `yaml:"spf_include"`       // e.g., "spf.nerve.email"
	DKIMCNAMEZone  string   `yaml:"dkim_cname_zone"`   // e.g., "_domainkey.nerve.email"
} `yaml:"cloud"`
```

Environment overrides: `NM_CLOUD_MX_HOSTS` (comma-separated), `NM_CLOUD_SPF_INCLUDE`, `NM_CLOUD_DKIM_CNAME_ZONE`.

### Success Criteria

#### Automated Verification:
- [ ] `go test ./internal/domains/...` passes
- [ ] DKIM keypair generation produces valid 2048-bit RSA keys
- [ ] DKIM selector generation produces unique selectors (e.g., `nerve2026a`)
- [ ] DNS verifier correctly identifies passing/failing records (using mock resolver in tests)
- [ ] DNS verifier handles multi-string TXT records, DMARC `p=quarantine`/`p=reject`
- [ ] CNAME-based DKIM verification works alongside TXT-based fallback
- [ ] Instructions generator returns correct record formats for both CNAME and TXT methods
- [ ] Outbound-only mode: MX failure does not prevent `OutboundReady=true`
- [ ] `go build ./...` passes
- [ ] All existing tests pass: `go test ./...`

#### Manual Verification:
- [ ] Generated DKIM public key can be validated with `openssl rsa -pubin -text`
- [ ] DNS instructions match what a real domain registrar expects
- [ ] CNAME-based DKIM instructions are simpler than TXT-based

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Control Plane API — Domain CRUD, Inbox Creation & Rate Limiting

### Overview
Add API endpoints for domain management (add, list, verify, delete) and inbox creation. Wire up DNS verification, entitlement checks, domain limit enforcement, and verification rate limiting.

### Changes Required

#### 1. New API Endpoints
**File**: `internal/cloudapi/handler.go`

Register new routes in `RegisterRoutes`:

```go
mux.HandleFunc("/v1/domains", h.handleDomains)           // POST=add, GET=list
mux.HandleFunc("/v1/domains/verify", h.handleVerifyDomain) // POST (rate-limited)
mux.HandleFunc("/v1/domains/delete", h.handleDeleteDomain) // POST
mux.HandleFunc("/v1/domains/dns", h.handleDomainDNS)       // GET
mux.HandleFunc("/v1/inboxes", h.handleCreateInbox)         // POST
```

**`POST /v1/domains`** — Add domain to org
- Auth: `requireBillingAdmin`
- Input: `{ "org_id": "...", "domain": "acme.com", "dkim_method": "cname" }`
- Canonicalizes domain via `CanonicalizeDomain()` (lowercase, strip trailing dot, validate hostname)
- Calls `EnforceDomainLimit` (new, checks `max_domains` entitlement)
- Calls `ExpirePendingDomains` to garbage-collect stale claims before uniqueness check
- Checks domain uniqueness against verified/active domains (partial unique index)
- Generates DKIM keypair via `domains.GenerateDKIMKeypair()`
- Generates unique selector via `domains.GenerateDKIMSelector()`
- Encrypts private key via `domains.EncryptDKIMKey()` before storage
- Generates verification token: `nerve-verification=<random-hex>`
- Sets `expires_at = now() + 7 days` for the pending claim
- Inserts into `org_domains` with status `"pending"`
- Returns: `{ "domain_id": "...", "domain": "acme.com", "status": "pending", "dns_records": [...] }`

**`GET /v1/domains?org_id=...`** — List domains for org
- Auth: `authenticatePrincipal` (or `requireBillingAdmin` with explicit org_id for bootstrap key)
- Returns: `[{ "domain_id": "...", "domain": "acme.com", "status": "active", "outbound_ready": true, "inbound_ready": false, ... }]`

**`POST /v1/domains/verify`** — Trigger DNS verification (rate-limited)
- Auth: `requireBillingAdmin`
- **Rate limit: max 3 attempts per minute per domain, cached "failed" result for 30 seconds**
- Input: `{ "domain_id": "..." }`
- Runs `Verifier.VerifyDomain()` against the domain
- Updates verification fields in DB
- If outbound checks pass (ownership + SPF + DKIM + DMARC), transitions to `"verified_dns"`
- If MX also passes and user wants inbound, sets `inbound_enabled=true`
- Returns: `{ "status": "verified_dns", "outbound_ready": true, "inbound_ready": false, "mx": false, "spf": true, "dkim": true, "dmarc": true, "details": {...} }`

**`GET /v1/domains/dns?domain_id=...`** — Get required DNS records
- Auth: `authenticatePrincipal`
- Returns the `DNSInstructions` for the domain (the records the tenant needs to add)

**`POST /v1/domains/delete`** — Remove domain
- Auth: `requireBillingAdmin`
- Input: `{ "domain_id": "..." }`
- Only allowed if no active inboxes exist on this domain (check `inboxes.org_domain_id`)
- Deletes from `org_domains`

**`POST /v1/inboxes`** — Create inbox on verified domain
- Auth: `requireBillingAdmin`
- Input: `{ "org_id": "...", "address": "support@acme.com" }`
- Validates: domain part of address must belong to org and be active (status `"active"`)
- Sets `org_domain_id` FK on the inbox
- Calls `EnforceInboxLimit` (now actually wired in)
- Inserts inbox into DB
- Returns: `{ "inbox_id": "...", "address": "support@acme.com" }`

#### 2. Domain Limit Enforcement
**File**: `internal/cloudapi/handler.go`

```go
func (h *Handler) EnforceDomainLimit(ctx context.Context, orgID string) error {
	// Same pattern as EnforceInboxLimit but checks max_domains
}
```

#### 3. Verification Rate Limiter
**File**: `internal/cloudapi/ratelimit.go`

```go
// VerifyRateLimiter limits DNS verification attempts per domain.
// Uses Redis (already in the stack) or in-memory cache.
// Max 3 attempts per minute per domain_id.
// Caches "failed" results for 30 seconds to prevent retry storms.
type VerifyRateLimiter struct {
	Redis *redis.Client  // or in-memory fallback
}

func (r *VerifyRateLimiter) Allow(ctx context.Context, domainID string) (bool, error)
```

#### 4. Handler Dependencies
**File**: `internal/cloudapi/handler.go`

Add to `Handler` struct:

```go
type Handler struct {
	Config      config.Config
	Store       *store.Store
	Auth        *auth.Service
	Billing     BillingWebhookProcessor
	Checkout    BillingCheckoutProvider
	Tokens      ServiceTokenIssuer
	Domains     *domains.Verifier     // NEW
	RateLimiter *VerifyRateLimiter    // NEW
}
```

#### 5. Wire up in main.go
**File**: `cmd/nerve-control-plane/main.go`

Create `domains.Verifier` and `VerifyRateLimiter` with config values and pass to `NewHandler`.

### Success Criteria

#### Automated Verification:
- [ ] `go test ./internal/cloudapi/...` passes with new handler tests
- [ ] Domain creation returns DNS instructions with CNAME-based DKIM
- [ ] Domain canonicalization: `"ACME.COM."` → `"acme.com"` in API response
- [ ] Domain verification with mock DNS returns correct status
- [ ] Rate limiter blocks 4th verification attempt within 1 minute
- [ ] `EnforceDomainLimit` blocks when `max_domains` exceeded
- [ ] Inbox creation on unverified domain returns 400
- [ ] Inbox creation on active domain succeeds and sets `org_domain_id` FK
- [ ] `EnforceInboxLimit` correctly blocks when quota exceeded
- [ ] Domain deletion blocked when active inboxes exist (FK check)
- [ ] Pending domain expiry works: stale 7-day claims are cleaned up
- [ ] `go build ./...` passes
- [ ] All existing tests pass: `go test ./...`

#### Manual Verification:
- [ ] Full flow: add domain → get DNS records → verify → create inbox (using curl)
- [ ] Duplicate verified domain returns 409 Conflict
- [ ] Multiple pending claims for the same domain are allowed (different orgs)
- [ ] Cross-org domain access blocked by RLS
- [ ] Rapid-fire verification attempts are rate-limited

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 4.

---

## Phase 4: Outbound SMTP — Per-Inbox From, DKIM Signing (Library), STARTTLS & Stable HELO

### Overview
Update the SMTP sender to use per-inbox From addresses, sign outbound emails with DKIM using `go-msgauth`, negotiate STARTTLS with the relay, use a stable infrastructure HELO domain, and ensure correct SPF alignment via envelope sender.

### Changes Required

#### 1. DKIM Signer (Using go-msgauth Library)
**File**: `internal/domains/signer.go`

```go
package domains

import (
	"bytes"
	"crypto/rsa"

	"github.com/emersion/go-msgauth/dkim"
)

// SignMessage signs a raw RFC 822 message with DKIM using go-msgauth.
// Returns the signed message (DKIM-Signature header prepended).
func SignMessage(message []byte, privateKey *rsa.PrivateKey, domain, selector string) ([]byte, error) {
	opts := &dkim.SignOptions{
		Domain:   domain,
		Selector: selector,
		Signer:   privateKey,
		HeaderKeys: []string{"from", "to", "subject", "date", "message-id"},
	}
	var buf bytes.Buffer
	// go-msgauth handles relaxed/relaxed canonicalization, header folding,
	// CRLF normalization, body hashing — all the RFC 6376 traps.
	if err := dkim.Sign(&buf, bytes.NewReader(message), opts); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
```

**Why `go-msgauth` instead of hand-rolling:**
- DKIM canonicalization has subtle edge cases (header folding, CRLF, body length, MIME boundaries)
- `go-msgauth` is tested against known DKIM test vectors
- We still own key management, selector logic, and key encryption — the library handles the crypto/wire format

#### 2. Update SendReply to Use Per-Inbox From
**File**: `internal/tools/service.go`

Change `SendReply` (line 295-298) from:
```go
from := s.Config.SMTP.From
if from == "" {
    from = "dev@local.neuralmail"
}
```

To:
```go
// Use the inbox's own address as the From
inbox, err := st.GetInbox(scopedCtx, inboxID)
if err != nil {
    return nil, fmt.Errorf("failed to load inbox: %w", err)
}
from := inbox.Address
```

Also requires adding a `GetInbox` method to the store that returns the full inbox record (not just ID).

#### 3. Update sendSMTP — STARTTLS, Stable HELO, Envelope Sender, DKIM
**File**: `internal/tools/service.go`

Refactor `sendSMTP` to:
1. Accept a `*rsa.PrivateKey`, `domain`, and `selector` for DKIM (nil key = no DKIM)
2. Use a **stable infrastructure HELO domain** from config (`NM_SMTP_HELO_DOMAIN`, e.g., `mx.nerve.email`), NOT the tenant domain
3. **Negotiate STARTTLS** when the relay supports it (use `client.StartTLS` with `InsecureSkipVerify` for internal relays, strict for external)
4. Set **envelope sender** (`client.Mail(from)`) to match the inbox address — ensures SPF alignment (already correct in current code at line 381, but now explicitly documented)
5. Compose message with proper RFC 822 headers using `net/mail` or `mime`: `Message-ID`, `Date`, `Content-Type`, `MIME-Version`
6. If DKIM key provided, sign the composed message via `domains.SignMessage()` before sending

```go
func (s *Service) sendSMTP(from, to, subject, body string, dkimKey *rsa.PrivateKey, dkimDomain, dkimSelector string) error {
	host := s.Config.SMTP.Host
	addr := fmt.Sprintf("%s:%d", host, s.Config.SMTP.Port)

	// Use stable infrastructure HELO, not tenant domain
	helo := s.Config.SMTP.HeloDomain  // e.g., "mx.nerve.email"
	if helo == "" {
		helo = "localhost"
	}

	conn, err := net.Dial("tcp", addr)
	// ...
	client, _ := smtp.NewClient(conn, host)
	client.Hello(helo)

	// Negotiate STARTTLS if available
	if ok, _ := client.Extension("STARTTLS"); ok {
		tlsConfig := &tls.Config{ServerName: host}
		client.StartTLS(tlsConfig)
	}

	// AUTH if configured
	// ...

	// Envelope sender matches From (SPF alignment)
	client.Mail(from)
	client.Rcpt(to)

	// Compose RFC 822 message with proper headers
	msg := composeMessage(from, to, subject, body)

	// DKIM sign if key available
	if dkimKey != nil {
		msg, _ = domains.SignMessage(msg, dkimKey, dkimDomain, dkimSelector)
	}

	writer, _ := client.Data()
	writer.Write(msg)
	writer.Close()
	client.Quit()
}
```

#### 4. Message Composition Helper
**File**: `internal/tools/compose.go`

```go
// composeMessage builds a proper RFC 5322 message with:
// - Message-ID: <uuid@helo-domain>
// - Date: RFC 2822 format
// - MIME-Version: 1.0
// - Content-Type: text/plain; charset=utf-8
// - From, To, Subject headers
// Returns raw message bytes with CRLF line endings.
func composeMessage(from, to, subject, body string) []byte
```

#### 5. Update Outbound Domain Guard
**File**: `internal/tools/service.go`

Replace the hardcoded `@local.neuralmail` guard (line 303-304) with a check against verified org domains:

```go
// In cloud mode, check that the From address domain is active for this org
// In self-hosted mode (AllowOutbound=false), only allow local.neuralmail
// In self-hosted mode (AllowOutbound=true), allow anything
```

The outbound domain allowlist (`Config.Security.OutboundDomainAllowlist`) continues to apply as an additional check for recipient domains.

#### 6. Store: GetInbox Method
**File**: `internal/store/store.go`

```go
type Inbox struct {
	ID          string
	OrgID       string
	Address     string
	OrgDomainID sql.NullString  // FK to org_domains
	Status      string
	Labels      []string
	CreatedAt   time.Time
}

func (s *Store) GetInbox(ctx context.Context, inboxID string) (Inbox, error)
```

#### 7. Configuration Additions
**File**: `internal/config/config.go`

```go
SMTP struct {
	Host       string `yaml:"host"`
	Port       int    `yaml:"port"`
	From       string `yaml:"from"`
	Username   string `yaml:"username"`
	Password   string `yaml:"password"`
	HeloDomain string `yaml:"helo_domain"`  // NEW: stable infrastructure HELO (e.g., "mx.nerve.email")
} `yaml:"smtp"`
```

Environment override: `NM_SMTP_HELO_DOMAIN`.

### Success Criteria

#### Automated Verification:
- [ ] `go-msgauth` DKIM signer produces valid signatures (verified against public key in test)
- [ ] DKIM signature verifiable with `go-msgauth/dkim.Verify()` in unit test
- [ ] `sendSMTP` with DKIM key prepends `DKIM-Signature` header
- [ ] `sendSMTP` without DKIM key works as before (backward compatible)
- [ ] `SendReply` uses inbox address as From, not global config
- [ ] HELO domain is the configured infrastructure hostname, not the tenant domain
- [ ] STARTTLS is negotiated when the relay advertises it
- [ ] Envelope sender (`MAIL FROM`) matches the From header address (SPF alignment)
- [ ] Composed messages have `Message-ID`, `Date`, `Content-Type`, `MIME-Version` headers
- [ ] Outbound guard allows sending from active org domains in cloud mode
- [ ] `go test ./...` passes

#### Manual Verification:
- [ ] Send an email from a verified custom domain
- [ ] Check email headers show correct DKIM-Signature
- [ ] Verify DKIM signature with `opendkim-testkey` or mail-tester.com
- [ ] Emails from unverified domains are blocked
- [ ] HELO is stable across different tenant sends (check SMTP logs)
- [ ] `Return-Path` matches the From address domain (SPF alignment)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 5.

---

## Phase 5: Inbound Mail Routing — Stalwart Webhook & Provisioning State Machine

### Overview
Configure Stalwart to accept mail for custom domains and push inbound emails to Nerve via HTTP webhook (not polling). Implement a provisioning state machine to handle Stalwart setup failures gracefully. Extend the existing `/jmap/push` endpoint stub.

### Architecture Decision: Webhook over Polling

The original plan proposed one `PollLoop` goroutine per inbox. Both expert reviews identified this as a scalability bottleneck (1:1 TCP connections, thundering herd at scale). Instead:

**Webhook-based inbound (chosen approach):**
- Configure Stalwart to HTTP POST to Nerve when mail arrives (via Sieve script or webhook integration)
- Extend the existing `/jmap/push` endpoint at `internal/app/app.go:119` to accept inbound mail events
- Event-driven: zero polling overhead, instant delivery
- Scales to arbitrary inbox count without connection fan-out

**Fallback for self-hosted:** Self-hosted deployments that cannot configure Stalwart webhooks can still use the existing `PollLoop` (single-inbox or worker-pool with jitter).

### Changes Required

#### 1. Stalwart Domain Configuration
**File**: Documentation / deployment config

For production deployment, Stalwart needs to be configured to:
1. Accept mail for verified domains (via admin API)
2. Push received mail to Nerve via HTTP webhook

**Self-hosted**: Tenant manually configures their Stalwart instance:
- Add domain to Stalwart's accepted domains list
- Create JMAP account for the inbox address
- Configure webhook or JMAP credentials in Nerve config

**Cloud**: Automate via Stalwart admin API:
- `POST /api/domain` to register new domains
- `POST /api/account` to create mailbox accounts
- Configure Sieve webhook script to POST to `https://<nerve-host>/jmap/push`

#### 2. Stalwart Admin Client (Cloud Mode)
**File**: `internal/stalwart/client.go`

```go
package stalwart

type Client struct {
	BaseURL  string
	Username string
	Password string
}

// AddDomain registers a domain with Stalwart for mail acceptance.
// Idempotent: repeated calls for the same domain do not error.
func (c *Client) AddDomain(ctx context.Context, domain string) error

// CreateAccount creates a mailbox account in Stalwart.
// Idempotent: repeated calls for the same email do not error (upsert semantics).
func (c *Client) CreateAccount(ctx context.Context, email, password string) error

// ConfigureWebhook sets up a Sieve script to POST inbound mail to the Nerve webhook URL.
func (c *Client) ConfigureWebhook(ctx context.Context, domain, webhookURL, pushSecret string) error

// DeleteAccount removes a mailbox account.
func (c *Client) DeleteAccount(ctx context.Context, email string) error

// DeleteDomain removes a domain (only if no accounts remain).
func (c *Client) DeleteDomain(ctx context.Context, domain string) error
```

All operations are **idempotent** — repeated calls do not fail. This is critical for the provisioning state machine.

#### 3. Configuration for Stalwart Admin
**File**: `internal/config/config.go`

Add to config:

```go
Stalwart struct {
	AdminURL      string `yaml:"admin_url"`
	AdminUsername  string `yaml:"admin_username"`
	AdminPassword  string `yaml:"admin_password"`
} `yaml:"stalwart"`
```

Environment overrides: `NM_STALWART_ADMIN_URL`, `NM_STALWART_ADMIN_USERNAME`, `NM_STALWART_ADMIN_PASSWORD`.

#### 4. Provisioning State Machine
**File**: `internal/cloudapi/handler.go`

When a domain's DNS is verified, it enters the provisioning state machine:

```
pending → verified_dns → provisioning → active
                ↓              ↓
             failed         failed (retry-able)
```

In `handleVerifyDomain`, after DNS checks pass:
1. Set status to `"verified_dns"`
2. If cloud mode and Stalwart admin configured, begin provisioning:
   - Set status to `"provisioning"`
   - Call `stalwart.AddDomain(domain)` — idempotent
   - For each inbox on this domain, call `stalwart.CreateAccount(address, generatedPassword)` — idempotent
   - If inbound_enabled, call `stalwart.ConfigureWebhook(domain, webhookURL, pushSecret)` — idempotent
   - On success: set status to `"active"`
   - On failure: keep status as `"provisioning"` (can be retried by re-verifying)
3. If self-hosted (no Stalwart admin), go directly to `"active"` after DNS verification

#### 5. Extend `/jmap/push` Webhook Endpoint
**File**: `internal/app/app.go`

Extend the existing `handleJMAPPush` (line 133-140) to:
1. Validate `X-NM-Push-Secret` header (already implemented)
2. Parse the webhook payload (Stalwart push format)
3. Extract recipient address, subject, body, headers
4. Look up the inbox by recipient address
5. Insert the message via `store.InsertMessageWithThread()`
6. Push embedding job to queue
7. Return 200 OK

```go
func (a *App) handleJMAPPush(w http.ResponseWriter, r *http.Request) {
	secret := r.Header.Get("X-NM-Push-Secret")
	if a.Config.JMAP.PushSecret != "" && secret != a.Config.JMAP.PushSecret {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
		return
	}

	// Parse Stalwart webhook payload
	var payload struct {
		Recipient string `json:"recipient"`
		From      string `json:"from"`
		Subject   string `json:"subject"`
		Text      string `json:"text"`
		HTML      string `json:"html"`
		MessageID string `json:"message_id"`
		// ... additional fields as needed
	}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}

	// Look up inbox by recipient address
	inbox, err := a.Store.GetInboxByAddress(r.Context(), payload.Recipient)
	// ... insert message, push to queue
	w.WriteHeader(http.StatusOK)
}
```

#### 6. New Store Method
**File**: `internal/store/store.go`

```go
// GetInboxByAddress retrieves an inbox by its email address.
func (s *Store) GetInboxByAddress(ctx context.Context, address string) (Inbox, error)
```

#### 7. Retain PollLoop for Self-Hosted Fallback
**File**: `internal/app/app.go`

The existing `PollLoop` (line 170-189) is retained for self-hosted deployments. For cloud, the webhook is the primary inbound mechanism. Add a worker-pool wrapper with jitter for self-hosted multi-inbox polling:

```go
// PollLoopWorkerPool manages a pool of N workers that iterate through active inboxes.
// Each poll is staggered with random jitter to prevent thundering herd.
// Used only in self-hosted mode when Stalwart webhooks are not configured.
func (a *App) PollLoopWorkerPool(ctx context.Context, workers int) error
```

### Success Criteria

#### Automated Verification:
- [ ] Stalwart client CRUD operations work against a test Stalwart instance (mock HTTP)
- [ ] All Stalwart operations are idempotent (repeated calls don't error)
- [ ] Config loads Stalwart admin settings from env vars
- [ ] Provisioning state machine transitions correctly: `pending → verified_dns → provisioning → active`
- [ ] Provisioning failure keeps status as `provisioning` (retryable)
- [ ] `/jmap/push` endpoint parses webhook payload and inserts message
- [ ] `/jmap/push` rejects requests without valid push secret
- [ ] `GetInboxByAddress` returns correct inbox
- [ ] `go build ./...` passes
- [ ] `go test ./...` passes

#### Manual Verification:
- [ ] Send an email to `support@acme.com` where MX points to Stalwart
- [ ] Stalwart webhook fires → Nerve `/jmap/push` receives the message
- [ ] Email arrives in the correct Nerve inbox (not mixed with other orgs)
- [ ] New inbox creation triggers Stalwart account provisioning (cloud mode)
- [ ] Deleting an inbox removes the Stalwart account
- [ ] Self-hosted fallback: PollLoop worker pool with jitter works for multi-inbox

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding to Phase 6.

---

## Phase 6: Dashboard UI — Domain Management Page

### Overview
Add a "Domains" page to the dashboard where tenants can add domains, view required DNS records (CNAME-based DKIM by default), trigger verification, see separate outbound/inbound readiness indicators, and create inboxes.

### Changes Required

#### 1. BFF API Routes
**File**: `dashboard/src/app/api/domains/route.ts`

```typescript
// GET /api/domains — list domains for current org
// POST /api/domains — add domain
export async function GET(request: NextRequest): Promise<NextResponse>
export async function POST(request: NextRequest): Promise<NextResponse>
```

**File**: `dashboard/src/app/api/domains/verify/route.ts`

```typescript
// POST /api/domains/verify — trigger DNS verification
export async function POST(request: NextRequest): Promise<NextResponse>
```

**File**: `dashboard/src/app/api/domains/dns/route.ts`

```typescript
// GET /api/domains/dns?domain_id=... — get DNS records
export async function GET(request: NextRequest): Promise<NextResponse>
```

**File**: `dashboard/src/app/api/domains/delete/route.ts`

```typescript
// POST /api/domains/delete — delete domain
export async function POST(request: NextRequest): Promise<NextResponse>
```

**File**: `dashboard/src/app/api/inboxes/route.ts`

```typescript
// POST /api/inboxes — create inbox
export async function POST(request: NextRequest): Promise<NextResponse>
```

#### 2. Nerve API Client Extensions
**File**: `dashboard/src/lib/nerve-api.ts`

```typescript
export interface OrgDomain {
  domain_id: string;
  domain: string;
  status: "pending" | "verified_dns" | "provisioning" | "active" | "failed";
  outbound_ready: boolean;
  inbound_ready: boolean;
  inbound_enabled: boolean;
  mx_verified: boolean;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  dkim_method: "cname" | "txt";
  dns_records: DNSRecord[];
  expires_at?: string;  // ISO 8601, only for pending domains
}

export interface DNSRecord {
  type: string;
  host: string;
  value: string;
  priority?: number;
  purpose: string;
  required: boolean;
}

export async function addDomain(orgId: string, domain: string, dkimMethod?: "cname" | "txt"): Promise<OrgDomain>
export async function listDomains(orgId: string): Promise<OrgDomain[]>
export async function verifyDomain(domainId: string): Promise<OrgDomain>
export async function getDomainDNS(domainId: string): Promise<{ dns_records: DNSRecord[] }>
export async function deleteDomain(domainId: string): Promise<void>
export async function createInbox(orgId: string, address: string): Promise<{ inbox_id: string }>
```

#### 3. Domains Page
**File**: `dashboard/src/app/(dashboard)/domains/page.tsx`

Page layout:
1. **Header**: "Domains" with "Add Domain" button
2. **Domain list**: Cards for each domain showing:
   - Domain name and status badge (pending/verified_dns/provisioning/active/failed)
   - **Readiness indicators**: "Outbound ready" / "Inbound ready" / "Inbound not configured" badges
   - Per-check status indicators (Ownership, SPF, DKIM, DMARC, MX)
   - MX shown as optional with explanation: "Only needed if you want to receive email through Nerve"
   - "Verify" button (triggers DNS re-check)
   - "View DNS Records" expandable section
   - "Delete" button (with confirmation)
   - Pending domains show expiry countdown
3. **Add Domain dialog**: Input field for domain name, DKIM method selector (CNAME recommended / TXT fallback), submits to API
4. **DNS Records display**: Table showing Type, Host, Value, Purpose, Required for each record
   - Copy-to-clipboard button for each value
   - Required/Optional column to clarify MX is optional
   - CNAME records are shorter and simpler than TXT DKIM records
5. **Create Inbox section** (only for active domains): Input for local part (e.g., "support"), dropdown for active domain, creates `support@acme.com`

#### 4. Sidebar Navigation
**File**: `dashboard/src/components/sidebar.tsx`

Add "Domains" to `NAV_ITEMS`:

```typescript
const NAV_ITEMS = [
  { href: "/", label: "Overview" },
  { href: "/domains", label: "Domains" },
  { href: "/api-keys", label: "API Keys" },
  { href: "/billing", label: "Billing" },
] as const;
```

### Success Criteria

#### Automated Verification:
- [ ] `npm run build` passes (dashboard)
- [ ] `npm run lint` passes
- [ ] TypeScript compilation succeeds: `npx tsc --noEmit`

#### Manual Verification:
- [ ] Navigate to /domains page
- [ ] Add a new domain → see "pending" status, expiry countdown, and DNS records
- [ ] CNAME-based DKIM instructions are simpler than TXT (short CNAME value vs long public key)
- [ ] DNS records show Required/Optional column (MX is optional)
- [ ] Click "Verify" → see per-check results update
- [ ] After outbound checks pass → "Outbound ready" badge appears
- [ ] After MX also passes → "Inbound ready" badge appears
- [ ] Create an inbox on an active domain
- [ ] Delete a domain with no inboxes → succeeds
- [ ] Delete a domain with active inboxes → blocked with error message
- [ ] Rapid "Verify" clicks show rate-limit feedback

**Implementation Note**: After completing this phase, the full custom domain setup flow is complete.

---

## Testing Strategy

### Unit Tests

- **`internal/domains/dkim_test.go`**: Keypair generation, key format validation, selector generation
- **`internal/domains/crypto_test.go`**: AES-GCM encryption round-trip, invalid key rejection
- **`internal/domains/canonical_test.go`**: Domain canonicalization edge cases (uppercase, trailing dot, invalid)
- **`internal/domains/verifier_test.go`**: Mock DNS resolver with passing/failing scenarios for each check type, multi-string TXT, DMARC `p=quarantine`, CNAME verification
- **`internal/domains/signer_test.go`**: DKIM signature generation via `go-msgauth` and verification against known test vectors
- **`internal/domains/instructions_test.go`**: Record format correctness for both CNAME and TXT methods
- **`internal/cloudapi/handler_test.go`**: Domain CRUD handlers, inbox creation, entitlement enforcement, rate limiting
- **`internal/cloudapi/ratelimit_test.go`**: Verification rate limiter unit tests
- **`internal/stalwart/client_test.go`**: HTTP client with mock Stalwart server, idempotency tests
- **`internal/store/migration_test.go`**: Migration 0005 applies cleanly, RLS works, partial unique index works
- **`internal/tools/compose_test.go`**: RFC 5322 message composition, CRLF, headers

### Integration Tests

- Full domain lifecycle: create → get DNS → verify → provision → create inbox → send email → receive email via webhook
- Cross-org isolation: org A cannot access org B's domains
- Entitlement enforcement: inbox and domain creation blocked when quota exceeded
- Pending domain expiry: stale claims cleaned up after 7 days
- Provisioning retry: `provisioning` status can be retried by re-verifying

### Manual Testing Steps

1. Add domain `test.example.com` via dashboard (CNAME method)
2. Configure DNS records at registrar (CNAME for DKIM is simpler than TXT)
3. Click "Verify" — watch ownership, SPF, DKIM, DMARC checks turn green
4. See "Outbound ready" badge (MX not required)
5. Optionally add MX record → re-verify → see "Inbound ready" badge
6. Create inbox `support@test.example.com`
7. Send an email from that inbox — verify DKIM signature in email headers
8. Send an email TO that inbox — verify it arrives in Nerve via webhook push

## Performance Considerations

- **DNS lookups**: DNS verification involves 5+ lookups per domain. Add 5-second timeout per lookup. Cache results for 5 minutes. Rate limit to 3 verifications per minute per domain.
- **DKIM signing**: RSA-2048 signing via `go-msgauth` is ~1ms per message. No performance concern.
- **Inbound webhook**: Zero polling overhead. Stalwart pushes mail to Nerve as it arrives. O(1) per incoming message.
- **Self-hosted polling fallback**: Worker pool with jitter. N workers poll across all inboxes. Stagger with random 0-5s jitter to prevent thundering herd.
- **DKIM private keys in DB**: Keys are encrypted (AES-GCM) and loaded per-send. For high-volume sending, cache decrypted `*rsa.PrivateKey` in memory keyed by domain (with TTL).
- **Pending domain cleanup**: Run `ExpirePendingDomains` on domain registration and daily via reconciliation cron.

## Migration Notes

- **Existing self-hosted deployments**: No impact. The `org_domains` table is additive. Existing inboxes with `local.neuralmail` addresses continue to work (`org_domain_id` is nullable). Domain verification is only required for new custom domains.
- **Existing cloud deployments**: Same — existing inboxes are unaffected. The `Config.SMTP.From` global setting continues as fallback when no inbox-specific address is available.
- **Stalwart upgrade**: Cloud deployments may need to upgrade Stalwart to enable the admin API and webhook support. Document the required Stalwart version.
- **New environment variables**: `NM_DKIM_ENCRYPTION_KEY` is required for cloud mode (DKIM key encryption). Generate with `openssl rand -base64 32`.

## Environment Variable Summary

New environment variables introduced:

| Variable | Default | Purpose |
|----------|---------|---------|
| `NM_CLOUD_MX_HOSTS` | (none) | Comma-separated MX hostnames for DNS instructions |
| `NM_CLOUD_SPF_INCLUDE` | (none) | SPF include domain for DNS instructions |
| `NM_CLOUD_DKIM_CNAME_ZONE` | (none) | DNS zone for CNAME-based DKIM (e.g., `_domainkey.nerve.email`) |
| `NM_DKIM_ENCRYPTION_KEY` | (none) | Base64-encoded 32-byte AES key for DKIM private key encryption |
| `NM_SMTP_HELO_DOMAIN` | `localhost` | Stable infrastructure HELO domain (e.g., `mx.nerve.email`) |
| `NM_STALWART_ADMIN_URL` | (none) | Stalwart admin API URL (cloud mode) |
| `NM_STALWART_ADMIN_USERNAME` | (none) | Stalwart admin username |
| `NM_STALWART_ADMIN_PASSWORD` | (none) | Stalwart admin password |

## Security Considerations

1. **DKIM private keys**: Encrypted at the application layer using AES-256-GCM before storage in PostgreSQL (`dkim_private_key_enc` column). The encryption key is loaded from `NM_DKIM_ENCRYPTION_KEY` environment variable, kept separate from the database. Access further gated by org RLS. Never returned in API responses — only the public key is exposed. Never logged.
2. **Domain ownership verification**: TXT record verification (`nerve-verification=<token>`) prevents domain hijacking. A random token is generated per registration. Pending claims expire after 7 days to prevent domain squatting.
3. **Domain claim DoS prevention**: Partial unique index only enforces uniqueness on verified/active domains. Pending claims are not globally unique and expire after 7 days.
4. **Inbox-to-domain enforcement**: DB-level FK (`inboxes.org_domain_id REFERENCES org_domains(id)`) prevents inboxes on unverified or arbitrary domains.
5. **Inbox address validation**: Only addresses on active domains can be created.
6. **Outbound guard**: Updated to check active org domains instead of hardcoded `@local.neuralmail`.
7. **SPF alignment**: Envelope sender (`MAIL FROM`) explicitly set to match the From header address, ensuring DMARC SPF alignment.
8. **HELO domain**: Stable infrastructure hostname (e.g., `mx.nerve.email`) used for all outbound SMTP, not per-tenant domains. Prevents deliverability issues with receivers that check HELO against PTR/A records.
9. **STARTTLS**: Outbound SMTP to Stalwart relay negotiates STARTTLS when available. Prevents plaintext credential transmission.
10. **Verification rate limiting**: `POST /v1/domains/verify` limited to 3 attempts per minute per domain. Prevents DNS amplification and control plane DoS.
11. **Stalwart admin credentials**: Stored as secrets, not in code or config files.
12. **Domain limits**: `max_domains` entitlement prevents abuse. Paid plans get higher limits.
13. **Webhook authentication**: Inbound push endpoint validates `X-NM-Push-Secret` header.

## References

- Existing control plane plan: `thoughts/shared/plans/2026-02-05-private-cloud-subscription-control-plane.md`
- Validation report: `thoughts/shared/implementations/2026-02-09-private-cloud-subscription-control-plane-validation.md`
- RFC 6376 (DKIM): https://datatracker.ietf.org/doc/html/rfc6376
- Stalwart admin API: https://stalw.art/docs/api/management/overview
- go-msgauth library: https://github.com/emersion/go-msgauth
- DKIM CNAME delegation: Standard practice used by Postmark, SendGrid, Mailgun

## Enhancement History

### 2026-02-11 Enhancement
Based on two expert security/email architecture reviews plus user directives, this plan was improved with:

**Security Hardening:**
- DKIM private key encryption (AES-256-GCM at app layer) — both reviewers flagged plain-text storage as critical
- Domain claim DoS prevention via partial unique index + 7-day pending expiry — reviewer 2 identified this
- Inbox-to-domain FK enforcement at DB level — reviewer 2 identified missing FK
- Domain canonicalization (lowercase, no trailing dot, CHECK constraint) — reviewer 2 identified gaps
- Verification rate limiting (3/min/domain) — both reviewers flagged endpoint abuse risk
- STARTTLS for internal SMTP — both reviewers flagged plaintext as high risk

**Architecture Improvements:**
- Webhook-based inbound (Stalwart → HTTP POST → Nerve) instead of poll-per-inbox — user directive + reviewer 1 scalability concern. Extends existing `/jmap/push` stub at `app.go:119`
- CNAME-based DKIM as primary method — user directive + both reviewers recommended. Enables key rotation without tenant DNS changes
- Outbound-only vs inbound+outbound mode — reviewer 2 UX recommendation. MX verification is optional
- Provisioning state machine (`pending → verified_dns → provisioning → active`) — reviewer 2 identified inconsistent state risk
- `max_domains` entitlement — reviewer 2 identified missing SaaS control

**Deliverability Fixes:**
- Stable HELO domain from config, not tenant domain — both reviewers flagged as high severity for deliverability
- Explicit SPF alignment documentation (envelope sender = inbox address) — reviewer 1 flagged
- Use `go-msgauth` library for DKIM signing instead of hand-rolling RFC 6376 — both reviewers strongly recommended
- Robust DNS TXT parsing (multi-string, accept stricter DMARC policies) — reviewer 2 identified
- Per-domain DKIM selectors (e.g., `nerve2026a`) instead of hardcoded `"nerve"` — both reviewers flagged collision risk

**Not incorporated:**
- RLS `cloud_mode` pattern refactoring — existing pattern across all tables (`0003_tenant_rls.sql`), separate codebase-wide concern
- Subdomain collision prevention — over-engineering for MVP; ownership verification handles the real threat
- JMAP session caching — moot since we're moving to webhooks

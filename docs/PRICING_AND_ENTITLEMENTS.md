# Pricing And Entitlements

## MVP Billing Boundary
- Stripe bills the fixed subscription fee only.
- Usage-based overage billing to Stripe is not enabled in MVP.

## Runtime Enforcement
- Runtime quotas and rate limits are enforced internally from `org_entitlements` and `org_usage_counters`.
- Usage events are recorded in `usage_events` for reconciliation/audit.
- Subscription lifecycle state (`trialing`, `active`, `past_due`, `canceled`, `unpaid`) controls MCP access based on local snapshots.

## Source Of Truth
- Stripe events update local `subscriptions` and `org_entitlements`.
- MCP request path reads only local entitlement snapshots.

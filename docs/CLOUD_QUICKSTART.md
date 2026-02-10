# Cloud Quickstart

## Stripe Webhook Reliability
- Billing state is synchronized from Stripe webhook deliveries into local tables.
- Runtime entitlement checks read only local DB snapshots; they do not call Stripe on request path.
- Duplicate webhook deliveries are deduplicated by `(provider, external_event_id)`.

## Retry And Incident Handling
- Failed webhook processing is stored with `status=failed` and the latest `error_message` in `webhook_events`.
- Re-delivered events with a failed status are reprocessed and can recover automatically after configuration/data fixes.
- If Stripe API is degraded or unavailable, runtime access control keeps serving from local `org_entitlements`.
- During incidents:
  - confirm webhook endpoint health and signature secrets
  - inspect `webhook_events` for failed records
  - replay failed events after remediation

## Operational Checks
- Monitor lag between Stripe event timestamps and local `processed_at`.
- Alert on sustained webhook failures and repeated retries.
- Verify `subscriptions` and `org_entitlements` change together for each lifecycle event.

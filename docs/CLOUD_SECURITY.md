# Cloud Security

## Secrets Handling Requirements
- Never commit cloud secrets into git.
- Production deployments must load secrets from a managed secrets system (for example AWS Secrets Manager, GCP Secret Manager, or Vault), not plaintext env files committed to source.

## Required Secrets
- `stripe_secret_key` / `NM_STRIPE_SECRET_KEY`
- `stripe_webhook_secret` / `NM_STRIPE_WEBHOOK_SECRET`
- OIDC signing and validation material:
  - issuer configuration
  - JWKS endpoint credentials/keys as applicable
  - any service-token signing keys if switched from unsigned test tokens to signed production tokens

## Operational Controls
- Rotate billing and auth secrets on a regular schedule.
- Restrict secret read permissions to runtime/control-plane workloads only.
- Audit secret access events and alert on anomalous access.
- Store distinct secrets per environment (dev/stage/prod).

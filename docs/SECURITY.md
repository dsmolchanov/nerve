# Security

## Threat Model (MVP)
- MCP tools can trigger outbound email and data access.
- Malicious tooling or prompt injection can exfiltrate sensitive data.

## Controls
- `/mcp` allows missing `Origin` only in dev mode.
- In non-dev mode, requests require `Origin` allowlist or `X-API-Key`.
- `/jmap/push` requires `X-NM-Push-Secret` when configured.
- Outbound send is disabled by default unless `NM_ALLOW_OUTBOUND=true`.
- `send_reply` refuses when `needs_human_approval=true` unless `NM_ALLOW_SEND_WITH_WARNINGS=true`.

## Reporting
Please report security issues to `security@nerve.email`.

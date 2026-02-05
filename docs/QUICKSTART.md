# Quickstart (5 minutes)

```bash
make up
make seed
make mcp-test
```

The Make targets default to `configs/dev/host.yaml` (localhost ports). To use another config:
```bash
CONFIG=configs/dev/cortex.yaml make seed
```

Open:
- `http://localhost:8088/healthz`
- `http://localhost:8088/debug`

## What You Should See
- `make seed` sends 5 demo emails (including outage + refund).
- `make mcp-test` returns `initialize` and `tools/list` responses.

## Defaults
- Domain: `local.neuralmail`
- User: `dev@local.neuralmail` / `devpass`

## Notes
If Stalwart is not configured, see `docs/STALWART_SETUP.md`.

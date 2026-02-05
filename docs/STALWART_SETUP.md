# Stalwart Setup (Local Dev)

The repo includes a working dev config at `configs/dev/stalwart.toml` and mounts it into the Stalwart container at `/opt/stalwart/etc/config.toml`.
It enables:
- JMAP on port 8080
- SMTP on port 25
- Local domain: `local.neuralmail`
- Mailbox identity: `dev@local.neuralmail`
- JMAP auth principal: `dev` / `devpass`

To boot the stack:
```bash
make up
```

If you need a custom config, edit `configs/dev/stalwart.toml` and restart the `stalwart` service.

If JMAP push is not working, polling will continue to ingest.

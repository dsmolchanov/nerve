# Stalwart Setup (Local Dev)

The provided `configs/dev/stalwart.toml` is a placeholder. Replace it with a real configuration that enables:
- JMAP on port 8080
- SMTP on port 25
- Local domain: `local.neuralmail`
- User: `dev@local.neuralmail` / `devpass`

After updating:
```bash
make up
```

If JMAP push is not working, polling will continue to ingest.

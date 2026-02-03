# Nerve MVP Delivery Plan (Enhanced)

## Summary
Deliver the full MVP for Nerve in a single GitHub repo (`dmitrymolchanov/neuralmail`) with a working local OSS stack, MCP tool surface, CI/CD workflows (including Docker publish and GitHub Pages deploy), and a bold landing page that matches the provided structure and copy.

Nerve positioning: open-source local engine plus a cloud control plane for deliverability, security, and scale.
Domain: `nerve.email`.

## Goals
- One command local stack that ingests email, normalizes threads, and exposes MCP tools.
- MCP tools that remove glue code for triage, extraction, drafting, and safe sending.
- Deterministic observability and replay for debugging AI actions.
- A landing page that clearly communicates the product moat and converts.

## Non-Goals
- Deliverability guarantees in OSS.
- Full-featured UI dashboard (only a minimal debug view).
- Multi-tenant cloud or enterprise compliance in MVP.
- Outbound SDR positioning.

## Key Decisions
- Vector store: Qdrant.
- Core service language: Go.
- MCP transport: Streamable HTTP at `/mcp` plus stdio mode.
- LLM providers: OpenAI, Ollama, and a Noop stub.
- Repo name: `dmitrymolchanov/neuralmail`.
- Landing CTA label: "Request Early Access" (assumption based on "Request").
- Engine vs product: `neuralmaild` is the OSS engine; Nerve is the product brand.

## Scope And Deliverables
- Local stack via `docker compose up` with Stalwart, Postgres, Redis, Qdrant, MinIO, and Nerve services.
- Go-based core server `neuralmaild` with config, storage, JMAP ingestion, vector search, MCP endpoints, and policy enforcement.
- Async worker for embeddings and summarization.
- Support autopilot primitives: triage, extract, draft-with-policy, send.
- GitHub repo with CI, Docker publish to GHCR, and GitHub Pages deploy for landing.
- Landing page in `site/` with the specified structure, copy, and styling.

## Repo Structure
- `cmd/neuralmaild`: service entrypoints (`serve`, `worker`, `mcp-stdio`).
- `cmd/neuralmail`: CLI for DX (`up`, `down`, `seed`, `doctor`, `send-test`, `mcp-test`).
- `internal/config`: YAML + env overrides.
- `internal/jmap`: JMAP push + polling.
- `internal/normalize`: message/thread modeling.
- `internal/store`: Postgres access + migrations (goose).
- `internal/vector`: Qdrant client + collection management.
- `internal/llm`: triage/extract/draft providers.
- `internal/tools`: MCP tool handlers.
- `internal/policy`: policy evaluation and enforcement.
- `internal/audit`: audit logs and tool call records.
- `internal/observability`: tracing, replay IDs.
- `internal/queue`: Redis-based job queue.
- `configs/`: policies, schemas, taxonomies, dev configs.
- `site/`: landing page.
- `docs/`: PRD, MCP contract, architecture, security, quickstart.

## Developer Experience (Golden Path)
Add a Makefile with:
- `make up`: `docker compose up -d`
- `make logs`: tail `neuralmaild` logs
- `make seed`: seed 5 demo threads via SMTP (JMAP optional)
- `make mcp-test`: hit `/mcp` with a minimal JSON-RPC test
- `make doctor`: run connectivity checks

Seed script requirements:
- Uses SMTP to send 5 demo emails (support, invoice, spam, and two generic queries).
- Includes dramatic cases: “Critical server outage” and “Angry refund request.”
- Idempotent: re-run should not duplicate if already present.
- Uses the local Stalwart dev user `dev@local.neuralmail` / `devpass`.

## Data Model And Migrations
Use Postgres + goose migrations.

Tables:
- `orgs`, `users`, `api_keys`
- `inboxes` (lifecycle, address)
- `threads` (subject, status, participants_hash, updated_at, sentiment_score, priority_level, provider_thread_id)
- `messages` (direction, text, html, raw_ref, created_at, provider_message_id, provider_blob_id, internet_message_id)
- `attachments` (object_ref, mime, size)
- `embeddings` (chunk_id, vector metadata, model_name, dim, content_hash)
- `taxonomies`, `schemas`, `policies` (policies versioned with `version`, `is_active`)
- `tool_calls` (idempotency_key, model_name, prompt_version, latency_ms, correction_text)
- `audit_log`
- `inbox_checkpoints` (provider, last_state)

Constraints:
- Unique on `(inbox_id, provider_message_id)`
- Unique on `(inbox_id, provider_thread_id)`

## Ingestion And Normalization
- Configure Stalwart dev config with JMAP enabled and local domain `local.neuralmail`.
- On startup, attempt push subscription to `/jmap/push` with shared secret.
- Always keep polling enabled as a fallback.
- Webhook flow: accept push, enqueue work, return 200 immediately.
- Polling flow: get changes since last_state, upsert threads/messages.
- Store raw RFC822 in MinIO (or filesystem for dev).
- Enqueue embedding jobs via Redis.
- Write `replay_id` per ingest cycle for audit and debugging.

## Vector Memory And Search
- Qdrant collection: `messages_v{dim}`.
- Config includes `NM_EMBED_DIM` and model names.
- Chunking: 800-1200 chars with overlap.
- Embedding cache via hash(text).
- Providers: OpenAI, Ollama, Noop.
- Fail fast if provider dims mismatch collection.
- If embeddings disabled, `search_inbox` uses Postgres full-text search fallback.

## LLM Provider Layer
`internal/llm` interface:
- `Classify(text, taxonomy) -> intent, urgency, sentiment, confidence`
- `Extract(text, json_schema, examples) -> data, confidence, missing_fields`
- `Draft(thread_context, policy, goal) -> draft, citations, risks`

If LLM not configured:
- Return deterministic placeholder values with `confidence=0`.
- Force `needs_human_approval=true` on draft tools.
- Prompt templates live in versioned files: `configs/prompts/v1/triage.md`, `extract.md`, `draft.md`.

## MCP Transport And Tools
Implement Streamable HTTP on `/mcp`:
- JSON-RPC 2.0 request/response per POST.
- Enforce `MCP-Session-Id` after `initialize`.
- In dev mode, allow missing `Origin`.
- In non-dev mode, validate `Origin` allowlist or require API key.
- Respect `MCP-Protocol-Version` header.
- Return `405` on GET (no streaming in MVP).
- Optionally expose `/mcp/sse` stub that returns “not supported” for legacy clients.

Also implement stdio mode:
- `neuralmaild mcp-stdio` reads/writes newline-delimited JSON-RPC.

Tools (per `docs/MCP_Contract.md`):
- `list_threads`, `get_thread`, `search_inbox`
- `triage_message`, `extract_to_schema`
- `draft_reply_with_policy`, `send_reply`

Tool output rules:
- All outputs are schema-validated.
- Include `confidence`, `risk_flags`, `replay_id`, and `audit_id` where relevant.
- For `extract_to_schema` and `triage_message`, enforce structured outputs with one repair retry on invalid JSON.

## Policy Engine (Soft vs Hard)
Policy evaluation returns:
- `allowed` boolean
- `violation_level` in `warning` or `critical`
- `reason`
- `suggested_redaction`

Hard block if critical: tool returns refusal with reasons.
Soft block: draft returned with `risk_flags` and `needs_human_approval=true`.
`send_reply` must refuse when `needs_human_approval=true` unless `NM_ALLOW_SEND_WITH_WARNINGS=true`.

## Observability And Debugging
- Structured JSON logs with `trace_id`, `replay_id`, `inbox_id`, `thread_id`, `message_id`.
- `/healthz` and `/readyz` endpoints.
- `/debug` HTML page with service health, queue depth, last_state per inbox, recent tool calls, and quick actions.

## Security Posture (MVP)
- `/jmap/push` requires shared secret header or HMAC signature.
- `/mcp` auth disabled only in dev mode.
- In non-dev mode, require API key header and enforce tool scopes.
- Outbound sending allowed only to `*@local.neuralmail` unless `NM_ALLOW_OUTBOUND=true`.

## Landing Page Implementation
- Static site in `site/` with `index.html`, `styles.css`, `main.js`.
- Typeface pairing: Fraunces (headings), Space Grotesk (body).
- Local font files in `site/assets/fonts/`.
- Color system: warm neutrals + deep blue-green accents.
- Background: layered gradients + subtle noise texture.
- Motion: on-load stagger for hero, pillars, and callouts.
- Hero visual: terminal animation:
  - `neuralmail policy apply --strict`
  - `Analyzing 142 unread threads...`
  - `Auto-drafted 12 replies. Flagged 3 for human review.`
- CTA links:
  - "Start with Open Source" -> `https://github.com/dmitrymolchanov/neuralmail`
  - "Request Early Access" -> `mailto:beta@nerve.email`
- Add OpenGraph and Twitter meta tags with a placeholder image.

## CI/CD Workflows
1. `ci.yml`
- Triggers on push and pull_request.
- Steps: checkout, setup Go 1.22, `go test ./...`, `go vet ./...`, `gofmt -l`, `golangci-lint`, `docker build`.

2. `docker-publish.yml`
- Triggers on tags matching `v*`.
- Uses `docker/metadata-action` and `docker/build-push-action`.
- Pushes image to `ghcr.io/dmitrymolchanov/neuralmaild`.

3. `pages.yml`
- Triggers on push to `main`.
- Uploads `site/` as Pages artifact and deploys.

4. `security.yml`
- Dependency review on PRs.
- `govulncheck` on main.

5. `e2e-smoke.yml`
- Nightly or on main.
- `docker compose up -d` and run `make mcp-test`.

## Documentation
- `README.md`: quickstart and MCP tool list.
- `docs/QUICKSTART.md`: zero to local agent in 5 minutes.
- `docs/SECURITY.md`: threat model, dev-mode warnings, scopes.
- `docs/MCP_TRANSPORT.md`: Streamable HTTP + stdio details.
- `docs/STALWART_SETUP.md`: dev config and push debugging.
- `docs/TAXONOMY_AND_SCHEMAS.md`: customizing support pack.
- Keep: `docs/NeuralMail_PRD.md`, `docs/MCP_Contract.md`, `docs/Repo_Layout.md`.

## Tests And Validation
Automated:
- Unit tests for config loading and env overrides.
- JMAP ingestion tests with mocked client.
- Tool handler tests validate outputs against schemas.
- Policy engine tests for soft/hard blocks.
- `make mcp-test` runs initialize + tools/list + list_threads.
- `make seed` followed by `make mcp-test` returns a thread marked `high` urgency and `negative` sentiment.

Manual:
- `docker compose up` and send email to `dev@local.neuralmail`.
- Verify thread appears in `list_threads` and `get_thread`.
- Run `triage_message`, `extract_to_schema`, `draft_reply_with_policy`.
- Verify `send_reply` appears as outbound in the same thread.
- Landing page renders correctly on desktop and mobile.

## Rollout And Acceptance Criteria
- Local stack boots with `docker compose up`.
- Sending an email yields exactly one thread and one message record.
- Embedding job enqueued and processed when provider configured.
- MCP Streamable HTTP passes initialize + tools/list + tools/call.
- Tools return schema-conformant JSON with `confidence`, `risk_flags`, and `replay_id`.
- GitHub Pages deploys `site/` and renders well.
- Docker image publishes to GHCR on tag.
- JMAP push is optional; polling is sufficient for MVP.

## Execution Order
1. [x] Create repo scaffolding and CI workflows.
2. [x] Implement MCP transport correctness + stdio.
3. [x] Implement store layer + migrations.
4. [x] Implement JMAP ingestion + normalization + checkpoints.
5. [x] Implement LLM providers and tool handlers.
6. [x] Implement async worker and Qdrant embeddings.
7. [x] Implement policy engine and debug UI.
8. [x] Add Makefile, CLI, and seed tools.
9. [x] Build landing page and deploy Pages.
10. [x] Add tests and smoke workflow.

## Enhancement History
### 2026-02-03 Enhancement
Based on expert feedback, this plan now includes:
- MCP transport correctness (Streamable HTTP + stdio).
- LLM provider layer for triage/extract/draft.
- Async ingestion hardening and replay IDs.
- Improved DX via Makefile and seed scripts.
- Policy soft/hard block semantics.
- Debug dashboard for observability.
- Security workflows and E2E smoke tests.

### 2026-02-03 Second Enhancement
Additional feedback incorporated:
- SMTP-first seeding with dramatic demo emails.
- FTS fallback when embeddings are disabled.
- Provider ID columns and embedding metadata.
- Structured-output enforcement with repair retry.
- Dev-mode Origin handling for MCP.
- Send gating when `needs_human_approval` is true.
- Execution order adjusted (store before ingestion).

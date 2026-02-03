# NeuralMail Repo Layout (Current)

Top-level:
- `cmd/`
- `internal/`
- `configs/`
- `deploy/`
- `docs/`
- `site/`
- `scripts/` (optional)

Command binaries:
- `cmd/neuralmaild`: server (`serve`), worker, and MCP stdio mode.
- `cmd/neuralmail`: CLI for DX commands.

Key internals:
- `internal/app`: composition root.
- `internal/config`: YAML + env config.
- `internal/jmap`: ingestion pipeline.
- `internal/store`: Postgres + migrations.
- `internal/vector`: Qdrant client.
- `internal/embed`: embeddings providers.
- `internal/llm`: triage/extract/draft providers.
- `internal/mcp`: MCP transport + tool dispatch.
- `internal/tools`: tool implementations.
- `internal/policy`: policy evaluation.
- `internal/queue`: Redis job queue.
- `internal/observability`: replay IDs.

Configs:
- `configs/dev`: dev YAMLs.
- `configs/policy`: policy definitions.
- `configs/schemas`: JSON schemas for extraction.
- `configs/taxonomies`: taxonomy for triage.
- `configs/prompts`: LLM prompt templates.

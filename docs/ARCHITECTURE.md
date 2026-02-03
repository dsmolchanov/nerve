# Architecture

## Data Flow
1. SMTP/JMAP ingests email.
2. Messages are normalized into threads and stored in Postgres.
3. Embedding jobs are queued in Redis.
4. Worker embeds text and upserts into Qdrant.
5. MCP tools query Postgres/Qdrant and apply policies.

## Components
- `neuralmaild serve`: HTTP server + MCP endpoints
- `neuralmaild worker`: embeddings + vector upserts
- `neuralmail` CLI: dev workflows

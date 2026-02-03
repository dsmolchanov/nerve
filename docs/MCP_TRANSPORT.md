# MCP Transport

## Streamable HTTP (POST-only in MVP)
- Endpoint: `POST /mcp`
- JSON-RPC 2.0 per request
- `MCP-Session-Id` returned on `initialize`, required thereafter
- `MCP-Protocol-Version` echoed in responses
- `GET /mcp` returns 405 (streaming not implemented in MVP)

## SSE Stub
- `GET /mcp/sse` returns `not supported` to guide legacy clients.

## StdIO
- `neuralmaild mcp-stdio` uses newline-delimited JSON-RPC.

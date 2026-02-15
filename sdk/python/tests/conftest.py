"""Shared fixtures for nerve-email SDK tests."""
import pytest
import httpx
import respx

from nerve_email import NerveClient, NerveAdmin


@pytest.fixture
def mock_api():
    """respx mock router for Nerve HTTP API."""
    with respx.mock(base_url="http://nerve-test:8088") as router:
        yield router


@pytest.fixture
def mock_initialize(mock_api):
    """Pre-configure the initialize endpoint to return a session ID."""
    mock_api.post("/mcp").mock(
        side_effect=_initialize_side_effect
    )
    return mock_api


def _initialize_side_effect(request: httpx.Request) -> httpx.Response:
    """Handle MCP requests, returning session ID on initialize."""
    import json
    body = json.loads(request.content)
    method = body.get("method")

    if method == "initialize":
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-11-25"}},
            headers={"MCP-Session-Id": "test-session-123"},
        )
    elif method == "tools/list":
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": body["id"],
                "result": {
                    "tools": [
                        {"name": "list_threads", "inputSchema": {"type": "object", "properties": {"inbox_id": {"type": "string"}, "status": {"type": "string"}, "limit": {"type": "integer"}, "cursor": {"type": "string"}}}},
                        {"name": "get_thread", "inputSchema": {"type": "object", "properties": {"thread_id": {"type": "string"}}}},
                        {"name": "search_inbox", "inputSchema": {"type": "object", "properties": {"inbox_id": {"type": "string"}, "query": {"type": "string"}, "top_k": {"type": "integer"}, "cursor": {"type": "string"}}}},
                        {"name": "triage_message", "inputSchema": {"type": "object", "properties": {"message_id": {"type": "string"}}}},
                        {"name": "extract_to_schema", "inputSchema": {"type": "object", "properties": {"message_id": {"type": "string"}, "schema_id": {"type": "string"}}}},
                        {"name": "draft_reply_with_policy", "inputSchema": {"type": "object", "properties": {"thread_id": {"type": "string"}, "goal": {"type": "string"}}}},
                        {"name": "send_reply", "inputSchema": {"type": "object", "properties": {"thread_id": {"type": "string"}, "body_or_draft_id": {"type": "string"}, "needs_human_approval": {"type": "boolean"}}}},
                    ]
                },
            },
        )
    elif method == "tools/call":
        tool_name = body["params"]["name"]
        args = body["params"]["arguments"]
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": body["id"],
                "result": {"tool": tool_name, "args": args, "mock": True},
            },
        )
    elif method == "resources/read":
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": body["id"],
                "result": {"inbox_ids": ["inbox_test_1"]},
            },
        )

    return httpx.Response(
        200,
        json={"jsonrpc": "2.0", "id": body["id"], "result": {}},
    )

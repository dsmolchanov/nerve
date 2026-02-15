"""Unit tests for NerveClient -- MCP session, retry, error handling."""
import asyncio
import json

import httpx
import pytest
import respx

from nerve_email import NerveClient
from nerve_email.exceptions import (
    NerveAuthError,
    NerveError,
    NerveQuotaError,
    NerveRateLimitError,
    NerveSessionError,
    NerveSubscriptionError,
)


# --- Session management ---


@pytest.mark.asyncio
async def test_session_initialization(mock_initialize):
    """Client initializes MCP session on first call."""
    async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
        assert await client.health_check()
        assert client._session_id == "test-session-123"


@pytest.mark.asyncio
async def test_concurrent_session_init_single_initialize():
    """10 parallel calls should only trigger 1 initialize request."""
    initialize_count = 0

    def handle_request(request: httpx.Request) -> httpx.Response:
        nonlocal initialize_count
        body = json.loads(request.content)
        method = body.get("method")

        if method == "initialize":
            initialize_count += 1
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {"protocolVersion": "2025-11-25"}},
                headers={"MCP-Session-Id": "session-concurrent"},
            )
        elif method == "tools/call":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {"threads": []}},
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {}})

    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(side_effect=handle_request)

        async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
            # Fire 10 concurrent list_threads calls
            tasks = [
                client.list_threads(inbox_id="inbox_1")
                for _ in range(10)
            ]
            await asyncio.gather(*tasks)

            # Only 1 initialize should have been called
            assert initialize_count == 1


@pytest.mark.asyncio
async def test_session_expiry_recovery():
    """Client re-initializes when session expires."""
    call_count = 0

    def handle_request(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        body = json.loads(request.content)
        method = body.get("method")

        if method == "initialize":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {}},
                headers={"MCP-Session-Id": f"session-{call_count}"},
            )
        elif method == "tools/call":
            # First tool call returns session error
            if call_count == 2:
                return httpx.Response(
                    200,
                    json={
                        "jsonrpc": "2.0",
                        "id": body["id"],
                        "error": {"code": -32000, "message": "Session expired"},
                    },
                )
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {"threads": []}},
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {}})

    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(side_effect=handle_request)

        async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
            result = await client.list_threads(inbox_id="inbox_1")
            assert result == {"threads": []}
            # Session should have been re-initialized
            assert client._session_id.startswith("session-")


# --- Retry logic ---


@pytest.mark.asyncio
async def test_rate_limit_retry_idempotent():
    """Idempotent tools retry on rate limit, then succeed."""
    attempt = 0

    def handle_request(request: httpx.Request) -> httpx.Response:
        nonlocal attempt
        attempt += 1
        body = json.loads(request.content)
        method = body.get("method")

        if method == "initialize":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {}},
                headers={"MCP-Session-Id": "session-retry"},
            )
        elif method == "tools/call":
            if attempt <= 2:  # First tool call: rate limited
                return httpx.Response(
                    200,
                    json={
                        "jsonrpc": "2.0",
                        "id": body["id"],
                        "error": {
                            "code": -32042,
                            "message": "Rate limited",
                            "data": {"retry_after_seconds": 0},
                        },
                    },
                )
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {"threads": []}},
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {}})

    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(side_effect=handle_request)

        async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key", max_retries=3) as client:
            result = await client.list_threads(inbox_id="inbox_1")
            assert result == {"threads": []}


@pytest.mark.asyncio
async def test_rate_limit_no_retry_send_reply():
    """send_reply (non-idempotent) raises immediately on rate limit."""
    def handle_request(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        method = body.get("method")

        if method == "initialize":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {}},
                headers={"MCP-Session-Id": "session-noop"},
            )
        elif method == "tools/call":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": body["id"],
                    "error": {
                        "code": -32042,
                        "message": "Rate limited",
                        "data": {"retry_after_seconds": 5},
                    },
                },
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body["id"], "result": {}})

    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(side_effect=handle_request)

        async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
            with pytest.raises(NerveRateLimitError) as exc_info:
                await client.send_reply(
                    thread_id="t1",
                    body_or_draft_id="draft_1",
                )
            assert exc_info.value.retry_after == 5


# --- Error handling ---


@pytest.mark.asyncio
async def test_auth_error_401():
    """401 response raises NerveAuthError."""
    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(return_value=httpx.Response(401, json={}))

        async with NerveClient(base_url="http://nerve-test:8088", api_key="bad-key") as client:
            # health_check() catches exceptions, so use list_threads instead
            with pytest.raises(NerveAuthError):
                await client.list_threads(inbox_id="inbox_1")


@pytest.mark.asyncio
async def test_quota_exceeded():
    """-32040 maps to NerveQuotaError."""
    def handle_request(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        method = body.get("method")

        if method == "initialize":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {}},
                headers={"MCP-Session-Id": "session-quota"},
            )
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": body["id"],
                "error": {"code": -32040, "message": "Quota exceeded"},
            },
        )

    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(side_effect=handle_request)

        async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
            with pytest.raises(NerveQuotaError):
                await client.list_threads(inbox_id="inbox_1")


@pytest.mark.asyncio
async def test_subscription_inactive():
    """-32041 maps to NerveSubscriptionError."""
    def handle_request(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        method = body.get("method")

        if method == "initialize":
            return httpx.Response(
                200,
                json={"jsonrpc": "2.0", "id": body["id"], "result": {}},
                headers={"MCP-Session-Id": "session-sub"},
            )
        return httpx.Response(
            200,
            json={
                "jsonrpc": "2.0",
                "id": body["id"],
                "error": {"code": -32041, "message": "Subscription inactive"},
            },
        )

    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(side_effect=handle_request)

        async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
            with pytest.raises(NerveSubscriptionError):
                await client.list_threads(inbox_id="inbox_1")


# --- Tool methods ---


@pytest.mark.asyncio
async def test_list_threads_sends_correct_rpc(mock_initialize):
    """list_threads sends correct JSON-RPC with session and MCP-Protocol-Version header."""
    async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
        result = await client.list_threads(inbox_id="inbox_1", status="open", limit=20)
        assert result["tool"] == "list_threads"
        assert result["args"]["inbox_id"] == "inbox_1"
        assert result["args"]["status"] == "open"
        assert result["args"]["limit"] == 20


@pytest.mark.asyncio
async def test_search_inbox(mock_initialize):
    """search_inbox passes query and cursor correctly."""
    async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
        result = await client.search_inbox(inbox_id="inbox_1", query="refund", cursor="page2")
        assert result["args"]["query"] == "refund"
        assert result["args"]["cursor"] == "page2"


@pytest.mark.asyncio
async def test_list_inboxes(mock_initialize):
    """list_inboxes reads the email://inboxes resource."""
    async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
        result = await client.list_inboxes()
        assert "inbox_ids" in result


@pytest.mark.asyncio
async def test_health_check_true(mock_initialize):
    """health_check returns True when server is reachable."""
    async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
        assert await client.health_check() is True


@pytest.mark.asyncio
async def test_health_check_false():
    """health_check returns False on connection error."""
    with respx.mock(base_url="http://nerve-test:8088") as mock:
        mock.post("/mcp").mock(side_effect=httpx.ConnectError("Connection refused"))

        async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
            assert await client.health_check() is False


@pytest.mark.asyncio
async def test_context_manager_cleanup(mock_initialize):
    """async with closes the HTTP client on exit."""
    async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
        await client.health_check()
        http = client._http
    # After exiting context, HTTP client should be closed
    assert http.is_closed


@pytest.mark.asyncio
async def test_list_tools(mock_initialize):
    """list_tools returns server tool definitions."""
    async with NerveClient(base_url="http://nerve-test:8088", api_key="test-key") as client:
        tools = await client.list_tools()
        assert len(tools) == 7
        names = {t["name"] for t in tools}
        assert "list_threads" in names
        assert "send_reply" in names

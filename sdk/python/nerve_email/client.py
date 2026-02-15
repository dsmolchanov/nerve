"""
NerveClient -- async MCP client for Nerve email server.

Usage:
    from nerve_email import NerveClient

    async with NerveClient(base_url="https://nerve.example.com", api_key="nerve_sk_...") as client:
        # Check readiness
        if await client.health_check():
            threads = await client.list_threads(inbox_id="inbox_123")
            thread = await client.get_thread(thread_id="thread_456")
            results = await client.search_inbox(inbox_id="inbox_123", query="appointment")

        # Paginated access
        page1 = await client.list_threads(inbox_id="inbox_123", limit=20)
        page2 = await client.list_threads(inbox_id="inbox_123", limit=20, cursor=page1.get("next_cursor"))

        # Generic tool execution (for agentic use)
        result = await client.execute_tool("list_threads", {"inbox_id": "inbox_123"})

        # Dynamic tool discovery (prevents schema drift)
        server_tools = await client.list_tools()
"""
import asyncio
import logging
from typing import Any, Dict, List, Optional

import httpx

from .exceptions import (
    NerveError, NerveSessionError, NerveRateLimitError,
    NerveQuotaError, NerveAuthError, NerveSubscriptionError,
)

logger = logging.getLogger(__name__)

_JSONRPC_VERSION = "2.0"
_MCP_PROTOCOL_VERSION = "2025-11-25"
_CLIENT_NAME = "nerve-email-python"
_CLIENT_VERSION = "0.1.0"

# Tools that are NOT safe to retry (non-idempotent)
_NON_IDEMPOTENT_TOOLS = frozenset({"send_reply"})


class NerveClient:
    """Async MCP client for Nerve email server.

    Supports both API key and bearer token authentication.
    Thread-safe for concurrent async usage thanks to asyncio.Lock
    on session initialization.
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        bearer_token: Optional[str] = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ):
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._bearer_token = bearer_token
        self._timeout = timeout
        self._max_retries = max_retries
        self._session_id: Optional[str] = None
        self._session_lock = asyncio.Lock()  # Prevents concurrent initialize races
        self._request_id = 0
        self._http: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def _get_http(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            headers = {
                "Content-Type": "application/json",
                "MCP-Protocol-Version": _MCP_PROTOCOL_VERSION,
            }
            if self._api_key:
                headers["X-Nerve-Cloud-Key"] = self._api_key
            elif self._bearer_token:
                headers["Authorization"] = f"Bearer {self._bearer_token}"
            self._http = httpx.AsyncClient(
                base_url=self.base_url,
                headers=headers,
                timeout=self._timeout,
            )
        return self._http

    async def _ensure_session(self):
        """Initialize MCP session if not already established.

        Uses asyncio.Lock to prevent concurrent requests from
        triggering multiple simultaneous initialize calls.
        """
        if self._session_id:
            return
        async with self._session_lock:
            # Double-check after acquiring lock (another coroutine may have initialized)
            if self._session_id:
                return
            result = await self._rpc("initialize", {
                "clientInfo": {
                    "name": _CLIENT_NAME,
                    "version": _CLIENT_VERSION,
                },
                "protocolVersion": _MCP_PROTOCOL_VERSION,
            })
            if not self._session_id:
                raise NerveSessionError("Server did not return MCP-Session-Id")

    def _next_id(self) -> int:
        self._request_id += 1
        return self._request_id

    async def _rpc(self, method: str, params: dict, *, allow_retry: bool = True) -> Any:
        """Send a JSON-RPC 2.0 request to Nerve's MCP endpoint.

        Args:
            method: JSON-RPC method name
            params: Method parameters
            allow_retry: If False, do not retry on rate limit (for non-idempotent ops)
        """
        http = await self._get_http()
        body = {
            "jsonrpc": _JSONRPC_VERSION,
            "id": self._next_id(),
            "method": method,
            "params": params,
        }
        headers: Dict[str, str] = {}
        if self._session_id:
            headers["MCP-Session-Id"] = self._session_id

        max_attempts = (self._max_retries + 1) if allow_retry else 1

        for attempt in range(max_attempts):
            resp = await http.post("/mcp", json=body, headers=headers)

            if resp.status_code == 401:
                raise NerveAuthError("Authentication failed -- check API key or token")
            if resp.status_code == 403:
                raise NerveAuthError("Forbidden -- check API key scopes")

            data = resp.json()

            # Capture session ID from initialize response
            if method == "initialize" and "MCP-Session-Id" in resp.headers:
                self._session_id = resp.headers["MCP-Session-Id"]

            if "error" in data and data["error"]:
                err = data["error"]
                code = err.get("code", 0)
                msg = err.get("message", "unknown error")
                err_data = err.get("data", {})

                if code == -32042:  # rate_limited (retryable)
                    retry_after = err_data.get("retry_after_seconds", 2)
                    if allow_retry and attempt < max_attempts - 1:
                        logger.warning(f"Rate limited, retrying in {retry_after}s")
                        await asyncio.sleep(retry_after)
                        continue
                    raise NerveRateLimitError(msg, retry_after=retry_after)
                elif code == -32040:  # quota_exceeded (non-retryable)
                    raise NerveQuotaError(msg)
                elif code == -32041:  # subscription_inactive (non-retryable)
                    raise NerveSubscriptionError(msg)
                elif code == -32000 and "session" in msg.lower():
                    # Session expired -- re-initialize under lock
                    self._session_id = None
                    await self._ensure_session()
                    headers["MCP-Session-Id"] = self._session_id
                    continue
                else:
                    raise NerveError(msg, code=code)

            return data.get("result")

        raise NerveError("Max retries exceeded")

    async def _call_tool(self, name: str, arguments: dict) -> Any:
        """Call an MCP tool with auto-session management.

        Non-idempotent tools (send_reply) are never retried to prevent
        duplicate side effects like double-sending emails.
        """
        await self._ensure_session()
        allow_retry = name not in _NON_IDEMPOTENT_TOOLS
        return await self._rpc(
            "tools/call",
            {"name": name, "arguments": arguments},
            allow_retry=allow_retry,
        )

    # ------------------------------------------------------------------
    # Health / Discovery
    # ------------------------------------------------------------------

    async def health_check(self) -> bool:
        """Check if Nerve server is reachable and session can be established.

        Returns True if healthy, False otherwise. Does not raise.
        Use this before offering email tools to users.
        """
        try:
            await self._ensure_session()
            return True
        except Exception:
            return False

    async def list_tools(self) -> List[Dict[str, Any]]:
        """Discover available tools from the server via tools/list.

        Prevents schema drift -- compare against static definitions
        to detect breaking server changes.
        """
        await self._ensure_session()
        result = await self._rpc("tools/list", {})
        return result.get("tools", [])

    # ------------------------------------------------------------------
    # Typed tool methods
    # ------------------------------------------------------------------

    async def list_threads(
        self,
        inbox_id: str,
        status: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List email threads with pagination support.

        Returns dict with 'threads' list and optional 'next_cursor'
        for fetching subsequent pages.
        """
        args: Dict[str, Any] = {"inbox_id": inbox_id, "limit": limit}
        if status:
            args["status"] = status
        if cursor:
            args["cursor"] = cursor
        return await self._call_tool("list_threads", args)

    async def get_thread(self, thread_id: str) -> Dict[str, Any]:
        return await self._call_tool("get_thread", {"thread_id": thread_id})

    async def search_inbox(
        self,
        inbox_id: str,
        query: str,
        top_k: int = 10,
        cursor: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Semantic search with pagination support."""
        args: Dict[str, Any] = {"inbox_id": inbox_id, "query": query, "top_k": top_k}
        if cursor:
            args["cursor"] = cursor
        return await self._call_tool("search_inbox", args)

    async def triage_message(self, message_id: str) -> Dict[str, Any]:
        return await self._call_tool("triage_message", {"message_id": message_id})

    async def extract_to_schema(
        self, message_id: str, schema_id: str
    ) -> Dict[str, Any]:
        return await self._call_tool(
            "extract_to_schema", {"message_id": message_id, "schema_id": schema_id}
        )

    async def draft_reply(
        self,
        thread_id: str,
        goal: str,
        attachments: Optional[List[Dict[str, Any]]] = None,  # Reserved for future
    ) -> Dict[str, Any]:
        """Draft an email reply with policy guardrails.

        Args:
            thread_id: Thread to reply to
            goal: What the reply should accomplish
            attachments: Reserved for future use. Not supported in MVP.
        """
        args: Dict[str, Any] = {"thread_id": thread_id, "goal": goal}
        if attachments:
            args["attachments"] = attachments
        return await self._call_tool("draft_reply_with_policy", args)

    async def send_reply(
        self,
        thread_id: str,
        body_or_draft_id: str,
        needs_human_approval: bool = False,
    ) -> Dict[str, Any]:
        """Send an email reply. NOT retried on failure (non-idempotent).

        Args:
            thread_id: Thread to reply to
            body_or_draft_id: Email body text OR a draft ID from draft_reply
            needs_human_approval: If True, Nerve flags for human review
                instead of sending immediately. Set to False when the
                user has already confirmed in the conversation UI.
        """
        return await self._call_tool(
            "send_reply",
            {
                "thread_id": thread_id,
                "body_or_draft_id": body_or_draft_id,
                "needs_human_approval": needs_human_approval,
            },
        )

    async def list_inboxes(self) -> Dict[str, Any]:
        """Read the email://inboxes resource."""
        await self._ensure_session()
        return await self._rpc("resources/read", {"uri": "email://inboxes"})

    # ------------------------------------------------------------------
    # Generic tool execution (for agentic use)
    # ------------------------------------------------------------------

    async def execute_tool(self, tool_name: str, arguments: dict) -> Any:
        """Execute any MCP tool by name. Used by agentic frameworks."""
        return await self._call_tool(tool_name, arguments)

    async def close(self):
        if self._http and not self._http.is_closed:
            await self._http.aclose()

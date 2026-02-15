"""
Contract test: verify static tool definitions match server's tools/list.

Run against a live Nerve instance to detect schema drift early.
Prevents the SDK from advertising tool parameters that the server
doesn't actually support (or vice versa).
"""
import os
import pytest

from nerve_email import NerveClient
from nerve_email.tools import NERVE_TOOLS


@pytest.mark.asyncio
@pytest.mark.integration  # Only runs against live Nerve
async def test_static_tools_match_server():
    """Static tool definitions must match what the server advertises."""
    if os.getenv("NERVE_SDK_INTEGRATION") != "1":
        pytest.skip("Integration test (set NERVE_SDK_INTEGRATION=1 to run)")

    async with NerveClient(
        base_url=os.getenv("NERVE_SDK_BASE_URL", "http://localhost:8088"),
        api_key=os.getenv("NERVE_SDK_API_KEY", "test-api-key"),
    ) as client:
        server_tools = await client.list_tools()
        server_names = {t["name"] for t in server_tools}
        static_names = set(NERVE_TOOLS.keys())

        # All static tools must exist on server
        missing = static_names - server_names
        assert not missing, f"Static tools not found on server: {missing}"

        # Check parameter names match
        server_map = {t["name"]: t for t in server_tools}
        for name, static_tool in NERVE_TOOLS.items():
            if name in server_map:
                server_params = set(
                    server_map[name].get("inputSchema", {}).get("properties", {}).keys()
                )
                static_params = set(static_tool.parameters.get("properties", {}).keys())
                # Static params should be a subset (server may have more)
                extra = static_params - server_params
                assert not extra, f"Tool '{name}' has params not on server: {extra}"


@pytest.mark.asyncio
async def test_static_tools_match_mock_server(mock_initialize):
    """Static tool definitions match the mock server's tools/list (unit test version)."""
    async with NerveClient(
        base_url="http://nerve-test:8088",
        api_key="test-key",
    ) as client:
        server_tools = await client.list_tools()
        server_names = {t["name"] for t in server_tools}
        static_names = set(NERVE_TOOLS.keys())

        # All static tools must exist on (mock) server
        missing = static_names - server_names
        assert not missing, f"Static tools not found on server: {missing}"

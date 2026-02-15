"""Unit tests for tool definitions and framework adapters."""
import pytest

from nerve_email.tools import (
    NERVE_TOOLS,
    ToolDefinition,
    get_tool_definitions,
)


def test_nerve_tools_has_7_definitions():
    """SDK defines exactly 7 email tools."""
    assert len(NERVE_TOOLS) == 7


def test_all_tools_have_required_fields():
    """Every tool definition has name, description, and parameters."""
    for name, tool in NERVE_TOOLS.items():
        assert isinstance(tool, ToolDefinition)
        assert tool.name == name
        assert tool.description
        assert tool.parameters.get("type") == "object"
        assert "properties" in tool.parameters


def test_claude_format():
    """Claude format has name, description, input_schema."""
    tools = get_tool_definitions(format="claude")
    assert len(tools) == 7
    for tool in tools:
        assert "name" in tool
        assert "description" in tool
        assert "input_schema" in tool
        assert tool["input_schema"]["type"] == "object"


def test_claude_format_with_prefix():
    """Prefix is added to all tool names."""
    tools = get_tool_definitions(format="claude", prefix="email_")
    for tool in tools:
        assert tool["name"].startswith("email_")


def test_openai_format():
    """OpenAI format has type=function and function dict."""
    tools = get_tool_definitions(format="openai")
    assert len(tools) == 7
    for tool in tools:
        assert tool["type"] == "function"
        assert "function" in tool
        func = tool["function"]
        assert "name" in func
        assert "description" in func
        assert "parameters" in func


def test_openai_format_with_prefix():
    """OpenAI format respects prefix."""
    tools = get_tool_definitions(format="openai", prefix="email_")
    for tool in tools:
        assert tool["function"]["name"].startswith("email_")


def test_raw_format():
    """Raw format returns name, description, parameters."""
    tools = get_tool_definitions(format="raw")
    assert len(tools) == 7
    for tool in tools:
        assert "name" in tool
        assert "description" in tool
        assert "parameters" in tool


def test_unknown_format_raises():
    """Unknown format raises ValueError."""
    with pytest.raises(ValueError, match="Unknown format"):
        get_tool_definitions(format="langchain")


def test_required_fields_propagated():
    """Required fields from ToolDefinition appear in output schemas."""
    claude_tools = get_tool_definitions(format="claude")
    tool_map = {t["name"]: t for t in claude_tools}

    # list_threads requires inbox_id
    assert "inbox_id" in tool_map["list_threads"]["input_schema"]["required"]

    # send_reply requires thread_id and body_or_draft_id
    send = tool_map["send_reply"]["input_schema"]["required"]
    assert "thread_id" in send
    assert "body_or_draft_id" in send


def test_tool_names_are_stable():
    """Tool names match expected values (prevent accidental renames)."""
    expected = {
        "list_threads", "get_thread", "search_inbox",
        "triage_message", "extract_to_schema",
        "draft_reply_with_policy", "send_reply",
    }
    assert set(NERVE_TOOLS.keys()) == expected

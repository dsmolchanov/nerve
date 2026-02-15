"""
Framework-agnostic tool definitions for Nerve email tools.

Tool definitions are stored as neutral ToolDefinition objects with JSON Schema
parameters. Adapters convert to Claude, OpenAI, or LangChain format.

Usage:
    # Claude format (Plaintalk default)
    tools = get_tool_definitions(format="claude", prefix="email_")

    # OpenAI function calling format
    tools = get_tool_definitions(format="openai", prefix="email_")

    # Raw JSON Schema (for custom frameworks)
    tools = get_tool_definitions(format="raw")
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class ToolDefinition:
    """Framework-neutral tool definition."""
    name: str
    description: str
    parameters: Dict[str, Any]  # JSON Schema
    required: List[str] = field(default_factory=list)


# --- Canonical tool definitions (framework-neutral) ---

NERVE_TOOLS: Dict[str, ToolDefinition] = {
    "list_threads": ToolDefinition(
        name="list_threads",
        description="List email threads in an inbox. Returns threads sorted by most recent activity. Supports pagination via cursor.",
        parameters={
            "type": "object",
            "properties": {
                "inbox_id": {"type": "string", "description": "Inbox ID to list threads from"},
                "status": {
                    "type": "string",
                    "enum": ["open", "closed", "snoozed"],
                    "description": "Filter by thread status (optional)",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max threads to return (default 50, max 200)",
                    "default": 50,
                },
                "cursor": {
                    "type": "string",
                    "description": "Pagination cursor from previous response's next_cursor (optional)",
                },
            },
        },
        required=["inbox_id"],
    ),
    "get_thread": ToolDefinition(
        name="get_thread",
        description="Fetch a complete email thread with all messages. Use to read full email conversations.",
        parameters={
            "type": "object",
            "properties": {
                "thread_id": {"type": "string", "description": "Thread ID to fetch"},
            },
        },
        required=["thread_id"],
    ),
    "search_inbox": ToolDefinition(
        name="search_inbox",
        description="Semantic search over an email inbox. Finds emails matching a natural language query. Supports pagination via cursor.",
        parameters={
            "type": "object",
            "properties": {
                "inbox_id": {"type": "string", "description": "Inbox ID to search"},
                "query": {"type": "string", "description": "Natural language search query"},
                "top_k": {
                    "type": "integer",
                    "description": "Number of results (default 10, max 50)",
                    "default": 10,
                },
                "cursor": {
                    "type": "string",
                    "description": "Pagination cursor from previous response (optional)",
                },
            },
        },
        required=["inbox_id", "query"],
    ),
    "triage_message": ToolDefinition(
        name="triage_message",
        description="Classify an email message by intent, urgency, and sentiment. Use to prioritize responses.",
        parameters={
            "type": "object",
            "properties": {
                "message_id": {"type": "string", "description": "Message ID to classify"},
            },
        },
        required=["message_id"],
    ),
    "extract_to_schema": ToolDefinition(
        name="extract_to_schema",
        description="Extract structured data from an email using a predefined schema (e.g., extract appointment request details).",
        parameters={
            "type": "object",
            "properties": {
                "message_id": {"type": "string", "description": "Message ID to extract from"},
                "schema_id": {"type": "string", "description": "Schema ID defining the extraction format"},
            },
        },
        required=["message_id", "schema_id"],
    ),
    "draft_reply_with_policy": ToolDefinition(
        name="draft_reply_with_policy",
        description="Draft an email reply constrained by a response policy. Returns the draft with risk flags and approval status.",
        parameters={
            "type": "object",
            "properties": {
                "thread_id": {"type": "string", "description": "Thread ID to reply to"},
                "goal": {"type": "string", "description": "What the reply should accomplish (e.g., 'Confirm the appointment and ask for insurance info')"},
            },
        },
        required=["thread_id", "goal"],
    ),
    "send_reply": ToolDefinition(
        name="send_reply",
        description="Send an email reply to a thread. Only call after the user has confirmed the draft in conversation.",
        parameters={
            "type": "object",
            "properties": {
                "thread_id": {"type": "string", "description": "Thread ID to reply to"},
                "body_or_draft_id": {
                    "type": "string",
                    "description": "Email body text OR a draft_id from draft_reply_with_policy",
                },
                "needs_human_approval": {
                    "type": "boolean",
                    "description": "If true, flags for human review. Set false when user already confirmed in chat.",
                    "default": False,
                },
            },
        },
        required=["thread_id", "body_or_draft_id"],
    ),
}


# --- Format adapters ---

def _to_claude_format(tool: ToolDefinition, prefix: str = "") -> dict:
    """Convert to Claude/Anthropic tool_use format."""
    schema = dict(tool.parameters)
    if tool.required:
        schema["required"] = tool.required
    return {
        "name": f"{prefix}{tool.name}",
        "description": tool.description,
        "input_schema": schema,
    }


def _to_openai_format(tool: ToolDefinition, prefix: str = "") -> dict:
    """Convert to OpenAI function calling format."""
    schema = dict(tool.parameters)
    if tool.required:
        schema["required"] = tool.required
    return {
        "type": "function",
        "function": {
            "name": f"{prefix}{tool.name}",
            "description": tool.description,
            "parameters": schema,
        },
    }


def _to_raw_format(tool: ToolDefinition, prefix: str = "") -> dict:
    """Return raw JSON Schema format."""
    schema = dict(tool.parameters)
    if tool.required:
        schema["required"] = tool.required
    return {
        "name": f"{prefix}{tool.name}",
        "description": tool.description,
        "parameters": schema,
    }


_FORMAT_ADAPTERS = {
    "claude": _to_claude_format,
    "anthropic": _to_claude_format,
    "openai": _to_openai_format,
    "raw": _to_raw_format,
}


def get_tool_definitions(
    format: str = "claude",
    prefix: str = "",
) -> List[dict]:
    """Get tool definitions in the specified framework format.

    Args:
        format: Target framework -- "claude", "openai", or "raw" (JSON Schema)
        prefix: Prefix added to tool names to avoid collisions (e.g., "email_")
    """
    adapter = _FORMAT_ADAPTERS.get(format)
    if not adapter:
        raise ValueError(f"Unknown format '{format}'. Supported: {list(_FORMAT_ADAPTERS.keys())}")
    return [adapter(tool, prefix) for tool in NERVE_TOOLS.values()]

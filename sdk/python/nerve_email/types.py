"""Pydantic response models for Nerve email SDK.

These are convenience types for consumers who want structured responses.
The SDK methods return raw dicts by default for maximum flexibility.
"""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel


class EmailAddress(BaseModel):
    """Email address with optional display name."""
    address: str
    name: Optional[str] = None


class Message(BaseModel):
    """A single email message within a thread."""
    id: str
    thread_id: str
    from_: Optional[EmailAddress] = None
    to: Optional[List[EmailAddress]] = None
    subject: Optional[str] = None
    body_text: Optional[str] = None
    body_html: Optional[str] = None
    received_at: Optional[str] = None

    class Config:
        populate_by_name = True


class Thread(BaseModel):
    """An email thread (conversation)."""
    id: str
    subject: Optional[str] = None
    status: Optional[str] = None
    message_count: Optional[int] = None
    last_message_at: Optional[str] = None
    messages: Optional[List[Message]] = None


class SearchResult(BaseModel):
    """A single search result."""
    message_id: str
    thread_id: str
    subject: Optional[str] = None
    snippet: Optional[str] = None
    score: Optional[float] = None


class TriageResult(BaseModel):
    """Result of message triage/classification."""
    message_id: str
    intent: Optional[str] = None
    urgency: Optional[str] = None
    sentiment: Optional[str] = None
    suggested_action: Optional[str] = None


class DraftResult(BaseModel):
    """Result of drafting a reply."""
    draft: str
    draft_id: Optional[str] = None
    risk_flags: Optional[List[str]] = None
    auto_approved: Optional[bool] = None


class SendResult(BaseModel):
    """Result of sending an email."""
    message_id: str
    status: Optional[str] = None


class InboxList(BaseModel):
    """List of available inboxes."""
    inbox_ids: List[str] = []

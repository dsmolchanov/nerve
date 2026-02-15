"""nerve-email -- Python SDK for Nerve MCP email server."""

from .client import NerveClient
from .admin import NerveAdmin
from .exceptions import (
    NerveError,
    NerveSessionError,
    NerveAuthError,
    NerveRateLimitError,
    NerveQuotaError,
    NerveSubscriptionError,
)

__all__ = [
    "NerveClient",
    "NerveAdmin",
    "NerveError",
    "NerveSessionError",
    "NerveAuthError",
    "NerveRateLimitError",
    "NerveQuotaError",
    "NerveSubscriptionError",
]

__version__ = "0.1.0"

"""Nerve SDK exceptions -- complete error taxonomy matching Nerve's JSON-RPC error codes."""


class NerveError(Exception):
    """Base exception for all Nerve SDK errors."""
    def __init__(self, message: str, code: int = 0):
        super().__init__(message)
        self.code = code


class NerveSessionError(NerveError):
    """MCP session could not be established or expired."""
    pass


class NerveAuthError(NerveError):
    """Authentication or authorization failure (401/403)."""
    pass


class NerveRateLimitError(NerveError):
    """Rate limited (-32042). Retryable -- includes retry_after hint."""
    def __init__(self, message: str, retry_after: float = 2.0):
        super().__init__(message, code=-32042)
        self.retry_after = retry_after


class NerveQuotaError(NerveError):
    """Usage quota exceeded (-32040). Non-retryable."""
    def __init__(self, message: str = "Quota exceeded"):
        super().__init__(message, code=-32040)


class NerveSubscriptionError(NerveError):
    """Subscription inactive (-32041). Non-retryable.

    Tenant's Nerve subscription is paused/cancelled.
    """
    def __init__(self, message: str = "Subscription inactive"):
        super().__init__(message, code=-32041)

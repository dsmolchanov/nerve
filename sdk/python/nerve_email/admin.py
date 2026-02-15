"""
NerveAdmin -- control plane client for domain and inbox management.

Usage:
    from nerve_email import NerveAdmin

    async with NerveAdmin(base_url="https://nerve.example.com", api_key="nerve_sk_...") as admin:
        # Domain management
        domain = await admin.add_domain(org_id="org_123", domain="clientclinic.com")
        dns_records = await admin.get_dns_records(domain_id=domain["domain_id"])
        result = await admin.verify_domain(domain_id=domain["domain_id"])

        # Inbox management
        inbox = await admin.create_inbox(org_id="org_123", address="support@clientclinic.com")

        # Issue long-lived cloud API key for agent access
        key = await admin.issue_cloud_api_key(org_id="org_123", label="plaintalk-agent")
"""
from typing import Any, Dict, List, Optional

import httpx

from .exceptions import NerveError, NerveAuthError


class NerveAdmin:
    """Control plane client for Nerve domain and inbox management.

    Uses X-API-Key (bootstrap admin key) for authentication.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        timeout: float = 30.0,
    ):
        self.base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._timeout = timeout
        self._http: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()

    async def _get_http(self) -> httpx.AsyncClient:
        if self._http is None or self._http.is_closed:
            self._http = httpx.AsyncClient(
                base_url=self.base_url,
                headers={
                    "Content-Type": "application/json",
                    "X-API-Key": self._api_key,
                },
                timeout=self._timeout,
            )
        return self._http

    async def _request(self, method: str, path: str, **kwargs) -> Dict[str, Any]:
        http = await self._get_http()
        resp = await http.request(method, path, **kwargs)
        if resp.status_code == 401:
            raise NerveAuthError("Authentication failed -- check admin API key")
        if resp.status_code == 403:
            raise NerveAuthError("Forbidden -- admin key does not have required permissions")
        if resp.status_code >= 400:
            raise NerveError(resp.text, code=resp.status_code)
        return resp.json()

    # ------------------------------------------------------------------
    # Org management
    # ------------------------------------------------------------------

    async def create_org(self, name: str) -> Dict[str, Any]:
        return await self._request("POST", "/v1/orgs", json={"name": name})

    # ------------------------------------------------------------------
    # Domain management
    # ------------------------------------------------------------------

    async def add_domain(
        self,
        org_id: str,
        domain: str,
        dkim_method: str = "cname",
    ) -> Dict[str, Any]:
        """Add a custom email domain. Returns domain info + required DNS records."""
        return await self._request(
            "POST", "/v1/domains",
            json={"org_id": org_id, "domain": domain, "dkim_method": dkim_method},
        )

    async def list_domains(self, org_id: str) -> List[Dict[str, Any]]:
        return await self._request("GET", "/v1/domains", params={"org_id": org_id})

    async def verify_domain(self, domain_id: str) -> Dict[str, Any]:
        """Trigger DNS verification for a domain. Rate-limited to 3/min/domain."""
        return await self._request(
            "POST", "/v1/domains/verify", json={"domain_id": domain_id}
        )

    async def get_dns_records(self, domain_id: str) -> Dict[str, Any]:
        """Get the DNS records a tenant needs to configure."""
        return await self._request(
            "GET", "/v1/domains/dns", params={"domain_id": domain_id}
        )

    async def delete_domain(self, domain_id: str) -> None:
        await self._request(
            "POST", "/v1/domains/delete", json={"domain_id": domain_id}
        )

    # ------------------------------------------------------------------
    # Inbox management
    # ------------------------------------------------------------------

    async def create_inbox(self, org_id: str, address: str) -> Dict[str, Any]:
        """Create an inbox on a verified domain (e.g., support@clientclinic.com)."""
        return await self._request(
            "POST", "/v1/inboxes", json={"org_id": org_id, "address": address}
        )

    # ------------------------------------------------------------------
    # Credential management
    # ------------------------------------------------------------------

    async def issue_cloud_api_key(
        self,
        org_id: str,
        label: str = "agent",
        scopes: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Issue a long-lived Cloud API key for agent MCP access.

        Preferred over short-TTL service tokens for machine-to-machine
        access -- avoids token refresh complexity.

        Returns dict with 'key' (the API key string) and 'key_id'.
        """
        payload: Dict[str, Any] = {"org_id": org_id, "label": label}
        if scopes:
            payload["scopes"] = scopes
        return await self._request("POST", "/v1/keys", json=payload)

    async def issue_service_token(
        self,
        org_id: str,
        scopes: List[str],
        ttl_seconds: int = 900,
    ) -> Dict[str, Any]:
        """Issue a scoped service token for MCP access.

        NOTE: For long-running agent processes, prefer issue_cloud_api_key()
        which produces long-lived keys without refresh overhead.
        """
        return await self._request(
            "POST", "/v1/tokens/service",
            json={"org_id": org_id, "scopes": scopes, "ttl_seconds": ttl_seconds},
        )

    async def close(self):
        if self._http and not self._http.is_closed:
            await self._http.aclose()

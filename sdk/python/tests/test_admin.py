"""Unit tests for NerveAdmin -- control plane API client."""
import json

import httpx
import pytest
import respx

from nerve_email import NerveAdmin
from nerve_email.exceptions import NerveAuthError, NerveError


@pytest.fixture
def admin_api():
    """respx mock router for Nerve admin REST API."""
    with respx.mock(base_url="http://nerve-test:8088") as router:
        yield router


@pytest.mark.asyncio
async def test_create_org(admin_api):
    """create_org sends POST /v1/orgs."""
    admin_api.post("/v1/orgs").mock(
        return_value=httpx.Response(200, json={"org_id": "org_123", "name": "Test Org"})
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        result = await admin.create_org(name="Test Org")
        assert result["org_id"] == "org_123"


@pytest.mark.asyncio
async def test_add_domain(admin_api):
    """add_domain sends POST /v1/domains with correct payload."""
    admin_api.post("/v1/domains").mock(
        return_value=httpx.Response(200, json={
            "domain_id": "dom_1",
            "domain": "clientclinic.com",
            "status": "pending_verification",
        })
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        result = await admin.add_domain(org_id="org_123", domain="clientclinic.com")
        assert result["domain"] == "clientclinic.com"
        assert result["status"] == "pending_verification"


@pytest.mark.asyncio
async def test_verify_domain(admin_api):
    """verify_domain sends POST /v1/domains/verify."""
    admin_api.post("/v1/domains/verify").mock(
        return_value=httpx.Response(200, json={"status": "active", "outbound_ready": True})
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        result = await admin.verify_domain(domain_id="dom_1")
        assert result["status"] == "active"


@pytest.mark.asyncio
async def test_get_dns_records(admin_api):
    """get_dns_records sends GET /v1/domains/dns."""
    admin_api.get("/v1/domains/dns").mock(
        return_value=httpx.Response(200, json={
            "dns_records": [
                {"type": "CNAME", "host": "dkim._domainkey.clientclinic.com", "value": "dkim.nerve.email", "required": True, "purpose": "DKIM signing"},
            ]
        })
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        result = await admin.get_dns_records(domain_id="dom_1")
        assert len(result["dns_records"]) == 1


@pytest.mark.asyncio
async def test_create_inbox(admin_api):
    """create_inbox sends POST /v1/inboxes."""
    admin_api.post("/v1/inboxes").mock(
        return_value=httpx.Response(200, json={"inbox_id": "inbox_support", "address": "support@clientclinic.com"})
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        result = await admin.create_inbox(org_id="org_123", address="support@clientclinic.com")
        assert result["inbox_id"] == "inbox_support"


@pytest.mark.asyncio
async def test_issue_cloud_api_key(admin_api):
    """issue_cloud_api_key sends POST /v1/keys with scopes."""
    admin_api.post("/v1/keys").mock(
        return_value=httpx.Response(200, json={"key": "nerve_sk_test123", "key_id": "key_1"})
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        result = await admin.issue_cloud_api_key(
            org_id="org_123",
            label="plaintalk-agent",
            scopes=["nerve:email.read", "nerve:email.send"],
        )
        assert result["key"].startswith("nerve_sk_")
        assert result["key_id"] == "key_1"


@pytest.mark.asyncio
async def test_issue_service_token(admin_api):
    """issue_service_token sends POST /v1/tokens/service."""
    admin_api.post("/v1/tokens/service").mock(
        return_value=httpx.Response(200, json={"token": "eyJ...", "expires_in": 900})
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        result = await admin.issue_service_token(
            org_id="org_123",
            scopes=["nerve:email.read"],
            ttl_seconds=900,
        )
        assert "token" in result


@pytest.mark.asyncio
async def test_auth_error(admin_api):
    """401 response raises NerveAuthError."""
    admin_api.post("/v1/orgs").mock(
        return_value=httpx.Response(401, json={"error": "unauthorized"})
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="bad-key") as admin:
        with pytest.raises(NerveAuthError):
            await admin.create_org(name="Test")


@pytest.mark.asyncio
async def test_context_manager_cleanup(admin_api):
    """async with closes the HTTP client on exit."""
    admin_api.post("/v1/orgs").mock(
        return_value=httpx.Response(200, json={"org_id": "org_1"})
    )
    async with NerveAdmin(base_url="http://nerve-test:8088", api_key="admin-key") as admin:
        await admin.create_org(name="Test")
        http = admin._http
    assert http.is_closed

const NERVE_API_URL = process.env.NERVE_API_URL || "http://localhost:8090";
const NERVE_ADMIN_KEY = process.env.NERVE_ADMIN_KEY || "";

export class NerveApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "NerveApiError";
  }
}

async function nerveRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${NERVE_API_URL}${path}`, {
    ...options,
    // Next.js App Router caches `fetch()` GETs by default; make billing state
    // always reflect the latest control-plane data.
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": NERVE_ADMIN_KEY,
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new NerveApiError(res.status, text);
  }

  return res.json() as Promise<T>;
}

// ── Org management ─────────────────────────────────────────────

export async function createOrg(name: string): Promise<{ org_id: string }> {
  return nerveRequest("/v1/orgs", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export interface OrgRuntimeConfig {
  org_id: string;
  mcp_endpoint: string;
}

export async function getOrgRuntimeConfig(
  orgId: string,
): Promise<OrgRuntimeConfig> {
  return nerveRequest(`/v1/orgs/runtime?org_id=${encodeURIComponent(orgId)}`);
}

export async function updateOrgRuntimeConfig(
  orgId: string,
  mcpEndpoint: string,
): Promise<OrgRuntimeConfig> {
  return nerveRequest("/v1/orgs/runtime", {
    method: "PUT",
    body: JSON.stringify({
      org_id: orgId,
      mcp_endpoint: mcpEndpoint,
    }),
  });
}

// ── Subscriptions ──────────────────────────────────────────────

export interface Subscription {
  org_id: string;
  plan_code: string;
  subscription_status: string;
  external_customer_id: string | null;
  external_subscription_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  grace_until: string | null;
}

export async function getCurrentSubscription(
  orgId: string,
): Promise<Subscription> {
  return nerveRequest(
    `/v1/subscriptions/current?org_id=${encodeURIComponent(orgId)}`,
  );
}

// ── Checkout ───────────────────────────────────────────────────

export async function createCheckout(
  orgId: string,
): Promise<{ checkout_url: string; client_reference_id: string }> {
  return nerveRequest("/v1/subscriptions/checkout", {
    method: "POST",
    body: JSON.stringify({ org_id: orgId }),
  });
}

// ── Billing portal ─────────────────────────────────────────────

export async function createBillingPortal(
  orgId: string,
): Promise<{ url: string }> {
  return nerveRequest("/v1/billing/portal", {
    method: "POST",
    body: JSON.stringify({ org_id: orgId }),
  });
}

// ── Cloud API keys ────────────────────────────────────────────

export interface CloudApiKey {
  id: string;
  key_prefix: string;
  label: string;
  scopes: string[];
  created_at: string;
  revoked_at?: string;
}

export interface CreatedCloudApiKey extends CloudApiKey {
  key: string;
}

export async function createCloudApiKey(
  orgId: string,
  scopes: string[],
  label = "",
): Promise<CreatedCloudApiKey> {
  return nerveRequest("/v1/keys", {
    method: "POST",
    body: JSON.stringify({
      org_id: orgId,
      scopes,
      label,
    }),
  });
}

export async function listCloudApiKeys(
  orgId: string,
): Promise<{ keys: CloudApiKey[] }> {
  return nerveRequest(`/v1/keys?org_id=${encodeURIComponent(orgId)}`);
}

export async function revokeCloudApiKey(
  orgId: string,
  keyId: string,
): Promise<{ status: string }> {
  return nerveRequest(
    `/v1/keys/${encodeURIComponent(keyId)}?org_id=${encodeURIComponent(orgId)}`,
    { method: "DELETE" },
  );
}

// ── Service tokens ─────────────────────────────────────────────

export interface ServiceToken {
  token: string;
  token_id: string;
  expires_at: string;
  scopes: string[];
}

export async function issueServiceToken(
  orgId: string,
  scopes: string[],
  ttlSeconds = 900,
  rotate = false,
): Promise<ServiceToken> {
  return nerveRequest("/v1/tokens/service", {
    method: "POST",
    body: JSON.stringify({
      org_id: orgId,
      scopes,
      ttl_seconds: ttlSeconds,
      rotate,
    }),
  });
}

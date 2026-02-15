"use client";

import { useEffect, useMemo, useState } from "react";
import type { CloudApiKey } from "@/lib/nerve-api";

const AVAILABLE_SCOPES = [
  { value: "nerve:email.read", label: "Read emails" },
  { value: "nerve:email.search", label: "Search emails" },
  { value: "nerve:email.draft", label: "Draft emails" },
  { value: "nerve:email.send", label: "Send emails" },
] as const;

const FALLBACK_MCP_ENDPOINT =
  process.env.NEXT_PUBLIC_NERVE_DEFAULT_MCP_ENDPOINT ||
  "https://nerve-runtime.fly.dev/mcp";

export default function ApiKeysPage() {
  const [label, setLabel] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([
    "nerve:email.read",
  ]);
  const [keys, setKeys] = useState<CloudApiKey[]>([]);
  const [latestKey, setLatestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [loading, setLoading] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [mcpDefaultEndpoint, setMcpDefaultEndpoint] = useState(
    FALLBACK_MCP_ENDPOINT,
  );
  const [mcpOverride, setMcpOverride] = useState("");
  const [savedMcpOverride, setSavedMcpOverride] = useState("");
  const [runtimeLoading, setRuntimeLoading] = useState(true);
  const [runtimeSaving, setRuntimeSaving] = useState(false);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [runtimeMessage, setRuntimeMessage] = useState<string | null>(null);
  const [copiedEndpoint, setCopiedEndpoint] = useState(false);

  const activeCount = useMemo(
    () => keys.filter((key) => !key.revoked_at).length,
    [keys],
  );

  const effectiveMcpEndpoint = useMemo(() => {
    const override = mcpOverride.trim();
    if (override !== "") return override;
    return mcpDefaultEndpoint;
  }, [mcpDefaultEndpoint, mcpOverride]);

  const runtimeDirty = useMemo(
    () => mcpOverride.trim() !== savedMcpOverride,
    [mcpOverride, savedMcpOverride],
  );

  useEffect(() => {
    void loadKeys();
    void loadRuntimeConfig();
  }, []);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function loadKeys() {
    setError(null);
    setLoadingKeys(true);

    try {
      const res = await fetch("/api/keys", { method: "GET" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load API keys");
        return;
      }
      setKeys(Array.isArray(data.keys) ? data.keys : []);
    } catch {
      setError("Network error");
    } finally {
      setLoadingKeys(false);
    }
  }

  async function loadRuntimeConfig() {
    setRuntimeError(null);
    setRuntimeLoading(true);

    try {
      const res = await fetch("/api/org-runtime", { method: "GET" });
      const data = await res.json();
      if (!res.ok) {
        setRuntimeError(data.error || "Failed to load MCP endpoint");
        return;
      }

      const defaultEndpoint =
        typeof data.default_mcp_endpoint === "string" &&
        data.default_mcp_endpoint.trim() !== ""
          ? data.default_mcp_endpoint.trim()
          : FALLBACK_MCP_ENDPOINT;
      const savedOverride =
        typeof data.mcp_endpoint === "string" ? data.mcp_endpoint.trim() : "";

      setMcpDefaultEndpoint(defaultEndpoint);
      setMcpOverride(savedOverride);
      setSavedMcpOverride(savedOverride);
    } catch {
      setRuntimeError("Network error");
    } finally {
      setRuntimeLoading(false);
    }
  }

  async function generateKey() {
    setError(null);
    setLatestKey(null);
    setLoading(true);

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          scopes: selectedScopes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate key");
        return;
      }

      setLatestKey(data.key);
      setLabel("");
      setKeys((prev) => {
        const next = [
          {
            id: data.id,
            key_prefix: data.key_prefix,
            label: data.label || "",
            scopes: Array.isArray(data.scopes) ? data.scopes : selectedScopes,
            created_at: data.created_at,
            revoked_at: data.revoked_at,
          } as CloudApiKey,
          ...prev.filter((key) => key.id !== data.id),
        ];
        return next;
      });
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function revokeKey(id: string) {
    setError(null);
    setRevokingId(id);

    try {
      const res = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to revoke key");
        return;
      }
      setKeys((prev) =>
        prev.map((key) =>
          key.id === id
            ? { ...key, revoked_at: new Date().toISOString() }
            : key,
        ),
      );
    } catch {
      setError("Network error");
    } finally {
      setRevokingId(null);
    }
  }

  async function copyLatestKey() {
    if (!latestKey) return;
    await navigator.clipboard.writeText(latestKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  async function saveRuntimeConfig() {
    setRuntimeError(null);
    setRuntimeMessage(null);
    setRuntimeSaving(true);

    try {
      const res = await fetch("/api/org-runtime", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcp_endpoint: mcpOverride.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRuntimeError(data.error || "Failed to save MCP endpoint");
        return;
      }

      const defaultEndpoint =
        typeof data.default_mcp_endpoint === "string" &&
        data.default_mcp_endpoint.trim() !== ""
          ? data.default_mcp_endpoint.trim()
          : mcpDefaultEndpoint;
      const savedOverride =
        typeof data.mcp_endpoint === "string" ? data.mcp_endpoint.trim() : "";

      setMcpDefaultEndpoint(defaultEndpoint);
      setMcpOverride(savedOverride);
      setSavedMcpOverride(savedOverride);
      setRuntimeMessage(
        savedOverride === ""
          ? "Using default MCP endpoint"
          : "Custom MCP endpoint override saved",
      );
    } catch {
      setRuntimeError("Network error");
    } finally {
      setRuntimeSaving(false);
    }
  }

  async function copyEndpoint() {
    if (!effectiveMcpEndpoint) return;
    await navigator.clipboard.writeText(effectiveMcpEndpoint);
    setCopiedEndpoint(true);
    setTimeout(() => setCopiedEndpoint(false), 1500);
  }

  function formatTime(value: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString();
  }

  function runtimeSaveLabel() {
    if (runtimeSaving) return "Saving…";
    if (mcpOverride.trim() === "") return "Use default endpoint";
    return "Save override";
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">API Keys</h1>
      <p className="max-w-prose text-sm text-muted">
        Generate long-lived Cloud API keys for your integrations. Raw keys are
        shown once, but key metadata can be viewed and revoked at any time.
      </p>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h3 className="mb-2 text-sm font-medium text-ink">MCP endpoint</h3>
        <p className="mb-4 text-sm text-muted">
          Use this endpoint in your integrations. By default all tenants use the
          shared runtime endpoint and are isolated by API key/org.
        </p>

        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="mcp-effective">
          Effective endpoint
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="mcp-effective"
            type="text"
            value={effectiveMcpEndpoint}
            readOnly
            className="min-w-0 flex-1 rounded-[14px] border border-line bg-bg-1 px-4 py-3 text-sm text-ink outline-none"
          />
          <button
            onClick={copyEndpoint}
            disabled={!effectiveMcpEndpoint}
            className="rounded-[14px] border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-bg-1 disabled:opacity-50"
          >
            {copiedEndpoint ? "Copied!" : "Copy endpoint"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          {mcpOverride.trim() === ""
            ? "Using default shared runtime endpoint."
            : "Using custom endpoint override for this org."}
        </p>

        <div className="mt-5 border-t border-line pt-5">
          <label className="mb-2 block text-sm font-medium text-ink" htmlFor="mcp-override">
            Custom endpoint override (optional)
          </label>
          <input
            id="mcp-override"
            type="url"
            value={mcpOverride}
            onChange={(e) => setMcpOverride(e.target.value)}
            placeholder={mcpDefaultEndpoint}
            className="w-full rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <p className="mt-2 text-xs text-muted">
            Leave empty to use the default endpoint shown above.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={saveRuntimeConfig}
              disabled={runtimeSaving || !runtimeDirty}
              className="rounded-[14px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
            >
              {runtimeSaveLabel()}
            </button>
            <button
              onClick={() => {
                setMcpOverride(savedMcpOverride);
                setRuntimeMessage(null);
                setRuntimeError(null);
              }}
              disabled={runtimeSaving || !runtimeDirty}
              className="rounded-[14px] border border-line bg-card px-5 py-2.5 text-sm font-medium text-ink transition hover:bg-bg-1 disabled:opacity-50"
            >
              Discard changes
            </button>
          </div>
        </div>

        {runtimeLoading && <p className="mt-3 text-sm text-muted">Loading saved override…</p>}
        {runtimeMessage && <p className="mt-3 text-sm text-emerald-700">{runtimeMessage}</p>}
        {runtimeError && <p className="mt-3 text-sm text-red-600">{runtimeError}</p>}
      </div>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-medium text-ink">Create API key</h3>
        <label className="mb-3 block text-sm font-medium text-ink" htmlFor="label">
          Label (optional)
        </label>
        <input
          id="label"
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Backend integration"
          className="mb-5 w-full rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
        />
        <h4 className="mb-3 text-sm font-medium text-ink">Scopes</h4>
        <div className="flex flex-col gap-3">
          {AVAILABLE_SCOPES.map(({ value, label }) => (
            <label
              key={value}
              className="flex items-center gap-3 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedScopes.includes(value)}
                onChange={() => toggleScope(value)}
                className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
              />
              <span className="text-sm text-ink">{label}</span>
              <span className="text-xs text-muted font-mono">{value}</span>
            </label>
          ))}
        </div>

        <button
          onClick={generateKey}
          disabled={selectedScopes.length === 0 || loading}
          className="mt-6 rounded-[14px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate key"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {latestKey && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 shadow-sm">
          <h3 className="mb-2 text-sm font-medium text-ink">Your new API key</h3>
          <p className="text-xs text-muted mb-3">
            Copy this key now. It will not be shown again.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-ink/5 px-4 py-3 text-xs font-mono text-ink break-all">
              {latestKey}
            </code>
            <button
              onClick={copyLatestKey}
              className="shrink-0 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-bg-1"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">
            Existing keys ({activeCount} active)
          </h3>
          <button
            onClick={() => void loadKeys()}
            className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg-1"
          >
            Refresh
          </button>
        </div>

        {loadingKeys ? (
          <p className="text-sm text-muted">Loading keys…</p>
        ) : keys.length === 0 ? (
          <p className="text-sm text-muted">
            No API keys yet. Generate your first key above.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {keys.map((key) => {
              const isRevoked = Boolean(key.revoked_at);
              return (
                <div
                  key={key.id}
                  className="rounded-xl border border-line bg-bg-0 p-4"
                >
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">
                        {key.label || "Unlabeled key"}
                      </p>
                      <p className="text-xs font-mono text-muted">
                        {key.key_prefix}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        isRevoked
                          ? "bg-ink/10 text-muted"
                          : "bg-emerald-100 text-emerald-700"
                      }`}
                    >
                      {isRevoked ? "Revoked" : "Active"}
                    </span>
                  </div>

                  <p className="mb-1 text-xs text-muted">
                    Scopes: {key.scopes.join(", ")}
                  </p>
                  <p className="text-xs text-muted">
                    Created: {formatTime(key.created_at)}
                  </p>
                  {key.revoked_at && (
                    <p className="text-xs text-muted">
                      Revoked: {formatTime(key.revoked_at)}
                    </p>
                  )}

                  {!isRevoked && (
                    <button
                      onClick={() => void revokeKey(key.id)}
                      disabled={revokingId === key.id}
                      className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                    >
                      {revokingId === key.id ? "Revoking…" : "Revoke"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

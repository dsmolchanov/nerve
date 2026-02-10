"use client";

import { useState } from "react";

const AVAILABLE_SCOPES = [
  { value: "nerve:email.read", label: "Read emails" },
  { value: "nerve:email.search", label: "Search emails" },
  { value: "nerve:email.draft", label: "Draft emails" },
  { value: "nerve:email.send", label: "Send emails" },
] as const;

export default function ApiKeysPage() {
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  function toggleScope(scope: string) {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope],
    );
  }

  async function generateToken() {
    setError(null);
    setToken(null);
    setLoading(true);

    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scopes: selectedScopes }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to generate token");
        return;
      }

      setToken(data.token);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function copyToken() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-heading text-2xl font-semibold text-ink">API Keys</h1>
      <p className="max-w-prose text-sm text-muted">
        Generate a service token with the permissions your integration needs.
        Tokens are shown once — copy it before leaving this page.
      </p>

      {/* Scope selection */}
      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h3 className="text-sm font-medium text-ink mb-4">Select scopes</h3>
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
          onClick={generateToken}
          disabled={selectedScopes.length === 0 || loading}
          className="mt-6 rounded-[14px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
        >
          {loading ? "Generating…" : "Generate token"}
        </button>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      {/* Token display */}
      {token && (
        <div className="rounded-2xl border border-accent/30 bg-accent/5 p-6 shadow-sm">
          <h3 className="text-sm font-medium text-ink mb-2">
            Your service token
          </h3>
          <p className="text-xs text-muted mb-3">
            Copy this token now. It will not be shown again.
          </p>
          <div className="flex gap-2">
            <code className="flex-1 overflow-x-auto rounded-lg bg-ink/5 px-4 py-3 text-xs font-mono text-ink break-all">
              {token}
            </code>
            <button
              onClick={copyToken}
              className="shrink-0 rounded-lg border border-line bg-card px-4 py-2 text-sm font-medium text-ink transition hover:bg-bg-1"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

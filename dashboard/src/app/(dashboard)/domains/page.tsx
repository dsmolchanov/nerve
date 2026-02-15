"use client";

import { useEffect, useMemo, useState } from "react";
import type { DNSRecord, OrgDomain } from "@/lib/nerve-api";

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatRemaining(expiresAt?: string) {
  if (!expiresAt) return "";
  const date = new Date(expiresAt);
  const ms = date.getTime() - Date.now();
  if (Number.isNaN(ms)) return "";
  if (ms <= 0) return "Expired";
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "active") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (s === "pending") {
    return "bg-amber-100 text-amber-700";
  }
  if (s === "failed") {
    return "bg-red-100 text-red-700";
  }
  return "bg-ink/10 text-muted";
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<OrgDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [domainInput, setDomainInput] = useState("");
  const [adding, setAdding] = useState(false);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dnsByDomainId, setDnsByDomainId] = useState<
    Record<string, DNSRecord[]>
  >({});
  const [dnsLoadingId, setDnsLoadingId] = useState<string | null>(null);

  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<Record<string, string>>(
    {},
  );

  const activeCount = useMemo(
    () => domains.filter((d) => d.status === "active").length,
    [domains],
  );

  useEffect(() => {
    void loadDomains();
  }, []);

  async function loadDomains() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/domains", { method: "GET" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load domains");
        return;
      }
      setDomains(Array.isArray(data.domains) ? data.domains : []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function addDomain() {
    const domain = domainInput.trim();
    if (!domain) return;

    setError(null);
    setAdding(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to add domain");
        return;
      }
      const created: OrgDomain | null =
        data && typeof data === "object" && data.domain ? data.domain : null;
      if (created) {
        setDomains((prev) => [created, ...prev.filter((d) => d.id !== created.id)]);
        if (Array.isArray(created.dns_records)) {
          setDnsByDomainId((prev) => ({ ...prev, [created.id]: created.dns_records! }));
          setExpanded((prev) => ({ ...prev, [created.id]: true }));
        }
      } else {
        await loadDomains();
      }
      setDomainInput("");
    } catch {
      setError("Network error");
    } finally {
      setAdding(false);
    }
  }

  async function toggleDNS(domainId: string) {
    setExpanded((prev) => ({ ...prev, [domainId]: !prev[domainId] }));
    if (dnsByDomainId[domainId]) return;

    setDnsLoadingId(domainId);
    try {
      const res = await fetch(
        `/api/domains/dns?domain_id=${encodeURIComponent(domainId)}`,
        { method: "GET" },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to load DNS records");
        return;
      }
      setDnsByDomainId((prev) => ({
        ...prev,
        [domainId]: Array.isArray(data.dns_records) ? data.dns_records : [],
      }));
    } catch {
      setError("Network error");
    } finally {
      setDnsLoadingId(null);
    }
  }

  async function verifyDomain(domainId: string) {
    setError(null);
    setVerifyingId(domainId);
    setVerifyMessage((prev) => ({ ...prev, [domainId]: "" }));

    try {
      const res = await fetch("/api/domains/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ domain_id: domainId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Verification failed");
        return;
      }
      const updated: OrgDomain | null =
        data && typeof data === "object" && data.domain ? data.domain : null;
      if (updated) {
        setDomains((prev) =>
          prev.map((d) => (d.id === updated.id ? updated : d)),
        );
      }

      const details =
        data &&
        typeof data === "object" &&
        data.checks &&
        typeof data.checks.details === "string"
          ? data.checks.details
          : "";
      setVerifyMessage((prev) => ({ ...prev, [domainId]: details }));
    } catch {
      setError("Network error");
    } finally {
      setVerifyingId(null);
    }
  }

  async function deleteDomain(domainId: string) {
    setError(null);
    setDeletingId(domainId);
    try {
      const res = await fetch(`/api/domains?id=${encodeURIComponent(domainId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete domain");
        return;
      }
      setDomains((prev) => prev.filter((d) => d.id !== domainId));
    } catch {
      setError("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  async function copy(value: string, key: string) {
    await navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1200);
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink">Domains</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Verify your domain to use branded inbox addresses like{" "}
          <span className="font-mono">support@yourdomain.com</span>.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-medium text-ink">Add domain</h3>
        <label className="mb-2 block text-sm font-medium text-ink" htmlFor="domain">
          Domain
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            id="domain"
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            placeholder="plaintalk.com"
            className="min-w-0 flex-1 rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
          />
          <button
            onClick={() => void addDomain()}
            disabled={adding || domainInput.trim() === ""}
            className="rounded-[14px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
          >
            {adding ? "Adding…" : "Add domain"}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted">
          We’ll give you a DNS TXT record to add. Then click Verify.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">
            Your domains ({activeCount} active)
          </h3>
          <button
            onClick={() => void loadDomains()}
            className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg-1"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-muted">Loading domains…</p>
        ) : domains.length === 0 ? (
          <p className="text-sm text-muted">No domains yet. Add your first domain above.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {domains.map((d) => {
              const isActive = d.status === "active";
              const remaining = d.status === "pending" ? formatRemaining(d.expires_at) : "";
              const isExpanded = Boolean(expanded[d.id]);
              const dns = dnsByDomainId[d.id];

              return (
                <div key={d.id} className="rounded-xl border border-line bg-bg-0 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{d.domain}</p>
                      <p className="mt-1 text-xs text-muted">
                        Added: {formatTime(d.created_at)}
                        {d.verified_at ? ` • Verified: ${formatTime(d.verified_at)}` : ""}
                        {d.last_check_at ? ` • Last check: ${formatTime(d.last_check_at)}` : ""}
                        {remaining ? ` • Expires in: ${remaining}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(
                          d.status,
                        )}`}
                      >
                        {d.status}
                      </span>
                      <button
                        onClick={() => void toggleDNS(d.id)}
                        className="rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg-1"
                      >
                        {isExpanded ? "Hide DNS" : "DNS"}
                      </button>
                      <button
                        onClick={() => void verifyDomain(d.id)}
                        disabled={verifyingId === d.id}
                        className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
                      >
                        {verifyingId === d.id ? "Verifying…" : isActive ? "Re-check" : "Verify"}
                      </button>
                      <button
                        onClick={() => void deleteDomain(d.id)}
                        disabled={deletingId === d.id}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                      >
                        {deletingId === d.id ? "Deleting…" : "Delete"}
                      </button>
                    </div>
                  </div>

                  {verifyMessage[d.id] && (
                    <p className="mt-3 text-xs text-muted">{verifyMessage[d.id]}</p>
                  )}

                  {isExpanded && (
                    <div className="mt-4 rounded-xl border border-line bg-card p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-medium text-ink">DNS records</p>
                        {dnsLoadingId === d.id && (
                          <p className="text-xs text-muted">Loading…</p>
                        )}
                      </div>

                      {dns && dns.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          {dns.map((r, idx) => {
                            const copyKey = `${d.id}:${idx}`;
                            return (
                              <div
                                key={copyKey}
                                className="rounded-lg border border-line bg-bg-0 p-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="text-xs font-medium text-ink">
                                      {r.type}{" "}
                                      <span className="text-muted">
                                        ({r.required ? "Required" : "Optional"})
                                      </span>
                                    </p>
                                    <p className="mt-1 text-xs text-muted">
                                      Host:{" "}
                                      <span className="font-mono text-ink">{r.host}</span>
                                    </p>
                                    <p className="mt-1 break-all text-xs text-muted">
                                      Value:{" "}
                                      <span className="font-mono text-ink">{r.value}</span>
                                    </p>
                                    {r.purpose && (
                                      <p className="mt-1 text-xs text-muted">
                                        {r.purpose}
                                      </p>
                                    )}
                                  </div>
                                  <button
                                    onClick={() => void copy(r.value, copyKey)}
                                    className="shrink-0 rounded-lg border border-line bg-card px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-bg-1"
                                  >
                                    {copiedKey === copyKey ? "Copied!" : "Copy value"}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted">
                          No DNS records available yet.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  );
}


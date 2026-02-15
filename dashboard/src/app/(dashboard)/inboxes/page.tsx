"use client";

import { useEffect, useMemo, useState } from "react";
import type { Inbox, OrgDomain } from "@/lib/nerve-api";

function statusBadge(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "active") return "bg-emerald-100 text-emerald-700";
  if (s === "disabled") return "bg-ink/10 text-muted";
  return "bg-ink/10 text-muted";
}

function formatTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function InboxesPage() {
  const [domains, setDomains] = useState<OrgDomain[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [localPart, setLocalPart] = useState("");
  const [selectedDomainId, setSelectedDomainId] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const activeDomains = useMemo(
    () => domains.filter((d) => d.status === "active"),
    [domains],
  );

  const selectedDomain = useMemo(() => {
    const id = selectedDomainId.trim();
    if (!id) return null;
    return activeDomains.find((d) => d.id === id) ?? null;
  }, [activeDomains, selectedDomainId]);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    // Default to the first active domain once domains load.
    if (selectedDomainId !== "") return;
    if (activeDomains.length === 0) return;
    setSelectedDomainId(activeDomains[0]!.id);
  }, [activeDomains, selectedDomainId]);

  async function loadAll() {
    setError(null);
    setLoading(true);
    try {
      const [domainsRes, inboxesRes] = await Promise.all([
        fetch("/api/domains", { method: "GET" }),
        fetch("/api/inboxes", { method: "GET" }),
      ]);

      const domainsData = await domainsRes.json().catch(() => ({}));
      const inboxesData = await inboxesRes.json().catch(() => ({}));

      if (!domainsRes.ok) {
        setError(domainsData.error || "Failed to load domains");
        return;
      }
      if (!inboxesRes.ok) {
        setError(inboxesData.error || "Failed to load inboxes");
        return;
      }

      setDomains(Array.isArray(domainsData.domains) ? domainsData.domains : []);
      setInboxes(Array.isArray(inboxesData.inboxes) ? inboxesData.inboxes : []);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function createInbox() {
    const lp = localPart.trim().toLowerCase();
    if (!lp) return;

    // Keep it conservative to match backend canonicalization behavior.
    if (!/^[a-z0-9]([a-z0-9._+-]*[a-z0-9])?$/.test(lp)) {
      setError("Local part must be ASCII and may include . _ + - (no spaces).");
      return;
    }

    if (!selectedDomain) {
      setError("Select a verified domain first.");
      return;
    }

    setError(null);
    setCreating(true);
    try {
      const address = `${lp}@${selectedDomain.domain}`;
      const res = await fetch("/api/inboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          domain_id: selectedDomain.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create inbox");
        return;
      }

      const created: Inbox | null =
        data && typeof data === "object" && data.inbox ? data.inbox : null;
      if (created) {
        setInboxes((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
      } else {
        await loadAll();
      }

      setLocalPart("");
    } catch {
      setError("Network error");
    } finally {
      setCreating(false);
    }
  }

  async function deleteInbox(inboxId: string) {
    setError(null);
    setDeletingId(inboxId);
    try {
      const res = await fetch(`/api/inboxes?id=${encodeURIComponent(inboxId)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to delete inbox");
        return;
      }
      setInboxes((prev) =>
        prev.map((i) => (i.id === inboxId ? { ...i, status: "disabled" } : i)),
      );
    } catch {
      setError("Network error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-ink">Inboxes</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">
          Create branded inbox addresses on your verified domains.
        </p>
      </div>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <h3 className="mb-4 text-sm font-medium text-ink">Create inbox</h3>

        {activeDomains.length === 0 ? (
          <p className="text-sm text-muted">
            You don&apos;t have any active domains yet. Verify a domain first in{" "}
            <a className="font-medium text-accent hover:underline" href="/domains">
              Domains
            </a>
            .
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  className="mb-2 block text-sm font-medium text-ink"
                  htmlFor="localPart"
                >
                  Local part
                </label>
                <input
                  id="localPart"
                  type="text"
                  value={localPart}
                  onChange={(e) => setLocalPart(e.target.value)}
                  placeholder="support"
                  className="w-full rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/60 outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                />
              </div>

              <div>
                <label
                  className="mb-2 block text-sm font-medium text-ink"
                  htmlFor="domain"
                >
                  Domain
                </label>
                <select
                  id="domain"
                  value={selectedDomainId}
                  onChange={(e) => setSelectedDomainId(e.target.value)}
                  className="w-full rounded-[14px] border border-line bg-white px-4 py-3 text-sm text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent"
                >
                  {activeDomains.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.domain}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <p className="mt-2 text-xs text-muted">
              Example:{" "}
              <span className="font-mono">
                {localPart.trim() ? localPart.trim().toLowerCase() : "support"}@
                {selectedDomain?.domain ?? activeDomains[0]!.domain}
              </span>
            </p>

            <div className="mt-4 flex items-center gap-2">
              <button
                onClick={() => void createInbox()}
                disabled={creating || localPart.trim() === "" || !selectedDomain}
                className="rounded-[14px] bg-accent px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create inbox"}
              </button>
              <button
                onClick={() => void loadAll()}
                disabled={loading}
                className="rounded-[14px] border border-line bg-white px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-bg-1 disabled:opacity-50"
              >
                Refresh
              </button>
            </div>
          </>
        )}

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-ink">Your inboxes</h3>
          {loading && (
            <span className="text-xs font-medium text-muted">Loading…</span>
          )}
        </div>

        {inboxes.length === 0 && !loading ? (
          <p className="text-sm text-muted">
            No inboxes yet. Create your first one above.
          </p>
        ) : (
          <div className="space-y-3">
            {inboxes.map((inbox) => (
              <div
                key={inbox.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-ink">
                      {inbox.address}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusBadge(inbox.status)}`}
                    >
                      {inbox.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    Created {formatTime(inbox.created_at)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void deleteInbox(inbox.id)}
                    disabled={deletingId === inbox.id || inbox.status === "disabled"}
                    className="rounded-[14px] border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-bg-1 disabled:opacity-50"
                  >
                    {inbox.status === "disabled"
                      ? "Disabled"
                      : deletingId === inbox.id
                        ? "Disabling…"
                        : "Disable"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


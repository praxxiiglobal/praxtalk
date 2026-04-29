"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";
type _IdHint = Id<"apiKeys">; // re-export to silence unused-import lint when present
void (null as unknown as _IdHint);

type Scope = "read" | "write";
type BrandScope = "all" | string; // "all" or an Id<"brands">

export function ApiKeysSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const keys = useQuery(api.apiKeys.list, { sessionToken });
  const brands = useQuery(api.brands.listMine, { sessionToken });
  const createKey = useMutation(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);

  const canManage = operator.role !== "agent";

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [scope, setScope] = useState<Scope>("write");
  const [brandScope, setBrandScope] = useState<BrandScope>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ name: string; secret: string } | null>(
    null,
  );

  const onMint = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { secret } = await createKey({
        sessionToken,
        name: name.trim(),
        scope,
        brandId:
          brandScope === "all"
            ? undefined
            : (brandScope as unknown as Id<"brands">),
      });
      setMinted({ name: name.trim(), secret });
      setName("");
      setScope("write");
      setBrandScope("all");
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't mint key.");
    } finally {
      setBusy(false);
    }
  };

  const onRevoke = async (id: Id<"apiKeys">) => {
    if (!confirm("Revoke this key? Apps using it will stop working immediately.")) {
      return;
    }
    await revokeKey({ sessionToken, keyId: id });
  };

  return (
    <Card
      title="API keys"
      description="Mint a key, copy the secret once (it's never shown again), then send REST requests with `Authorization: Bearer <secret>`."
    >
      {minted ? (
        <div className="mb-4 rounded-xl border border-good bg-good/10 p-4">
          <div className="text-sm font-medium text-ink">
            Key minted ✓ — copy it now, you won't see it again
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-rule bg-paper p-3">
            <code className="flex-1 break-all font-mono text-[12.5px] text-ink">
              {minted.secret}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(minted.secret)}
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMinted(null)}
            className="mt-3 text-[12px] font-medium text-muted underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {keys === undefined ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : keys.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          No keys yet. Mint your first one below to start hitting the REST API.
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {keys.map((k) => {
            const brand = k.brandId
              ? brands?.find((b) => String(b._id) === String(k.brandId))
              : null;
            return (
              <li key={k._id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="truncate font-medium text-ink">
                      {k.name}
                    </span>
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
                        k.scope === "write"
                          ? "border-ink text-ink"
                          : "border-rule-2 text-muted",
                      )}
                    >
                      {k.scope}
                    </span>
                    {brand ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-paper"
                        style={{ backgroundColor: brand.primaryColor }}
                        title={`Scoped to ${brand.name}`}
                      >
                        {brand.name}
                      </span>
                    ) : (
                      <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                        all brands
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                    {k.prefix}
                    <span className="opacity-50">…</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-muted">
                    created {timeAgo(k.createdAt)}
                    {k.lastUsedAt
                      ? ` · last used ${timeAgo(k.lastUsedAt)}`
                      : " · never used"}
                  </div>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={() => onRevoke(k._id)}
                    className="inline-flex h-8 shrink-0 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium text-warn transition hover:-translate-y-px"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {canManage && (
        <div className="mt-5 border-t border-rule pt-5">
          {showForm ? (
            <form onSubmit={onMint} className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 sm:col-span-3">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Name
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Acme CRM production"
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Scope
                </span>
                <select
                  value={scope}
                  onChange={(e) => setScope(e.target.value as Scope)}
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                >
                  <option value="write">Read + write</option>
                  <option value="read">Read-only</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Brand access
                </span>
                <select
                  value={brandScope}
                  onChange={(e) => setBrandScope(e.target.value)}
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                >
                  <option value="all">All brands (full workspace)</option>
                  {(brands ?? []).map((b) => (
                    <option key={b._id} value={b._id}>
                      Scoped to {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end justify-end gap-2 sm:col-span-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
                >
                  {busy ? "Minting…" : "Mint key"}
                </button>
              </div>
              {error ? (
                <p className="sm:col-span-3 text-[12px] text-warn">{error}</p>
              ) : null}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
            >
              + Mint API key
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

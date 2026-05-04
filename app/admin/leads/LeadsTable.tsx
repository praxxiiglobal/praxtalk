"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type Status = "new" | "contacted" | "qualified" | "won" | "lost";

type Row = {
  _id: string;
  workspaceId: string;
  workspaceSlug: string;
  workspaceName: string;
  brandId: string;
  brandName: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: Status;
  country: string | null;
  city: string | null;
  notes: string | null;
  createdByName: string;
  createdByEmail: string;
  createdAt: number;
  updatedAt: number;
  conversationId: string | null;
};

const STATUS_FILTERS: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "contacted", label: "Contacted" },
  { key: "qualified", label: "Qualified" },
  { key: "won", label: "Won" },
  { key: "lost", label: "Lost" },
];

export function LeadsTable({
  leads,
  activeStatus,
}: {
  leads: Row[];
  activeStatus: Status | null;
}) {
  const router = useRouter();
  const search = useSearchParams();
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.email?.toLowerCase().includes(q) ?? false) ||
        (l.phone?.toLowerCase().includes(q) ?? false) ||
        l.workspaceName.toLowerCase().includes(q) ||
        l.workspaceSlug.toLowerCase().includes(q) ||
        l.brandName.toLowerCase().includes(q),
    );
  }, [leads, filter]);

  const setStatusFilter = (k: Status | "all") => {
    const next = new URLSearchParams(search.toString());
    if (k === "all") next.delete("status");
    else next.set("status", k);
    router.push(`/admin/leads?${next.toString()}`);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name, email, workspace, brand…"
          className="h-9 w-72 rounded-full border border-rule-2 bg-paper px-3.5 text-sm outline-none focus:border-ink"
        />
        <span className="ml-auto font-mono text-[11px] text-muted">
          {filtered.length} of {leads.length}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {STATUS_FILTERS.map((f) => {
          const active =
            f.key === "all" ? activeStatus === null : activeStatus === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={
                "inline-flex h-7 items-center rounded-full px-3 font-mono text-[10.5px] uppercase tracking-[0.06em] transition " +
                (active
                  ? "bg-ink text-paper"
                  : "border border-rule-2 text-muted hover:text-ink hover:border-rule")
              }
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rule-2 px-5 py-10 text-center text-sm text-muted">
          No leads match.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-rule-2">
          <table className="w-full text-sm">
            <thead className="bg-paper-2/60 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="px-3 py-2.5">Lead</th>
                <th className="px-3 py-2.5">Contact</th>
                <th className="px-3 py-2.5">Workspace · Brand</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Where</th>
                <th className="px-3 py-2.5">Captured by</th>
                <th className="px-3 py-2.5">Last update</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {filtered.map((l) => (
                <tr key={l._id} className="hover:bg-paper-2/30">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-ink">{l.name}</div>
                    {l.notes && (
                      <div className="mt-0.5 max-w-xs truncate text-[11px] text-muted">
                        {l.notes}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px]">
                    {l.email && (
                      <a
                        href={`mailto:${l.email}`}
                        className="block truncate text-ink hover:underline"
                      >
                        {l.email}
                      </a>
                    )}
                    {l.phone && (
                      <a
                        href={`tel:${l.phone}`}
                        className="block truncate text-muted hover:text-ink"
                      >
                        {l.phone}
                      </a>
                    )}
                    {!l.email && !l.phone && (
                      <span className="text-muted">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/workspaces/${l.workspaceId}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {l.workspaceName}
                    </Link>
                    <div className="font-mono text-[10.5px] text-muted">
                      {l.workspaceSlug} · {l.brandName}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={l.status} />
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted">
                    {[l.city, l.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-3 py-2.5 text-[12px]">
                    <div className="text-ink">{l.createdByName || "—"}</div>
                    <div className="font-mono text-[10.5px] text-muted">
                      {l.createdByEmail}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted">
                    {relativeAgo(l.updatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function StatusPill({ status }: { status: Status }) {
  const cls =
    status === "won"
      ? "bg-good/15 text-good"
      : status === "lost"
        ? "bg-paper-2 text-muted"
        : status === "qualified"
          ? "bg-good/15 text-good"
          : status === "contacted"
            ? "bg-yellow-100 text-yellow-800"
            : "bg-orange-100 text-orange-800";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${cls}`}
    >
      {status}
    </span>
  );
}

function relativeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  if (diff < 604_800_000) return `${Math.round(diff / 86_400_000)}d ago`;
  return new Date(ts).toLocaleDateString();
}

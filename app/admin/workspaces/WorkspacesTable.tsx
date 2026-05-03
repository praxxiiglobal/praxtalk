"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Row = {
  _id: string;
  slug: string;
  name: string;
  plan: "spark" | "team" | "scale" | "enterprise";
  subscriptionStatus: "active" | "past_due" | "cancelled" | "paused" | null;
  subscriptionProvider: "paypal" | "razorpay" | null;
  createdAt: number;
  operatorCount: number;
  brandCount: number;
  conversationCount: number;
  atlasRunsThisMonth: number;
  lastActivityAt: number | null;
};

type SortKey =
  | "createdAt"
  | "name"
  | "plan"
  | "operatorCount"
  | "conversationCount"
  | "atlasRunsThisMonth"
  | "lastActivityAt";

export function WorkspacesTable({ workspaces }: { workspaces: Row[] }) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const list = q
      ? workspaces.filter(
          (w) =>
            w.name.toLowerCase().includes(q) ||
            w.slug.toLowerCase().includes(q),
        )
      : workspaces;
    const sorted = [...list].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc"
        ? Number(av) - Number(bv)
        : Number(bv) - Number(av);
    });
    return sorted;
  }, [workspaces, filter, sortKey, sortDir]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name or slug…"
          className="h-9 w-72 rounded-full border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        />
        <span className="font-mono text-[11px] text-muted">
          Showing {filtered.length} of {workspaces.length}
        </span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-rule-2">
        <table className="w-full text-sm">
          <thead className="bg-paper-2/60 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            <tr>
              <SortableTh
                label="Name / slug"
                k="name"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableTh
                label="Plan"
                k="plan"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <th className="px-3 py-2.5">Sub</th>
              <SortableTh
                label="Ops"
                k="operatorCount"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <th className="px-3 py-2.5 text-right">Brands</th>
              <SortableTh
                label="Convos"
                k="conversationCount"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="Atlas (mo)"
                k="atlasRunsThisMonth"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableTh
                label="Joined"
                k="createdAt"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableTh
                label="Last activity"
                k="lastActivityAt"
                sortKey={sortKey}
                sortDir={sortDir}
                onClick={toggleSort}
              />
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-muted">
                  No workspaces match.
                </td>
              </tr>
            ) : (
              filtered.map((w) => (
                <tr key={w._id} className="hover:bg-paper-2/30">
                  <td className="px-3 py-2.5">
                    <Link
                      href={`/admin/workspaces/${w._id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {w.name}
                    </Link>
                    <div className="font-mono text-[10.5px] text-muted">
                      {w.slug}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]">
                      {w.plan}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <SubBadge
                      status={w.subscriptionStatus}
                      provider={w.subscriptionProvider}
                    />
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {w.operatorCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {w.brandCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {w.conversationCount}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {w.atlasRunsThisMonth.toLocaleString()}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {new Date(w.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {w.lastActivityAt
                      ? relativeAgo(w.lastActivityAt)
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SortableTh({
  label,
  k,
  sortKey,
  sortDir,
  onClick,
  align,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onClick: (k: SortKey) => void;
  align?: "right";
}) {
  const active = sortKey === k;
  return (
    <th
      className={
        "px-3 py-2.5" + (align === "right" ? " text-right" : "")
      }
    >
      <button
        type="button"
        onClick={() => onClick(k)}
        className={
          "inline-flex items-center gap-1 hover:text-ink " +
          (active ? "text-ink" : "")
        }
      >
        {label}
        {active && (
          <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>
        )}
      </button>
    </th>
  );
}

function SubBadge({
  status,
  provider,
}: {
  status: Row["subscriptionStatus"];
  provider: Row["subscriptionProvider"];
}) {
  if (!status) {
    return (
      <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        free
      </span>
    );
  }
  const cls =
    status === "active"
      ? "bg-good/15 text-good"
      : status === "past_due"
        ? "bg-red-100 text-red-700"
        : status === "paused"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-paper-2 text-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${cls}`}>
      {status}
      {provider ? ` · ${provider}` : ""}
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

"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WorkspaceManagement } from "./[id]/WorkspaceManagement";

type Row = {
  _id: string;
  slug: string;
  name: string;
  plan: "spark" | "team" | "scale" | "enterprise";
  subscriptionStatus: "active" | "past_due" | "cancelled" | "paused" | null;
  subscriptionProvider: "paypal" | "razorpay" | null;
  platformStatus: "active" | "suspended" | "pending_review" | "flagged";
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

export function WorkspacesTable({
  workspaces,
  sessionToken,
}: {
  workspaces: Row[];
  sessionToken: string;
}) {
  const [filter, setFilter] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
              <th className="px-3 py-2.5">Platform</th>
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
                <td colSpan={10} className="px-3 py-8 text-center text-muted">
                  No workspaces match.
                </td>
              </tr>
            ) : (
              filtered.flatMap((w) => {
                const isOpen = expandedId === w._id;
                return [
                  <tr
                    key={w._id}
                    onClick={() =>
                      setExpandedId((cur) => (cur === w._id ? null : w._id))
                    }
                    className={
                      "cursor-pointer transition " +
                      (isOpen ? "bg-paper-2/60" : "hover:bg-paper-2/30")
                    }
                  >
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span
                          aria-hidden
                          className={
                            "inline-block transition " +
                            (isOpen ? "rotate-90" : "")
                          }
                        >
                          ▶
                        </span>
                        <span className="font-medium text-ink">{w.name}</span>
                      </div>
                      <div className="ml-4 font-mono text-[10.5px] text-muted">
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
                    <td className="px-3 py-2.5">
                      <PlatformBadge status={w.platformStatus} />
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
                      {w.lastActivityAt ? relativeAgo(w.lastActivityAt) : "—"}
                    </td>
                  </tr>,
                  isOpen ? (
                    <tr key={`${w._id}-expand`} className="bg-paper">
                      <td colSpan={10} className="border-t border-rule p-5">
                        <ExpandedDetail
                          workspaceId={w._id as Id<"workspaces">}
                          sessionToken={sessionToken}
                        />
                      </td>
                    </tr>
                  ) : null,
                ];
              })
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

function PlatformBadge({ status }: { status: Row["platformStatus"] }) {
  const cls =
    status === "active"
      ? "bg-good/15 text-good"
      : status === "suspended"
        ? "bg-red-100 text-red-700"
        : status === "pending_review"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-warn/20 text-ink";
  return (
    <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${cls}`}>
      {status}
    </span>
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

/**
 * Inline-expand panel under each row. Uses useQuery so errors land
 * in the browser console instead of a hard 500 (the SSR drill-down
 * page swallowed errors as a Vercel function crash). Renders the
 * full WorkspaceManagement editor + a quick operator / brand /
 * recent-conversation summary, plus a permalink to the standalone
 * full-screen view.
 */
function ExpandedDetail({
  workspaceId,
  sessionToken,
}: {
  workspaceId: Id<"workspaces">;
  sessionToken: string;
}) {
  const data = useQuery(api._admin.getWorkspace, {
    sessionToken,
    workspaceId,
  });

  if (data === undefined) {
    return (
      <div className="py-4 text-center text-sm text-muted">
        Loading workspace details…
      </div>
    );
  }
  if (data === null) {
    return (
      <div className="py-4 text-center text-sm text-warn">
        Workspace not found (or you lack access).
      </div>
    );
  }

  const { workspace, operators, brands, recentConvos } = data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="font-mono text-[10.5px] text-muted">
          slug · {workspace.slug} · joined{" "}
          {new Date(workspace.createdAt).toLocaleString()}
        </div>
        <Link
          href={`/admin/workspaces/${workspaceId}`}
          className="inline-flex h-7 items-center rounded-full border border-rule-2 px-3 text-[11px] text-muted transition hover:text-ink"
        >
          Open full view ↗
        </Link>
      </div>

      <WorkspaceManagement
        sessionToken={sessionToken}
        workspace={workspace}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <MiniList title={`Operators (${operators.length})`}>
          {operators.length === 0 ? (
            <Empty />
          ) : (
            operators.slice(0, 8).map((op) => (
              <li
                key={op._id}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <div className="min-w-0">
                  <div className="truncate text-[12.5px] text-ink">
                    {op.name}
                  </div>
                  <div className="truncate font-mono text-[10.5px] text-muted">
                    {op.email}
                  </div>
                </div>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
                  {op.role}
                </span>
              </li>
            ))
          )}
        </MiniList>

        <MiniList title={`Brands (${brands.length})`}>
          {brands.length === 0 ? (
            <Empty />
          ) : (
            brands.slice(0, 8).map((b) => (
              <li key={b._id} className="py-1.5">
                <div className="text-[12.5px] text-ink">{b.name}</div>
                <div className="truncate font-mono text-[10.5px] text-muted">
                  {b.slug}
                </div>
              </li>
            ))
          )}
        </MiniList>

        <MiniList title={`Recent conversations (${recentConvos.length})`}>
          {recentConvos.length === 0 ? (
            <Empty />
          ) : (
            recentConvos.slice(0, 8).map((c) => (
              <li
                key={c._id}
                className="flex items-center justify-between gap-3 py-1.5"
              >
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                  {c.status} · {c.channel}
                </span>
                <span className="font-mono text-[10.5px] text-muted">
                  {relativeAgo(c.lastMessageAt)}
                </span>
              </li>
            ))
          )}
        </MiniList>
      </div>
    </div>
  );
}

function MiniList({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-rule-2 bg-paper-2/40 p-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        {title}
      </div>
      <ul className="m-0 list-none divide-y divide-rule p-0">{children}</ul>
    </div>
  );
}

function Empty() {
  return <li className="py-1 text-[12px] text-muted">None.</li>;
}

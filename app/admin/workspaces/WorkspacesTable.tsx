"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminConvexProvider } from "../AdminConvexProvider";

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

/**
 * Public wrapper — co-locates the Convex provider with the
 * components that use it so this works regardless of whether
 * the layout's wrap is in effect (which has been a moving
 * target during the recent admin refactors).
 */
export function WorkspacesTable(props: {
  workspaces: Row[];
  sessionToken: string;
}) {
  return (
    <AdminConvexProvider>
      <WorkspacesTableInner {...props} />
    </AdminConvexProvider>
  );
}

function WorkspacesTableInner({
  workspaces,
  sessionToken,
}: {
  workspaces: Row[];
  sessionToken: string;
}) {
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
              <th className="px-3 py-2.5">Status</th>
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
              <th className="px-3 py-2.5"></th>
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
              filtered.map((w) => (
                <tr key={w._id} className="hover:bg-paper-2/30">
                  <td className="px-3 py-2.5">
                    <div className="font-medium text-ink">{w.name}</div>
                    <div className="font-mono text-[10.5px] text-muted">
                      {w.slug}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <PlanSelect
                      workspaceId={w._id as Id<"workspaces">}
                      value={w.plan}
                      sessionToken={sessionToken}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <EffectiveStatusBadge
                      platformStatus={w.platformStatus}
                      subscriptionStatus={w.subscriptionStatus}
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
                    {w.lastActivityAt ? relativeAgo(w.lastActivityAt) : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <Link
                      href={`/admin/workspaces/${w._id}`}
                      className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted hover:text-ink"
                    >
                      Open ↗
                    </Link>
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

function PlanSelect({
  workspaceId,
  value,
  sessionToken,
}: {
  workspaceId: Id<"workspaces">;
  value: Row["plan"];
  sessionToken: string;
}) {
  const setPlan = useMutation(api._admin.setPlan);
  const [optimistic, setOptimistic] = useState<Row["plan"]>(value);
  const [busy, setBusy] = useState(false);
  // Re-sync if the upstream value changes (e.g. another admin's edit
  // arrives via Convex live-query).
  if (!busy && optimistic !== value) setOptimistic(value);

  return (
    <select
      value={optimistic}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value as Row["plan"];
        if (next === value) return;
        setOptimistic(next);
        setBusy(true);
        try {
          await setPlan({ sessionToken, workspaceId, plan: next });
        } catch (err) {
          alert(err instanceof Error ? err.message : "Couldn't update plan.");
          setOptimistic(value);
        } finally {
          setBusy(false);
        }
      }}
      className="h-7 rounded-full border border-rule-2 bg-paper-2 px-2 font-mono text-[10px] uppercase tracking-[0.06em] outline-none focus:border-ink"
    >
      <option value="spark">spark</option>
      <option value="team">team</option>
      <option value="scale">scale</option>
      <option value="enterprise">enterprise</option>
    </select>
  );
}

/**
 * Single computed badge merging platform moderation state +
 * subscription billing state into one human label. Moderation wins
 * over billing because a suspended/pending workspace can't transact
 * regardless of its sub status. Click "Open ↗" on the row to control
 * the underlying fields individually from the drill-down.
 */
function EffectiveStatusBadge({
  platformStatus,
  subscriptionStatus,
  provider,
}: {
  platformStatus: Row["platformStatus"];
  subscriptionStatus: Row["subscriptionStatus"];
  provider: Row["subscriptionProvider"];
}) {
  let label: string;
  let cls: string;
  let title: string;

  if (platformStatus === "suspended") {
    label = "suspended";
    cls = "bg-red-100 text-red-700";
    title = "Platform suspended — sessions wiped, login refused.";
  } else if (platformStatus === "pending_review") {
    label = "pending review";
    cls = "bg-yellow-100 text-yellow-800";
    title = "Awaiting platform admin approval.";
  } else if (platformStatus === "flagged") {
    label = "flagged";
    cls = "bg-warn/20 text-ink";
    title = "Flagged for review (still operational).";
  } else if (subscriptionStatus === "past_due") {
    label = "past due";
    cls = "bg-red-100 text-red-700";
    title = `Billing past due${provider ? ` · ${provider}` : ""}.`;
  } else if (subscriptionStatus === "paused") {
    label = "paused";
    cls = "bg-yellow-100 text-yellow-800";
    title = `Subscription paused${provider ? ` · ${provider}` : ""}.`;
  } else if (subscriptionStatus === "cancelled") {
    label = "cancelled";
    cls = "bg-paper-2 text-muted";
    title = `Subscription cancelled${provider ? ` · ${provider}` : ""}.`;
  } else if (subscriptionStatus === "active") {
    label = `paying${provider ? ` · ${provider}` : ""}`;
    cls = "bg-good/15 text-good";
    title = "Active paying subscriber.";
  } else {
    label = "free";
    cls = "bg-paper-2 text-muted";
    title = "No subscription — free tier.";
  }

  return (
    <span
      title={title}
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${cls}`}
    >
      {label}
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

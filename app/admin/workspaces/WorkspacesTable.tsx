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

type SubValue = "none" | "active" | "past_due" | "paused" | "cancelled";

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
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-3 py-8 text-center text-muted">
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
                    <SubSelect
                      workspaceId={w._id as Id<"workspaces">}
                      status={w.subscriptionStatus}
                      provider={w.subscriptionProvider}
                      sessionToken={sessionToken}
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <PlatformSelect
                      workspaceId={w._id as Id<"workspaces">}
                      value={w.platformStatus}
                      sessionToken={sessionToken}
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

function PlatformSelect({
  workspaceId,
  value,
  sessionToken,
}: {
  workspaceId: Id<"workspaces">;
  value: Row["platformStatus"];
  sessionToken: string;
}) {
  const setStatus = useMutation(api._admin.setPlatformStatus);
  const [optimistic, setOptimistic] = useState<Row["platformStatus"]>(value);
  const [busy, setBusy] = useState(false);
  if (!busy && optimistic !== value) setOptimistic(value);

  // Subtle background tint by current value so suspended rows pop.
  const tint =
    optimistic === "active"
      ? "bg-good/15 text-good"
      : optimistic === "suspended"
        ? "bg-red-100 text-red-700"
        : optimistic === "pending_review"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-warn/20 text-ink";

  return (
    <select
      value={optimistic}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value as Row["platformStatus"];
        if (next === value) return;
        // Hard confirm before suspend — destructive (kills sessions).
        if (
          next === "suspended" &&
          !confirm(
            `Suspend this workspace?\n\nEvery active session will be wiped immediately and login will refuse with "workspace has been suspended" until you reactivate.`,
          )
        ) {
          return;
        }
        setOptimistic(next);
        setBusy(true);
        try {
          await setStatus({ sessionToken, workspaceId, status: next });
        } catch (err) {
          alert(err instanceof Error ? err.message : "Couldn't update status.");
          setOptimistic(value);
        } finally {
          setBusy(false);
        }
      }}
      className={`h-7 rounded-full px-2 font-mono text-[10px] uppercase tracking-[0.06em] outline-none focus:ring-1 focus:ring-ink ${tint}`}
    >
      <option value="active">active</option>
      <option value="pending_review">pending_review</option>
      <option value="flagged">flagged</option>
      <option value="suspended">suspended</option>
    </select>
  );
}

/**
 * Inline subscription override. "none" maps to clearing
 * subscriptionStatus (workspace falls back to free/spark behavior at
 * the billing layer). The mutation accepts plan optionally — we omit
 * it here so the plan column stays under PlanSelect's control only.
 */
function SubSelect({
  workspaceId,
  status,
  provider,
  sessionToken,
}: {
  workspaceId: Id<"workspaces">;
  status: Row["subscriptionStatus"];
  provider: Row["subscriptionProvider"];
  sessionToken: string;
}) {
  const override = useMutation(api._admin.overrideSubscription);
  const initial: SubValue = (status ?? "none") as SubValue;
  const [optimistic, setOptimistic] = useState<SubValue>(initial);
  const [busy, setBusy] = useState(false);
  if (!busy && optimistic !== initial) setOptimistic(initial);

  const tint =
    optimistic === "active"
      ? "bg-good/15 text-good"
      : optimistic === "past_due"
        ? "bg-red-100 text-red-700"
        : optimistic === "paused"
          ? "bg-yellow-100 text-yellow-800"
          : optimistic === "cancelled"
            ? "bg-paper-2 text-muted line-through"
            : "bg-paper-2 text-muted";

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={optimistic}
        disabled={busy}
        onChange={async (e) => {
          const next = e.target.value as SubValue;
          if (next === initial) return;
          setOptimistic(next);
          setBusy(true);
          try {
            await override({
              sessionToken,
              workspaceId,
              subscriptionStatus: next === "none" ? null : next,
            });
          } catch (err) {
            alert(
              err instanceof Error
                ? err.message
                : "Couldn't update subscription.",
            );
            setOptimistic(initial);
          } finally {
            setBusy(false);
          }
        }}
        className={`h-7 rounded-full px-2 font-mono text-[10px] uppercase tracking-[0.06em] outline-none focus:ring-1 focus:ring-ink ${tint}`}
      >
        <option value="none">free</option>
        <option value="active">active</option>
        <option value="past_due">past_due</option>
        <option value="paused">paused</option>
        <option value="cancelled">cancelled</option>
      </select>
      {provider && status ? (
        <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
          {provider}
        </span>
      ) : null}
    </div>
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

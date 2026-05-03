"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminConvexProvider } from "../AdminConvexProvider";

type Plan = "spark" | "team" | "scale" | "enterprise";
type PlatformStatus = "active" | "suspended" | "pending_review" | "flagged";

type Row = {
  _id: string;
  slug: string;
  name: string;
  plan: Plan;
  subscriptionStatus: "active" | "past_due" | "cancelled" | "paused" | null;
  subscriptionProvider: "paypal" | "razorpay" | null;
  platformStatus: PlatformStatus;
  createdAt: number;
  operatorCount: number;
  brandCount: number;
  conversationCount: number;
  atlasRunsThisMonth: number;
  lastActivityAt: number | null;
};

type SortKey = "lastActivityAt" | "createdAt" | "name" | "conversationCount";

type StatusFilter = "all" | PlatformStatus;

const PLATFORM_FILTER_LABELS: Record<StatusFilter, string> = {
  all: "All",
  active: "Active",
  pending_review: "Pending review",
  flagged: "Flagged",
  suspended: "Suspended",
};

const PLAN_FILTER_LABELS: Record<"all" | Plan, string> = {
  all: "All plans",
  spark: "Spark",
  team: "Team",
  scale: "Scale",
  enterprise: "Enterprise",
};

const SORT_LABELS: Record<SortKey, string> = {
  lastActivityAt: "Last activity",
  createdAt: "Joined",
  name: "Name",
  conversationCount: "Conversations",
};

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [planFilter, setPlanFilter] = useState<"all" | Plan>("all");
  const [sortKey, setSortKey] = useState<SortKey>("lastActivityAt");

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = {
      all: workspaces.length,
      active: 0,
      pending_review: 0,
      flagged: 0,
      suspended: 0,
    };
    for (const w of workspaces) {
      c[w.platformStatus]++;
    }
    return c;
  }, [workspaces]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = workspaces;

    if (q) {
      list = list.filter(
        (w) =>
          w.name.toLowerCase().includes(q) ||
          w.slug.toLowerCase().includes(q),
      );
    }
    if (planFilter !== "all") {
      list = list.filter((w) => w.plan === planFilter);
    }
    if (statusFilter !== "all") {
      list = list.filter((w) => w.platformStatus === statusFilter);
    }

    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name);
      const av =
        sortKey === "lastActivityAt"
          ? (a.lastActivityAt ?? 0)
          : sortKey === "createdAt"
            ? a.createdAt
            : a.conversationCount;
      const bv =
        sortKey === "lastActivityAt"
          ? (b.lastActivityAt ?? 0)
          : sortKey === "createdAt"
            ? b.createdAt
            : b.conversationCount;
      return bv - av;
    });
  }, [workspaces, filter, planFilter, statusFilter, sortKey]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search name or slug…"
          className="h-9 w-64 rounded-full border border-rule-2 bg-paper px-3.5 text-sm outline-none focus:border-ink"
        />
        <select
          value={planFilter}
          onChange={(e) => setPlanFilter(e.target.value as "all" | Plan)}
          className="h-9 rounded-full border border-rule-2 bg-paper px-3 font-mono text-[11px] uppercase tracking-[0.06em] outline-none focus:border-ink"
        >
          {(Object.keys(PLAN_FILTER_LABELS) as Array<"all" | Plan>).map(
            (k) => (
              <option key={k} value={k}>
                {PLAN_FILTER_LABELS[k]}
              </option>
            ),
          )}
        </select>
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="h-9 rounded-full border border-rule-2 bg-paper px-3 font-mono text-[11px] uppercase tracking-[0.06em] outline-none focus:border-ink"
        >
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              Sort · {SORT_LABELS[k]}
            </option>
          ))}
        </select>
        <span className="ml-auto font-mono text-[11px] text-muted">
          {filtered.length} of {workspaces.length}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {(
          [
            "all",
            "active",
            "pending_review",
            "flagged",
            "suspended",
          ] as StatusFilter[]
        ).map((k) => (
          <FilterChip
            key={k}
            active={statusFilter === k}
            onClick={() => setStatusFilter(k)}
            tone={chipTone(k)}
          >
            {PLATFORM_FILTER_LABELS[k]}
            <span className="ml-1.5 font-mono text-[10px] opacity-70">
              {counts[k]}
            </span>
          </FilterChip>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rule-2 px-5 py-10 text-center text-sm text-muted">
          No workspaces match these filters.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((w) => (
            <WorkspaceRow
              key={w._id}
              workspace={w}
              sessionToken={sessionToken}
            />
          ))}
        </div>
      )}
    </>
  );
}

function chipTone(k: StatusFilter): "neutral" | "good" | "warn" | "danger" {
  if (k === "suspended" || k === "flagged") return "danger";
  if (k === "pending_review") return "warn";
  if (k === "active") return "good";
  return "neutral";
}

function FilterChip({
  active,
  onClick,
  tone,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "neutral" | "good" | "warn" | "danger";
  children: React.ReactNode;
}) {
  const activeCls =
    tone === "good"
      ? "bg-good/15 text-good ring-1 ring-good/30"
      : tone === "warn"
        ? "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-300"
        : tone === "danger"
          ? "bg-red-100 text-red-700 ring-1 ring-red-300"
          : "bg-ink text-paper";
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-7 items-center rounded-full px-3 font-mono text-[10.5px] uppercase tracking-[0.06em] transition " +
        (active
          ? activeCls
          : "border border-rule-2 text-muted hover:text-ink hover:border-rule")
      }
    >
      {children}
    </button>
  );
}

/**
 * One workspace = one card-shaped row. All moderation + billing
 * controls live here inline — no expansion. The /admin/workspaces/[id]
 * drill-down still exists for operators list, brand list, payment
 * actions (cancel upstream), and the audit log.
 */
function WorkspaceRow({
  workspace: w,
  sessionToken,
}: {
  workspace: Row;
  sessionToken: string;
}) {
  // A persistent left border in the row's status color makes the
  // troubled rows pop without competing with the inline controls.
  const accent =
    w.platformStatus === "suspended"
      ? "border-l-red-500"
      : w.platformStatus === "pending_review"
        ? "border-l-yellow-500"
        : w.platformStatus === "flagged"
          ? "border-l-orange-500"
          : w.subscriptionStatus === "past_due"
            ? "border-l-red-500"
            : w.subscriptionStatus === "active"
              ? "border-l-good"
              : "border-l-rule-2";

  return (
    <div
      className={`group flex items-stretch gap-5 rounded-2xl border border-rule-2 border-l-4 bg-paper px-5 py-4 transition hover:border-rule hover:shadow-sm ${accent}`}
    >
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <Link
          href={`/admin/workspaces/${w._id}`}
          className="truncate text-base font-semibold tracking-[-0.015em] text-ink hover:underline underline-offset-2"
        >
          {w.name}
        </Link>
        <div className="truncate font-mono text-[11px] text-muted">
          {w.slug}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-center">
        <PlanSelect
          workspaceId={w._id as Id<"workspaces">}
          value={w.plan}
          sessionToken={sessionToken}
        />
        <PlatformSelect
          workspaceId={w._id as Id<"workspaces">}
          value={w.platformStatus}
          sessionToken={sessionToken}
        />
      </div>

      <div className="hidden shrink-0 items-center gap-5 self-center font-mono text-[11px] text-muted lg:flex">
        <Stat label="ops" value={w.operatorCount.toString()} />
        <Stat label="brands" value={w.brandCount.toString()} />
        <Stat label="convos" value={w.conversationCount.toLocaleString()} />
        <Stat
          label="atlas/mo"
          value={w.atlasRunsThisMonth.toLocaleString()}
        />
      </div>

      <div className="hidden w-32 shrink-0 flex-col justify-center text-right font-mono text-[10.5px] text-muted md:flex">
        <div>
          {w.lastActivityAt ? relativeAgo(w.lastActivityAt) : "no activity"}
        </div>
        <div className="text-[9.5px] uppercase tracking-[0.06em]">
          joined {new Date(w.createdAt).toLocaleDateString()}
        </div>
      </div>

      <Link
        href={`/admin/workspaces/${w._id}`}
        className="inline-flex shrink-0 items-center self-center rounded-full border border-rule-2 px-3 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted transition hover:border-ink hover:text-ink"
      >
        Open ↗
      </Link>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="text-sm tabular-nums text-ink">{value}</span>
      <span className="text-[9.5px] uppercase tracking-[0.06em]">{label}</span>
    </div>
  );
}

function PlanSelect({
  workspaceId,
  value,
  sessionToken,
}: {
  workspaceId: Id<"workspaces">;
  value: Plan;
  sessionToken: string;
}) {
  const setPlan = useMutation(api._admin.setPlan);
  const [optimistic, setOptimistic] = useState<Plan>(value);
  const [busy, setBusy] = useState(false);
  if (!busy && optimistic !== value) setOptimistic(value);

  return (
    <select
      value={optimistic}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value as Plan;
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
      title="Plan tier"
      className="h-7 rounded-full border border-rule-2 bg-paper-2 px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] outline-none focus:border-ink"
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
  value: PlatformStatus;
  sessionToken: string;
}) {
  const setStatus = useMutation(api._admin.setPlatformStatus);
  const [optimistic, setOptimistic] = useState<PlatformStatus>(value);
  const [busy, setBusy] = useState(false);
  if (!busy && optimistic !== value) setOptimistic(value);

  const tint =
    optimistic === "active"
      ? "bg-good/15 text-good"
      : optimistic === "suspended"
        ? "bg-red-100 text-red-700"
        : optimistic === "pending_review"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-orange-100 text-orange-800";

  return (
    <select
      value={optimistic}
      disabled={busy}
      onChange={async (e) => {
        const next = e.target.value as PlatformStatus;
        if (next === value) return;
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
      title="Platform moderation status"
      className={`h-7 rounded-full px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] outline-none focus:ring-1 focus:ring-ink ${tint}`}
    >
      <option value="active">active</option>
      <option value="pending_review">pending</option>
      <option value="flagged">flagged</option>
      <option value="suspended">suspended</option>
    </select>
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

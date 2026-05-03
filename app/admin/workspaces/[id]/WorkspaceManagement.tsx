"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Plan = "spark" | "team" | "scale" | "enterprise";
type PlatformStatus = "active" | "suspended" | "pending_review" | "flagged";
type SubStatus = "active" | "past_due" | "cancelled" | "paused" | null;

const PLANS: Plan[] = ["spark", "team", "scale", "enterprise"];
const PLATFORM_STATUSES: PlatformStatus[] = [
  "active",
  "suspended",
  "pending_review",
  "flagged",
];
const SUB_STATUSES: { value: SubStatus; label: string }[] = [
  { value: null, label: "(none / free)" },
  { value: "active", label: "active" },
  { value: "past_due", label: "past_due" },
  { value: "paused", label: "paused" },
  { value: "cancelled", label: "cancelled" },
];

export function WorkspaceManagement({
  sessionToken,
  workspace,
}: {
  sessionToken: string;
  workspace: {
    _id: Id<"workspaces">;
    plan: Plan;
    platformStatus: PlatformStatus;
    platformStatusReason: string | null;
    platformStatusAt: number | null;
    subscriptionStatus: SubStatus;
    subscriptionProvider: "paypal" | "razorpay" | null;
    paypalSubscriptionId: string | null;
    razorpaySubscriptionId: string | null;
    currentPeriodEnd: number | null;
  };
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <PlanCard sessionToken={sessionToken} workspace={workspace} />
      <PlatformStatusCard sessionToken={sessionToken} workspace={workspace} />
      <SubscriptionOverrideCard
        sessionToken={sessionToken}
        workspace={workspace}
      />
      <PaymentCard sessionToken={sessionToken} workspace={workspace} />
      <div className="lg:col-span-2">
        <AuditLogCard
          sessionToken={sessionToken}
          workspaceId={workspace._id}
        />
      </div>
    </div>
  );
}

function PlanCard({
  sessionToken,
  workspace,
}: {
  sessionToken: string;
  workspace: { _id: Id<"workspaces">; plan: Plan };
}) {
  const setPlan = useMutation(api._admin.setPlan);
  const [plan, setPlanState] = useState<Plan>(workspace.plan);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => setPlanState(workspace.plan), [workspace.plan]);
  const dirty = plan !== workspace.plan;

  const onSave = async () => {
    if (!dirty) return;
    if (
      !confirm(
        `Change plan from "${workspace.plan}" to "${plan}"?\n\nThis is display + entitlement only — does NOT touch PayPal / Razorpay billing.`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await setPlan({
        sessionToken,
        workspaceId: workspace._id,
        plan,
        reason: reason.trim() || undefined,
      });
      setReason("");
      setMsg("Updated.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Plan tier" hint="Display + entitlement only. Doesn't touch billing.">
      <div className="flex flex-col gap-3">
        <select
          value={plan}
          onChange={(e) => setPlanState(e.target.value as Plan)}
          className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        >
          {PLANS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (optional, audit-logged)"
          className="h-9 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !dirty}
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save plan"}
          </button>
          {msg && <span className="text-[12px] text-muted">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}

function PlatformStatusCard({
  sessionToken,
  workspace,
}: {
  sessionToken: string;
  workspace: {
    _id: Id<"workspaces">;
    platformStatus: PlatformStatus;
    platformStatusReason: string | null;
    platformStatusAt: number | null;
  };
}) {
  const setStatus = useMutation(api._admin.setPlatformStatus);
  const [status, setStatusState] = useState<PlatformStatus>(
    workspace.platformStatus,
  );
  const [reason, setReason] = useState(workspace.platformStatusReason ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatusState(workspace.platformStatus);
    setReason(workspace.platformStatusReason ?? "");
  }, [workspace.platformStatus, workspace.platformStatusReason]);

  const dirty = status !== workspace.platformStatus;

  const onSave = async () => {
    if (!dirty) return;
    const hard = status === "suspended";
    if (
      !confirm(
        hard
          ? `SUSPEND this workspace?\n\nEvery active session will be wiped immediately and login will refuse with "workspace has been suspended" until you reactivate.`
          : `Set platform status from "${workspace.platformStatus}" to "${status}"?`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await setStatus({
        sessionToken,
        workspaceId: workspace._id,
        status,
        reason: reason.trim() || undefined,
      });
      setMsg("Updated.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  const badgeClass =
    status === "active"
      ? "bg-good/15 text-good"
      : status === "suspended"
        ? "bg-red-100 text-red-700"
        : status === "pending_review"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-warn/20 text-ink";

  return (
    <Card
      title="Platform status"
      hint='"suspended" wipes sessions + blocks login. Soft states are markers only.'
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] ${badgeClass}`}
          >
            current · {workspace.platformStatus}
          </span>
          {workspace.platformStatusAt && (
            <span className="font-mono text-[10px] text-muted">
              {new Date(workspace.platformStatusAt).toLocaleString()}
            </span>
          )}
        </div>
        <select
          value={status}
          onChange={(e) => setStatusState(e.target.value as PlatformStatus)}
          className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        >
          {PLATFORM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (audit-logged + shown to operator on locked-out screens)"
          rows={2}
          className="resize-none rounded-xl border border-rule-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !dirty}
            className={
              "inline-flex h-9 items-center rounded-full px-4 text-[13px] font-medium transition disabled:opacity-50 " +
              (status === "suspended"
                ? "bg-red-600 text-paper"
                : "bg-ink text-paper")
            }
          >
            {busy
              ? "Saving…"
              : status === "suspended"
                ? "Suspend"
                : "Save status"}
          </button>
          {msg && <span className="text-[12px] text-muted">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}

function SubscriptionOverrideCard({
  sessionToken,
  workspace,
}: {
  sessionToken: string;
  workspace: {
    _id: Id<"workspaces">;
    plan: Plan;
    subscriptionStatus: SubStatus;
    subscriptionProvider: "paypal" | "razorpay" | null;
  };
}) {
  const override = useMutation(api._admin.overrideSubscription);
  const [status, setStatus] = useState<SubStatus>(workspace.subscriptionStatus);
  const [plan, setPlan] = useState<Plan>(workspace.plan);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatus(workspace.subscriptionStatus);
    setPlan(workspace.plan);
  }, [workspace.subscriptionStatus, workspace.plan]);

  const dirty =
    status !== workspace.subscriptionStatus || plan !== workspace.plan;

  const onSave = async () => {
    if (!dirty) return;
    if (
      !confirm(
        `Override local subscription state to status="${status ?? "(none)"}" plan="${plan}"?\n\nDoes NOT touch ${
          workspace.subscriptionProvider ?? "the provider"
        } — use "Cancel upstream" for that.`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await override({
        sessionToken,
        workspaceId: workspace._id,
        subscriptionStatus: status,
        plan,
        reason: reason.trim() || undefined,
      });
      setReason("");
      setMsg("Updated.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Subscription override"
      hint="Manual local-state flip. Use when a webhook never fired or you need to bypass billing for staff/comp."
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={status === null ? "" : status}
            onChange={(e) =>
              setStatus(e.target.value === "" ? null : (e.target.value as SubStatus))
            }
            className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
          >
            {SUB_STATUSES.map((s) => (
              <option key={s.label} value={s.value === null ? "" : s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <select
            value={plan}
            onChange={(e) => setPlan(e.target.value as Plan)}
            className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
          >
            {PLANS.map((p) => (
              <option key={p} value={p}>
                plan: {p}
              </option>
            ))}
          </select>
        </div>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (audit-logged)"
          className="h-9 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !dirty}
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition disabled:opacity-50"
          >
            {busy ? "Saving…" : "Override"}
          </button>
          {msg && <span className="text-[12px] text-muted">{msg}</span>}
        </div>
      </div>
    </Card>
  );
}

function PaymentCard({
  sessionToken,
  workspace,
}: {
  sessionToken: string;
  workspace: {
    _id: Id<"workspaces">;
    subscriptionProvider: "paypal" | "razorpay" | null;
    paypalSubscriptionId: string | null;
    razorpaySubscriptionId: string | null;
    currentPeriodEnd: number | null;
  };
}) {
  const cancelUpstream = useAction(api._admin.cancelSubscriptionUpstream);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const subId =
    workspace.subscriptionProvider === "paypal"
      ? workspace.paypalSubscriptionId
      : workspace.subscriptionProvider === "razorpay"
        ? workspace.razorpaySubscriptionId
        : null;

  const providerLink =
    workspace.subscriptionProvider === "paypal" && workspace.paypalSubscriptionId
      ? `https://www.paypal.com/billing/subscriptions/${workspace.paypalSubscriptionId}`
      : workspace.subscriptionProvider === "razorpay" &&
          workspace.razorpaySubscriptionId
        ? `https://dashboard.razorpay.com/app/subscriptions/${workspace.razorpaySubscriptionId}`
        : null;

  const onCancel = async () => {
    if (
      !confirm(
        `Cancel the ${workspace.subscriptionProvider} subscription upstream?\n\nThis hits the provider's API and triggers a webhook back to us. The workspace will be billed for the current period; cancellation takes effect at the cycle end.`,
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await cancelUpstream({
        sessionToken,
        workspaceId: workspace._id,
      });
      setMsg(result.ok ? `Cancelled (${result.provider}).` : "No active subscription.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Payment" hint="Provider-side subscription IDs + cancel link.">
      <dl className="space-y-2 text-[13px]">
        <Row label="Provider" value={workspace.subscriptionProvider ?? "—"} />
        <Row
          label="Subscription id"
          value={subId ?? "—"}
          mono
          truncate
        />
        <Row
          label="Current period ends"
          value={
            workspace.currentPeriodEnd
              ? new Date(workspace.currentPeriodEnd).toLocaleString()
              : "—"
          }
        />
      </dl>
      {providerLink && (
        <a
          href={providerLink}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] text-ink hover:bg-paper-2"
        >
          Open in {workspace.subscriptionProvider} ↗
        </a>
      )}
      {subId && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full border border-red-300/40 bg-red-50/60 px-4 text-[13px] font-medium text-red-700 transition disabled:opacity-50"
          >
            {busy ? "Cancelling…" : "Cancel upstream"}
          </button>
          {msg && <span className="text-[12px] text-muted">{msg}</span>}
        </div>
      )}
    </Card>
  );
}

function AuditLogCard({
  sessionToken,
  workspaceId,
}: {
  sessionToken: string;
  workspaceId: Id<"workspaces">;
}) {
  const rows = useQuery(api._admin.listAuditForWorkspace, {
    sessionToken,
    workspaceId,
    limit: 30,
  });
  return (
    <Card
      title="Recent platform-admin actions"
      hint="Every plan / status / subscription change is logged here."
    >
      {rows === undefined ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted">
          No platform-admin actions on this workspace yet.
        </p>
      ) : (
        <ul className="divide-y divide-rule">
          {rows.map((r) => (
            <li
              key={r._id}
              className="flex items-start justify-between gap-3 py-2.5"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[13px] text-ink">{r.summary}</div>
                <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                  {r.action}
                </div>
              </div>
              <div className="shrink-0 text-right font-mono text-[10px] text-muted">
                {new Date(r.createdAt).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Card({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-rule-2 bg-paper p-5">
      <div className="mb-1 text-[14px] font-semibold tracking-[-0.01em] text-ink">
        {title}
      </div>
      {hint && (
        <div className="mb-3 text-[11.5px] leading-[1.4] text-muted">
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
        {label}
      </dt>
      <dd
        className={
          (mono ? "font-mono text-[11.5px] " : "text-[13px] ") +
          (truncate ? "max-w-[60%] truncate text-right" : "text-right") +
          " text-ink"
        }
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

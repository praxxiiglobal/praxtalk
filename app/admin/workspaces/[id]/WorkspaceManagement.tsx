"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Plan = "spark" | "team" | "scale" | "enterprise";
type PlatformStatus = "active" | "suspended" | "pending_review" | "flagged";
type SubStatus = "active" | "past_due" | "cancelled" | "paused" | null;

const PLANS: Plan[] = ["spark", "team", "scale", "enterprise"];
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
    <div className="flex flex-col gap-4">
      <BillingCard sessionToken={sessionToken} workspace={workspace} />
      <AuditLogCard
        sessionToken={sessionToken}
        workspaceId={workspace._id}
      />
    </div>
  );
}

/**
 * Single panel that owns everything billing-shaped: the upstream
 * provider snapshot (provider, sub id, period end, deep link),
 * the manual subscription/plan override (local state, doesn't
 * touch the provider), and the cancel-upstream destructive
 * action. Two sub-sections inside one card to keep the drill-down
 * compact — Plan + Platform live inline on the table row.
 */
function BillingCard({
  sessionToken,
  workspace,
}: {
  sessionToken: string;
  workspace: {
    _id: Id<"workspaces">;
    plan: Plan;
    subscriptionStatus: SubStatus;
    subscriptionProvider: "paypal" | "razorpay" | null;
    paypalSubscriptionId: string | null;
    razorpaySubscriptionId: string | null;
    currentPeriodEnd: number | null;
  };
}) {
  const override = useMutation(api._admin.overrideSubscription);
  const cancelUpstream = useAction(api._admin.cancelSubscriptionUpstream);

  const [status, setStatus] = useState<SubStatus>(workspace.subscriptionStatus);
  const [plan, setPlan] = useState<Plan>(workspace.plan);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<"override" | "cancel" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setStatus(workspace.subscriptionStatus);
    setPlan(workspace.plan);
  }, [workspace.subscriptionStatus, workspace.plan]);

  const dirty =
    status !== workspace.subscriptionStatus || plan !== workspace.plan;

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

  const onOverride = async () => {
    if (!dirty || busy) return;
    if (
      !confirm(
        `Override local subscription state to status="${status ?? "(none)"}" plan="${plan}"?\n\nDoes NOT touch ${
          workspace.subscriptionProvider ?? "the provider"
        } — use "Cancel upstream" for that.`,
      )
    )
      return;
    setBusy("override");
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
      setMsg("Override applied.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  };

  const onCancel = async () => {
    if (busy) return;
    if (
      !confirm(
        `Cancel the ${workspace.subscriptionProvider} subscription upstream?\n\nThis hits the provider's API and triggers a webhook back to us. The workspace will be billed for the current period; cancellation takes effect at the cycle end.`,
      )
    )
      return;
    setBusy("cancel");
    setMsg(null);
    try {
      const result = await cancelUpstream({
        sessionToken,
        workspaceId: workspace._id,
      });
      setMsg(
        result.ok ? `Cancelled (${result.provider}).` : "No active subscription.",
      );
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card title="Billing & subscription">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8">
        <div>
          <SectionLabel>Upstream</SectionLabel>
          <dl className="mt-2 space-y-2 text-[13px]">
            <FieldRow
              label="Provider"
              value={workspace.subscriptionProvider ?? "—"}
            />
            <FieldRow label="Subscription id" value={subId ?? "—"} mono truncate />
            <FieldRow
              label="Current period ends"
              value={
                workspace.currentPeriodEnd
                  ? new Date(workspace.currentPeriodEnd).toLocaleString()
                  : "—"
              }
            />
          </dl>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {providerLink && (
              <a
                href={providerLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] text-ink hover:bg-paper-2"
              >
                Open in {workspace.subscriptionProvider} ↗
              </a>
            )}
            {subId && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy !== null}
                className="inline-flex h-8 items-center rounded-full border border-red-300/40 bg-red-50/60 px-3 text-[12px] font-medium text-red-700 transition disabled:opacity-50"
              >
                {busy === "cancel" ? "Cancelling…" : "Cancel upstream"}
              </button>
            )}
            {!subId && (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                No upstream subscription
              </span>
            )}
          </div>
        </div>

        <div>
          <SectionLabel>Override (local state only)</SectionLabel>
          <p className="mt-1 text-[11.5px] leading-[1.45] text-muted">
            Manual flip when a webhook never fired or you need to bypass billing
            for staff/comp. Doesn&apos;t touch the provider.
          </p>
          <div className="mt-3 flex flex-col gap-2.5">
            <div className="grid grid-cols-2 gap-2">
              <select
                value={status === null ? "" : status}
                onChange={(e) =>
                  setStatus(
                    e.target.value === "" ? null : (e.target.value as SubStatus),
                  )
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
                onClick={onOverride}
                disabled={busy !== null || !dirty}
                className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition disabled:opacity-50"
              >
                {busy === "override" ? "Saving…" : "Apply override"}
              </button>
              {msg && <span className="text-[12px] text-muted">{msg}</span>}
            </div>
          </div>
        </div>
      </div>
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
      {children}
    </div>
  );
}

function FieldRow({
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

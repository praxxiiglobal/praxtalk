"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { startCheckoutAction, cancelSubscriptionAction } from "./actions";

const planMeta: Record<
  "spark" | "team" | "scale" | "enterprise",
  { label: string; lede: string; price: string }
> = {
  spark: {
    label: "Spark",
    lede: "Free for solo founders. All channels, full AI, with PraxTalk badge.",
    price: "$0",
  },
  team: {
    label: "Team",
    lede: "5 seats, 1,000 AI auto-replies / mo, branded widget.",
    price: "$49 / mo",
  },
  scale: {
    label: "Scale",
    lede: "Unlimited seats, 10,000 auto-replies / mo, custom workflows.",
    price: "$199 / mo",
  },
  enterprise: {
    label: "Enterprise",
    lede: "Custom volume, SSO, dedicated solutions architect.",
    price: "Talk to us",
  },
};

export function BillingView({
  paypalReturn,
  paypalError,
}: {
  paypalReturn: string | null;
  paypalError: string | null;
}) {
  const { workspace, sessionToken } = useDashboardAuth();
  const meta = planMeta[workspace.plan];
  const usage = useQuery(api.usage.currentMonth, { sessionToken });
  const subscription = useQuery(api.billing.getSubscription, { sessionToken });

  const used = usage?.aiAutoReplied ?? 0;
  const limit = usage?.planLimit ?? 0;
  const pct = limit === 0 ? 0 : Math.min(100, (used / limit) * 100);
  const daysUntilReset = usage
    ? Math.max(0, Math.ceil((usage.monthEnd - Date.now()) / (24 * 60 * 60 * 1000)))
    : null;

  const hasActiveSub =
    subscription?.subscriptionStatus === "active" ||
    subscription?.subscriptionStatus === "past_due" ||
    subscription?.subscriptionStatus === "paused";
  const isPending =
    Boolean(subscription?.paypalSubscriptionId) &&
    !subscription?.subscriptionStatus;

  return (
    <>
      {paypalReturn === "approved" && (
        <Banner kind="info">
          PayPal approval received. Activating your subscription — this usually
          takes a few seconds.
        </Banner>
      )}
      {paypalReturn === "cancelled" && (
        <Banner kind="info">PayPal checkout was cancelled.</Banner>
      )}
      {paypalError && <Banner kind="error">{paypalError}</Banner>}

      <Card title="Current plan">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                {meta.label}
              </span>
              <PlanStatusPill
                status={subscription?.subscriptionStatus ?? null}
                pending={isPending}
              />
            </div>
            <p className="mt-2 max-w-[60ch] text-sm leading-[1.55] text-muted">
              {meta.lede}
            </p>
            {subscription?.currentPeriodEnd && hasActiveSub && (
              <p className="mt-2 text-xs text-muted">
                Renews{" "}
                {new Date(subscription.currentPeriodEnd).toLocaleDateString()}
              </p>
            )}
          </div>
          <div className="text-left sm:text-right">
            <div className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              {meta.price}
            </div>
            <div className="mt-2 flex flex-wrap gap-2 sm:justify-end">
              <UpgradeButtons
                currentPlan={workspace.plan}
                hasActiveSub={hasActiveSub || isPending}
                teamConfigured={subscription?.teamPlanConfigured ?? false}
                scaleConfigured={subscription?.scalePlanConfigured ?? false}
                paypalConfigured={subscription?.paypalConfigured ?? false}
              />
              {hasActiveSub && (
                <form action={cancelSubscriptionAction}>
                  <button
                    type="submit"
                    className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium text-ink hover:bg-paper-2"
                  >
                    Cancel subscription
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Card
        title="AI auto-replies this month"
        description="Counts every message Atlas sent without operator involvement. Billable resolutions ship with v1.0."
      >
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-semibold tracking-[-0.02em] text-ink">
              {usage === undefined ? "—" : used.toLocaleString()}
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              of {limit.toLocaleString()} included
            </div>
          </div>
          <div className="text-right text-sm text-muted">
            {daysUntilReset === null
              ? ""
              : daysUntilReset === 0
                ? "Resets today"
                : `Resets in ${daysUntilReset} day${daysUntilReset === 1 ? "" : "s"}`}
          </div>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-2">
          <div
            className="h-full bg-ink transition-[width] duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </Card>

      <Card title="Invoices">
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          Invoices live in your{" "}
          <a
            href="https://www.paypal.com/myaccount/autopay/"
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:underline"
          >
            PayPal account
          </a>
          . Cancel or update payment method there too.
        </div>
      </Card>
    </>
  );
}

function UpgradeButtons({
  currentPlan,
  hasActiveSub,
  teamConfigured,
  scaleConfigured,
  paypalConfigured,
}: {
  currentPlan: "spark" | "team" | "scale" | "enterprise";
  hasActiveSub: boolean;
  teamConfigured: boolean;
  scaleConfigured: boolean;
  paypalConfigured: boolean;
}) {
  if (currentPlan === "enterprise") return null;
  if (hasActiveSub && (currentPlan === "team" || currentPlan === "scale"))
    return null;
  if (!paypalConfigured) {
    return (
      <span className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium text-muted">
        Billing not yet configured
      </span>
    );
  }
  return (
    <>
      {currentPlan === "spark" && teamConfigured && (
        <form action={startCheckoutAction.bind(null, "team")}>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium text-ink hover:bg-paper-2"
          >
            Upgrade to Team
          </button>
        </form>
      )}
      {scaleConfigured && (
        <form action={startCheckoutAction.bind(null, "scale")}>
          <button
            type="submit"
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper hover:opacity-90"
          >
            Upgrade to Scale
          </button>
        </form>
      )}
    </>
  );
}

function PlanStatusPill({
  status,
  pending,
}: {
  status: "active" | "past_due" | "cancelled" | "paused" | null;
  pending: boolean;
}) {
  if (pending) {
    return (
      <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        Activating…
      </span>
    );
  }
  if (status === "active") {
    return (
      <span className="rounded-full bg-good/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-good">
        Active
      </span>
    );
  }
  if (status === "past_due") {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-red-700">
        Past due
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="rounded-full bg-yellow-100 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-yellow-800">
        Paused
      </span>
    );
  }
  if (status === "cancelled") {
    return (
      <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        Cancelled
      </span>
    );
  }
  return (
    <span className="rounded-full bg-good/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-good">
      Open beta · free
    </span>
  );
}

function Banner({
  kind,
  children,
}: {
  kind: "info" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={
        kind === "error"
          ? "rounded-xl border border-red-300/40 bg-red-50/40 px-4 py-3 text-sm text-red-900"
          : "rounded-xl border border-rule bg-paper-2 px-4 py-3 text-sm text-ink"
      }
    >
      {children}
    </div>
  );
}

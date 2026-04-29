"use client";

import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";

const planMeta: Record<
  "spark" | "team" | "scale" | "enterprise",
  { label: string; lede: string; price: string; resolutions: number }
> = {
  spark: {
    label: "Spark",
    lede: "Free for solo founders. All channels, full AI, with PraxTalk badge.",
    price: "$0",
    resolutions: 100,
  },
  team: {
    label: "Team",
    lede: "5 seats, 1,000 AI resolutions / mo, branded widget.",
    price: "$49 / mo",
    resolutions: 1000,
  },
  scale: {
    label: "Scale",
    lede: "Unlimited seats, 10,000 resolutions / mo, custom workflows.",
    price: "$199 / mo",
    resolutions: 10000,
  },
  enterprise: {
    label: "Enterprise",
    lede: "Custom volume, SSO, dedicated solutions architect.",
    price: "Talk to us",
    resolutions: 100000,
  },
};

export function BillingView() {
  const { workspace } = useDashboardAuth();
  const meta = planMeta[workspace.plan];
  const used = 47;
  const pct = Math.min(100, (used / meta.resolutions) * 100);

  return (
    <>
      <Card title="Current plan">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-semibold tracking-[-0.02em] text-ink">
                {meta.label}
              </span>
              <span className="rounded-full bg-good/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-good">
                Open beta · free
              </span>
            </div>
            <p className="mt-2 max-w-[60ch] text-sm leading-[1.55] text-muted">
              {meta.lede}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <div className="text-2xl font-semibold tracking-[-0.02em] text-ink">
              {meta.price}
            </div>
            <button
              type="button"
              disabled
              className="mt-2 inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium text-muted opacity-70"
            >
              Upgrade — coming v1.0
            </button>
          </div>
        </div>
      </Card>

      <Card
        title="AI resolutions this month"
        description="An AI resolution is a conversation closed by Atlas without operator involvement."
      >
        <div className="flex items-end justify-between">
          <div>
            <div className="text-3xl font-semibold tracking-[-0.02em] text-ink">
              {used.toLocaleString()}
            </div>
            <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              of {meta.resolutions.toLocaleString()} included
            </div>
          </div>
          <div className="text-right text-sm text-muted">
            Resets in 23 days
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
          No invoices yet. The open beta is free for the first 100 AI
          resolutions / month.
        </div>
      </Card>
    </>
  );
}

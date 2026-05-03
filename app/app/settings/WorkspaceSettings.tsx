"use client";

import Link from "next/link";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { DashboardThemeSection } from "./DashboardThemeSection";

const WORKSPACE_LINKS: { href: string; label: string; description: string }[] = [
  {
    href: "/app/integrations",
    label: "Integrations",
    description:
      "Email (Postmark/SendGrid/Resend/SMTP), WhatsApp, Voice/SMS (Twilio/CallHippo/TeleCMI), Botim, REST API keys, webhooks.",
  },
  {
    href: "/app/brands",
    label: "Brands",
    description:
      "Multi-brand widgets, colours, welcome messages — every brand has its own visitor-facing identity.",
  },
  {
    href: "/app/team",
    label: "Team",
    description:
      "Operator roster, roles (owner / admin / agent), and per-brand access control.",
  },
  {
    href: "/app/saved-replies",
    label: "Saved replies",
    description:
      "Workspace-wide canned responses. Operators insert from the conversation composer.",
  },
  {
    href: "/app/billing",
    label: "Billing",
    description:
      "Plan, AI auto-reply usage, PayPal/Razorpay subscription state, and invoices.",
  },
];

export function WorkspaceSettings() {
  const { workspace } = useDashboardAuth();

  return (
    <Card
      title="Workspace"
      description="Identity, brands, team, billing, and dashboard theme — everything about your workspace."
    >
      <SectionHeader>Identity</SectionHeader>
      <dl className="divide-y divide-rule">
        <Row label="Name" value={workspace.name} />
        <Row label="Slug" value={workspace.slug} mono />
        <Row label="Plan" value={workspace.plan} mono uppercase />
        <Row label="Workspace ID" value={workspace._id} mono truncate />
      </dl>

      <SectionHeader>Manage</SectionHeader>
      <ul className="divide-y divide-rule">
        {WORKSPACE_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex items-center justify-between gap-3 py-3 transition hover:bg-paper-2"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-ink">
                  {l.label}
                </div>
                <div className="mt-0.5 text-[12px] leading-[1.4] text-muted">
                  {l.description}
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <SectionHeader>Dashboard theme</SectionHeader>
      <p className="-mt-1 mb-3 text-[12px] leading-[1.4] text-muted">
        Match the operator dashboard to your brand colour. Affects every
        operator in your workspace.
      </p>
      <DashboardThemeSection />
    </Card>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-2 border-t border-rule pt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted first:mt-0 first:border-t-0 first:pt-0">
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  uppercase,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  uppercase?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={[
          "text-sm text-ink",
          mono ? "font-mono text-[13px]" : "",
          uppercase ? "uppercase tracking-[0.04em]" : "",
          truncate ? "truncate sm:max-w-[60%]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

import Link from "next/link";
import { CalendarsSection } from "./CalendarsSection";
import { DashboardThemeSection } from "./DashboardThemeSection";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { WidgetSnippet } from "./WidgetSnippet";
import { PageHeader, PageBody, Card } from "../PageHeader";
import { PushToggle } from "../PushToggle";

export const metadata = {
  title: "Settings · PraxTalk",
};

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
      "Plan, AI auto-reply usage, PayPal subscription state, and invoices.",
  },
];

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace, team, billing, theme, and integration preferences."
      />
      <PageBody>
        <WorkspaceSettings />
        <Card
          title="Workspace"
          description="Brands, team, saved replies, and billing — manage everything about your workspace."
        >
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
        </Card>
        <Card
          title="Dashboard theme"
          description="Match the operator dashboard to your brand colour. Affects every operator in your workspace."
        >
          <DashboardThemeSection />
        </Card>
        <WidgetSnippet />
        <Card
          title="Calendars"
          description="Connect Google or Microsoft calendars so booking pages can avoid scheduling slots that conflict with your existing events."
        >
          <CalendarsSection />
        </Card>
        <Card title="Notifications">
          <PushToggle />
        </Card>
      </PageBody>
    </>
  );
}

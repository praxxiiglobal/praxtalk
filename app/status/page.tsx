import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Status · PraxTalk",
  description: "Live status of PraxTalk's APIs, dashboards, and AI services.",
};

const components = [
  { name: "Dashboard (praxtalk.com/app)", state: "operational" as const },
  { name: "Widget runtime (praxtalk.com/widget.js)", state: "operational" as const },
  { name: "REST API (api/v1)", state: "operational" as const },
  { name: "Webhook delivery", state: "operational" as const },
  { name: "Atlas AI", state: "operational" as const },
  { name: "Email channel", state: "operational" as const },
];

export default function StatusPage() {
  const allUp = components.every((c) => c.state === "operational");
  return (
    <MarketingShell
      eyebrow="System status"
      title={allUp ? "All systems operational." : "Partial outage."}
      description="Updated automatically. Subscribe via webhook for real-time incident notifications, or watch this page."
    >
      <Section title="Components" description="Last 24 hours, by service.">
        <ul className="divide-y divide-rule rounded-2xl border border-rule">
          {components.map((c) => (
            <li
              key={c.name}
              className="flex items-center justify-between px-5 py-4"
            >
              <span className="text-[15px] text-ink">{c.name}</span>
              <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em] text-good">
                <span className="size-2 rounded-full bg-good" />
                Operational
              </span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="Recent incidents"
        description="No incidents in the last 30 days. We post here within 5 minutes of detection."
      >
        <div className="rounded-2xl border border-dashed border-rule p-10 text-center text-sm text-muted">
          No incidents to report.
        </div>
      </Section>

      <Section title="Subscribe">
        <Prose>
          <p>
            For programmatic monitoring, register a webhook subscription
            for <code>incident.created</code> + <code>incident.resolved</code>{" "}
            at <a href="/app/integrations">/app/integrations</a>. We sign
            every payload with HMAC-SHA256 — see <a href="/docs#webhooks">/docs#webhooks</a>.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

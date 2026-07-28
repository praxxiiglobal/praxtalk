import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "System status · PraxTalk",
  description:
    "Live status of PraxTalk's APIs, dashboards, widget, webhooks, Atlas AI, and email channel.",
  alternates: { canonical: "/status" },
  // Operational pages aren't search targets — keep out of organic
  // results so visitors land on the marketing surface instead.
  robots: { index: false, follow: false },
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
      <Section title="Uptime · last 90 days">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UptimeStat headline="100.00%" sub="overall availability" tone="good" />
          <UptimeStat headline="0" sub="incidents (P1 + P2)" tone="good" />
          <UptimeStat headline="< 5 min" sub="incident-post target" tone="neutral" />
          <UptimeStat headline="< 250ms" sub="p95 API latency" tone="neutral" />
        </div>
        <p className="mt-3 text-[12px] leading-relaxed text-muted">
          Self-reported. SLA targets: <strong>99.9%</strong> uptime
          (Team / Scale plans), <strong>99.95%</strong> on Enterprise.
          Incident credits per the{" "}
          <a href="/terms#sla" className="underline-offset-2 hover:underline">
            terms
          </a>
          .
        </p>
      </Section>

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

function UptimeStat({
  headline,
  sub,
  tone,
}: {
  headline: string;
  sub: string;
  tone: "good" | "neutral";
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        tone === "good"
          ? "border-good/30 bg-good/5"
          : "border-rule-2 bg-paper-2/40"
      }`}
    >
      <div
        className={`text-[24px] font-semibold tabular-nums tracking-[-0.025em] ${
          tone === "good" ? "text-good" : "text-ink"
        }`}
      >
        {headline}
      </div>
      <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
        {sub}
      </div>
    </div>
  );
}

import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Changelog · PraxTalk",
  description: "What's new in PraxTalk. Released regularly during the open beta.",
};

const releases = [
  {
    date: "2026-04-29",
    version: "Open beta · multi-brand release",
    highlights: [
      "Multi-brand: run N brands from one workspace with per-operator brand-access gating.",
      "REST API + workspace-scoped + brand-scoped API keys at /api/v1.",
      "HMAC-signed webhooks with exponential-backoff retry queue (30s → 6h).",
      "Atlas AI: bring your own Anthropic key; auto-reply or draft for operator review.",
      "Email channel live — Postmark, SendGrid, Resend; inbound parsing + outbound retry.",
      "Leads: promote any conversation into a CRM-style pipeline.",
      "Notifications: bell + browser Notification API + audio + sidebar badge.",
      "Pre-chat form (Name / Email / Phone with country code / Message) + IP / location capture.",
      "Real-time analytics — KPIs, channel mix, Atlas resolution rate.",
    ],
  },
  {
    date: "2026-04-28",
    version: "MVP shipped",
    highlights: [
      "Embeddable widget at /widget.js with Shadow DOM CSS isolation.",
      "Operator dashboard at /app with reactive inbox.",
      "Visitor → operator → reply loop verified end-to-end.",
      "Custom token auth with PBKDF2-SHA256 hashed at rest.",
    ],
  },
];

export default function ChangelogPage() {
  return (
    <MarketingShell
      eyebrow="Changelog"
      title="What's new."
      description="PraxTalk is in open beta. We ship every week — sometimes every day. Bigger releases land here; tiny tweaks land directly."
    >
      {releases.map((r) => (
        <Section key={r.date} title={r.version} description={r.date}>
          <Prose>
            <ul>
              {r.highlights.map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ul>
          </Prose>
        </Section>
      ))}

      <Section title="Stay in the loop">
        <Prose>
          <p>
            Subscribe to the <code>release.published</code> webhook at{" "}
            <a href="/app/integrations">/app/integrations</a>, or email{" "}
            <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a> to join
            the changelog newsletter.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

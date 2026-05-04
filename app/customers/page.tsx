import Link from "next/link";
import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Launch partners · PraxTalk",
  description:
    "PraxTalk is in open beta. The Praxxii Global team runs every customer-facing channel on it. Become a launch partner and we'll get you to production with hands-on help.",
  alternates: { canonical: "/customers" },
  openGraph: {
    title: "Launch partners · PraxTalk",
    description:
      "Open beta. Become a launch partner — direct line to the team, free through GA.",
    url: "/customers",
  },
};

export default function CustomersPage() {
  return (
    <MarketingShell
      eyebrow="Launch partners"
      title="We use it ourselves. Yours could be next."
      description="PraxTalk is in open beta. Our own customer-facing channels — chat, email, voice, WhatsApp — all run on it. Launch partners join the same install we use every day."
    >
      <Section title="Customer #1: us">
        <Prose>
          <p>
            <strong>Praxxii Global</strong> — the company behind PraxTalk —
            runs every inbound message on this product. That means every
            conversation we have with you about PraxTalk literally lives in
            a PraxTalk inbox.
          </p>
          <ul>
            <li>
              <strong>3 brands in one workspace:</strong> Praxxii Global,
              PraxTalk, Prax Sign — separate widgets, shared inbox, one team.
            </li>
            <li>
              <strong>Atlas auto-resolves ~60% of routine questions</strong>{" "}
              before a human sees them (pricing, demos, signup help) so the
              team only sees conversations that need a human.
            </li>
            <li>
              <strong>Multi-channel without the spaghetti:</strong> chat,
              hello@ email, WhatsApp, +1 voice — all in the same inbox, no
              tab juggling.
            </li>
            <li>
              <strong>Zero vendor lock-in for us</strong> — when we hit
              missing features (we&apos;ve hit plenty) we ship them in days,
              not quarters.
            </li>
          </ul>
          <p className="text-sm text-muted">
            Public case studies with named customers land at v1.0. Until
            then, this page is intentionally honest about where we are.
          </p>
        </Prose>
      </Section>

      <Section title="Who PraxTalk is built for">
        <Prose>
          <p>You&apos;ll get the most out of PraxTalk if you&apos;re:</p>
          <ul>
            <li>
              <strong>Running 2+ brands or properties</strong> from the same
              team and tired of three Tawk.to accounts in three browser tabs.
            </li>
            <li>
              <strong>Currently on Tawk.to or Crisp</strong> and want
              something that actually <em>resolves</em> conversations, not
              just routes them.
            </li>
            <li>
              <strong>Replacing 2-3 tools</strong> (chat + email + a
              chatbot) with one bill that scales by usage, not by seat.
            </li>
            <li>
              <strong>A dev-led team</strong> that wants webhooks, REST API
              and HMAC signing on day one — not as a $200/seat add-on.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="What launch partners get">
        <Prose>
          <ul>
            <li>
              <strong>Free for the entire open beta</strong>, including AI
              resolutions, until we publicly cut v1.0.
            </li>
            <li>
              <strong>Hands-on migration help.</strong> Real engineers, not
              a wiki link. Tell us what you&apos;re moving from and we&apos;ll
              draft the import path with you.
            </li>
            <li>
              <strong>A direct Slack/WhatsApp line</strong> to the team
              that ships the product. Bug reports get patches the same week.
            </li>
            <li>
              <strong>Roadmap influence.</strong> Pick the next two
              integrations or workflow features. We&apos;ve already
              shipped requested integrations (Zoho, voice providers)
              because launch partners asked.
            </li>
            <li>
              <strong>Logo placement</strong> on this page when you&apos;re
              ready (and never before — your call).
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="What this isn't">
        <Prose>
          <p>
            We&apos;re not going to oversell. To be clear about where we are:
          </p>
          <ul>
            <li>
              <strong>SOC 2 Type II</strong> isn&apos;t signed yet — committed
              for v1.0. If you&apos;re a regulated buyer that needs the
              report this quarter, talk to us about an enterprise NDA path.
            </li>
            <li>
              <strong>HIPAA/BAA</strong> coverage is on the v1.0 roadmap, not
              live today.
            </li>
            <li>
              <strong>SLAs</strong> aren&apos;t contractual at the open-beta
              tier — we operate on best-effort with a public status page at{" "}
              <Link href="/status">praxtalk.com/status</Link>.
            </li>
            <li>
              You&apos;re going to find rough edges and you&apos;re going to
              tell us. That feedback loop is the whole point of beta.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="Become a launch partner">
        <Prose>
          <p>
            <strong>Two paths in:</strong>
          </p>
          <ul>
            <li>
              <strong>Self-serve:</strong>{" "}
              <Link
                href="/sign-up"
                className="font-medium text-ink underline-offset-2 hover:underline"
              >
                spin up a workspace
              </Link>{" "}
              and we&apos;ll find you within an hour. The free tier is
              actually free.
            </li>
            <li>
              <strong>Talk first:</strong> email{" "}
              <a href="mailto:hello@praxtalk.com?subject=Launch%20partner%20interest">
                hello@praxtalk.com
              </a>{" "}
              with one paragraph — your stack today, what you want to
              replace, what would make moving worth it. We&apos;ll reply
              within a business day with a candid yes/no/not-yet.
            </li>
          </ul>
          <p className="mt-6 text-sm text-muted">
            Last updated · {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}.
            If you&apos;re reading this six months later, ask us what
            changed — we&apos;ll tell you straight.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

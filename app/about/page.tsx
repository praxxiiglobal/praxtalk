import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "About · PraxTalk",
  description:
    "PraxTalk is a Praxxii Global product — the AI-native customer messaging platform.",
};

export default function AboutPage() {
  return (
    <MarketingShell
      eyebrow="About"
      title="Conversations that close themselves."
      description="PraxTalk is the AI-native customer messaging platform. One inbox for live chat, email, WhatsApp and voice — with Atlas, an autonomous agent that resolves common conversations end to end."
    >
      <Section title="Why we're building this">
        <Prose>
          <p>
            Most help-desks were designed for an internet that didn&apos;t
            have AI. They&apos;re ticket queues with a chat widget bolted
            on. The result: customers wait, agents copy-paste, and AI
            features feel grafted-on because they are.
          </p>
          <p>
            PraxTalk is the opposite — Atlas runs first, end-users get an
            answer in seconds for common questions, and operators only see
            the conversations that actually need a human. The tooling
            scales like SaaS; the experience scales like a friend.
          </p>
        </Prose>
      </Section>

      <Section title="The team">
        <Prose>
          <p>
            PraxTalk is a product of <strong>Praxxii Global</strong>,
            headquartered in Aligarh, India. We&apos;re a small team
            shipping fast — usually weekly.
          </p>
          <p>
            <strong>HQ.</strong> 7/160 Bans Mandi, Yusuf Ganj, Sarai Hakeem,
            Aligarh 202001, UP, India.
            <br />
            <strong>Reach us.</strong>{" "}
            <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a> · +91-9084732432
          </p>
        </Prose>
      </Section>

      <Section title="What we believe">
        <Prose>
          <ul>
            <li>
              <strong>One inbox, every channel.</strong> Stitching tools
              together is friction tax. We consolidate.
            </li>
            <li>
              <strong>AI-first, not AI-bolted-on.</strong> Atlas isn&apos;t a
              feature flag. It runs by default; operators tune the
              system, not the responses.
            </li>
            <li>
              <strong>Full-fidelity API.</strong> If a customer can&apos;t
              run PraxTalk fully from their own CRM via REST + webhooks,
              we built it wrong. Every dashboard surface has an API
              equivalent.
            </li>
            <li>
              <strong>Multi-brand by design.</strong> Holding companies,
              agencies, and D2C orgs running multiple brands shouldn&apos;t
              pay 4× for what should be one workspace.
            </li>
          </ul>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

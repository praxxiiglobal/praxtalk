import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Privacy policy · PraxTalk",
  description:
    "How PraxTalk collects, uses, and protects personal data — for visitors of customer sites and operators of PraxTalk workspaces.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "May 3, 2026";

export default function PrivacyPage() {
  return (
    <MarketingShell
      eyebrow="Legal"
      title="Privacy policy"
      description={`Last updated ${LAST_UPDATED}. This policy describes how Praxxii Global ("PraxTalk", "we") collects, uses, and protects personal data for the praxtalk.com service.`}
    >
      <Section title="Who we are">
        <Prose>
          <p>
            PraxTalk is operated by Praxxii Global, Aligarh, India. Contact:{" "}
            <a href="mailto:privacy@praxtalk.com">privacy@praxtalk.com</a>.
            For data-protection enquiries under India&apos;s DPDP Act,
            our Grievance Officer can be reached at the same address.
          </p>
        </Prose>
      </Section>

      <Section title="What we collect">
        <Prose>
          <p>
            <strong>From visitors of customer sites</strong> who interact
            with a PraxTalk-powered chat widget: a randomly-generated
            visitor identifier, the messages they send, optional name /
            email / phone if they provide them, and approximate
            IP-derived location (city level only — we never store the
            raw IP after lookup). Lawful basis (GDPR Art. 6): legitimate
            interest of the customer (Art. 6(1)(f)) and, where the
            visitor enters PII, consent (Art. 6(1)(a)).
          </p>
          <p>
            <strong>From operators</strong> of PraxTalk workspaces: name,
            email, hashed password, and the conversations / leads /
            booking pages they create. Lawful basis: contract performance
            (Art. 6(1)(b)).
          </p>
          <p>
            <strong>Automatic</strong>: standard server logs (timestamp,
            URL, response code) retained for 30 days for abuse
            detection. No third-party advertising or analytics cookies.
          </p>
        </Prose>
      </Section>

      <Section title="How we use it">
        <Prose>
          <p>
            To deliver the messaging service the customer has configured,
            to detect and prevent abuse, and to comply with legal
            obligations. We do not sell personal data and do not use
            visitor messages to train AI models without the customer&apos;s
            explicit opt-in.
          </p>
        </Prose>
      </Section>

      <Section title="Sub-processors">
        <Prose>
          <p>
            We rely on the following sub-processors. The current list
            lives at <a href="/sub-processors">/sub-processors</a> and
            updates there are advance notice under our DPA.
          </p>
          <ul>
            <li>
              <strong>Convex</strong> (US) — backend database + functions.
            </li>
            <li>
              <strong>Vercel</strong> (US) — application hosting.
            </li>
            <li>
              <strong>Anthropic</strong> (US) — only for workspaces that
              have opted in to Atlas AI with their own API key.
            </li>
            <li>
              <strong>Voyage AI</strong> (US) — only for workspaces that
              have configured retrieval-augmented generation.
            </li>
            <li>
              <strong>PayPal / Razorpay</strong> — billing.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="International transfers">
        <Prose>
          <p>
            Data may be processed in the United States via the
            sub-processors above. Transfers from the EEA / UK / India
            rely on Standard Contractual Clauses and (where applicable)
            the EU-US Data Privacy Framework.
          </p>
        </Prose>
      </Section>

      <Section title="Retention">
        <Prose>
          <p>
            Conversation content is retained for the lifetime of the
            customer&apos;s workspace. Workspaces can request deletion at
            any time via{" "}
            <a href="mailto:privacy@praxtalk.com">privacy@praxtalk.com</a>{" "}
            (90-day SLA, faster on request). Server logs: 30 days.
          </p>
        </Prose>
      </Section>

      <Section title="Your rights">
        <Prose>
          <p>
            EU/UK residents: rights of access, rectification, erasure,
            portability, restriction, and objection under GDPR Articles
            15–22. Indian residents: equivalent rights under the DPDP
            Act 2023. California residents: CCPA rights to know, delete,
            and opt out of sale (we do not sell). Email{" "}
            <a href="mailto:privacy@praxtalk.com">privacy@praxtalk.com</a>{" "}
            and we will respond within 30 days (15 days under DPDP).
          </p>
          <p>
            You also have the right to lodge a complaint with your
            local supervisory authority.
          </p>
        </Prose>
      </Section>

      <Section title="Changes">
        <Prose>
          <p>
            Material changes will be announced 30 days in advance via the
            workspace activity feed and on our changelog. The current
            version is dated at the top of this page.
          </p>
          <p className="text-sm italic text-muted">
            This policy is a starter draft and should be reviewed by
            qualified counsel for your specific jurisdiction before being
            relied upon for compliance. Last reviewed by Praxxii Global
            on {LAST_UPDATED}.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

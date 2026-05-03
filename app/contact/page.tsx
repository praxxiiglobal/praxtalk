import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Contact · PraxTalk",
  description:
    "Reach the PraxTalk team — sales, support, security, and press contacts.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <MarketingShell
      eyebrow="Contact"
      title="Talk to us."
      description="One inbox for every channel — including ours. Pick the right address and we'll respond within one business day."
    >
      <Section title="Get in touch">
        <Prose>
          <ul>
            <li>
              <strong>General / sales</strong> —{" "}
              <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a>.
              Demos, pricing questions, partnership enquiries.
            </li>
            <li>
              <strong>Support</strong> — workspace owners can chat from
              the bottom-right of <a href="/app">/app</a> or email{" "}
              <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a>.
            </li>
            <li>
              <strong>Security</strong> —{" "}
              <a href="mailto:security@praxtalk.com">
                security@praxtalk.com
              </a>{" "}
              for vulnerability reports. See{" "}
              <a href="/.well-known/security.txt">/.well-known/security.txt</a>{" "}
              for our disclosure policy.
            </li>
            <li>
              <strong>Privacy / DPO</strong> —{" "}
              <a href="mailto:privacy@praxtalk.com">
                privacy@praxtalk.com
              </a>{" "}
              for GDPR / DPDP / CCPA data-subject requests.
            </li>
            <li>
              <strong>Press</strong> —{" "}
              <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a>{" "}
              with &quot;press&quot; in the subject line. Logo + bio at{" "}
              <a href="/press">/press</a>.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="Where we are">
        <Prose>
          <p>
            Praxxii Global Pvt. Ltd.
            <br />
            HQ: Aligarh, Uttar Pradesh, India.
            <br />
            Remote-first team across Asia and Europe.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

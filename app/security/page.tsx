import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Security · PraxTalk",
  description:
    "PraxTalk's security posture — encryption, auth, isolation, and disclosure.",
};

export default function SecurityPage() {
  return (
    <MarketingShell
      eyebrow="Security"
      title="Security & data handling."
      description="PraxTalk is in open beta — SOC 2 Type II is in progress. The architecture below is what we run today; this page updates as we add controls."
    >
      <Section title="Architecture">
        <Prose>
          <ul>
            <li>
              <strong>Multi-tenant by design.</strong> Every row in every
              table carries a <code>workspaceId</code>. Indexes start with
              workspaceId. Server-side queries gate every read/write
              through <code>requireOperator</code> + <code>hasBrandAccess</code>{" "}
              before touching data.
            </li>
            <li>
              <strong>Auth.</strong> Custom token auth — PBKDF2-SHA256 with
              100k iterations, salt + key stored as a self-describing
              string. Session tokens are 32 random bytes hex-encoded; we
              store SHA-256 of the token, never the raw value.
            </li>
            <li>
              <strong>API keys.</strong> Workspace-scoped or brand-scoped.
              Stored as SHA-256 hash; raw value shown to the operator
              once at mint time and never again. Revocation is immediate.
            </li>
            <li>
              <strong>Webhooks.</strong> Every outbound POST signed with
              HMAC-SHA256 over <code>{`<timestamp>.<rawBody>`}</code>{" "}
              (Stripe-style). Replay-protection + signature timestamping
              are baked in.
            </li>
            <li>
              <strong>Email integration.</strong> ESP API keys stored
              encrypted at rest by the underlying datastore; never
              round-tripped to the browser after save.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="Compliance">
        <Prose>
          <ul>
            <li>
              <strong>GDPR-ready.</strong> Visitors can request deletion;
              workspace data exports are available via the REST API.
            </li>
            <li>
              <strong>SOC 2 Type II — in progress.</strong> Targeting v1.0
              launch.
            </li>
            <li>
              <strong>Data residency.</strong> Currently single-region
              (US-East). EU-resident-only deployments available on
              enterprise plans at v1.0.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="Vulnerability disclosure">
        <Prose>
          <p>
            Find a security issue? Email{" "}
            <a href="mailto:security@praxtalk.com">security@praxtalk.com</a>.
            We acknowledge within 24 hours and aim to ship a fix within 7
            days for high-severity issues. We don&apos;t run a paid bug
            bounty during the beta; full disclosure credit is given once
            the fix lands.
          </p>
        </Prose>
      </Section>

      <Section title="Privacy">
        <Prose>
          <p>
            We collect what&apos;s necessary to run a chat platform:
            visitor identifier, optional name/email/phone (only when the
            visitor submits the pre-chat form), conversation contents,
            and approximate IP-derived location. We don&apos;t sell, share,
            or use customer data for advertising, model-training, or any
            secondary purpose.
          </p>
          <p>
            For data deletion or export requests, email{" "}
            <a href="mailto:privacy@praxtalk.com">privacy@praxtalk.com</a>.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

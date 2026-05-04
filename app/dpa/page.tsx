import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Data Processing Addendum (DPA) · PraxTalk",
  description:
    "PraxTalk's Data Processing Addendum — sub-processor list, processing terms, security measures, and international transfer mechanisms for B2B customers under GDPR Art. 28 and UK / India equivalents.",
  alternates: { canonical: "/dpa" },
};

const LAST_UPDATED = "May 4, 2026";

export default function DpaPage() {
  return (
    <MarketingShell
      eyebrow="Legal"
      title="Data Processing Addendum"
      description={`Last updated ${LAST_UPDATED}. This DPA forms part of the PraxTalk Terms when you (the "Customer") use praxtalk.com to process personal data on behalf of end users. It satisfies the controller-to-processor obligations of GDPR Art. 28, the UK GDPR, India's DPDP Act, and equivalent regimes.`}
    >
      <Section title="1 · Parties + roles">
        <Prose>
          <p>
            <strong>Processor:</strong> Praxxii Global, Aligarh, India,
            operator of PraxTalk (&ldquo;we&rdquo;, &ldquo;PraxTalk&rdquo;).
            Contact for DPA matters:{" "}
            <a href="mailto:privacy@praxtalk.com">privacy@praxtalk.com</a>.
          </p>
          <p>
            <strong>Controller:</strong> the legal entity behind the
            workspace owner account at praxtalk.com (&ldquo;you&rdquo;,
            &ldquo;Customer&rdquo;).
          </p>
          <p>
            <strong>Data subjects:</strong> the visitors of your sites,
            apps, and channels that interact with PraxTalk-powered
            widgets, calls, emails, or chats.
          </p>
        </Prose>
      </Section>

      <Section title="2 · What we process for you">
        <Prose>
          <p>
            On your instructions (the choices you make in the workspace
            + the conversations your visitors send), we process:
          </p>
          <ul>
            <li>
              Conversation transcripts and message metadata (timestamps,
              channel, status).
            </li>
            <li>
              Visitor identifiers, optional name / email / phone, and
              approximate IP-derived location (city level).
            </li>
            <li>
              Operator account data (name, email, role, brand access)
              for your team.
            </li>
            <li>
              Atlas AI run logs (prompt, response, tools called,
              confidence) when AI auto-resolution is enabled.
            </li>
            <li>
              Optional structured lead data (status, remarks, assignee)
              when you save a conversation as a lead.
            </li>
          </ul>
          <p>
            We do not process special-category data
            (health, biometric, etc.) unless your visitors include it in
            their messages — in which case it lives inside the conversation
            content and is treated with the same protections as the rest.
          </p>
        </Prose>
      </Section>

      <Section title="3 · Sub-processors">
        <Prose>
          <p>
            We use the following sub-processors to deliver PraxTalk.
            Each is bound by a written agreement that imposes
            data-protection obligations no less protective than this
            DPA. We will give you 30 days&apos; notice before adding or
            replacing a sub-processor; you may object via{" "}
            <a href="mailto:privacy@praxtalk.com">privacy@praxtalk.com</a>.
          </p>
          <ul>
            <li>
              <strong>Convex (USA)</strong> — primary database +
              real-time backend. Multi-tenant, encrypted at rest and
              in transit.
            </li>
            <li>
              <strong>Vercel (USA)</strong> — application hosting,
              Edge runtime, and CDN.
            </li>
            <li>
              <strong>Anthropic (USA)</strong> — Atlas AI inference
              (Claude). Zero data retention for API calls; we do not
              opt in to model training.
            </li>
            <li>
              <strong>Postmark / SendGrid / Resend</strong>{" "}
              (USA / EU) — transactional + workspace email delivery,
              one of which is selected by the customer per-workspace.
            </li>
            <li>
              <strong>Twilio / CallHippo / TeleCMI</strong>{" "}
              (USA / India) — voice + SMS, when the customer enables a
              voice integration.
            </li>
            <li>
              <strong>Meta WhatsApp Business Cloud API</strong>{" "}
              (Ireland) — WhatsApp channel, when enabled.
            </li>
            <li>
              <strong>Upstash (USA)</strong> — Redis-backed rate
              limiting + ephemeral session counters.
            </li>
            <li>
              <strong>Cloudflare (USA)</strong> — Turnstile
              CAPTCHA + DDoS protection at the edge.
            </li>
            <li>
              <strong>PayPal / Razorpay</strong> (USA / India) —
              subscription billing; we never see your card details.
            </li>
          </ul>
          <p>
            A current machine-readable sub-processor list is published
            at <a href="/security#sub-processors">/security</a>.
          </p>
        </Prose>
      </Section>

      <Section title="4 · Cross-border transfers">
        <Prose>
          <p>
            Personal data may be transferred to and processed in
            countries outside your local jurisdiction (notably the
            United States, the European Union, and India). For each
            transfer we rely on:
          </p>
          <ul>
            <li>
              <strong>EEA / UK / Switzerland → USA:</strong> the EU
              Standard Contractual Clauses (Module Two) and the UK
              International Data Transfer Addendum, supplemented by
              the EU-US Data Privacy Framework where the recipient is
              certified.
            </li>
            <li>
              <strong>EEA / UK → India:</strong> the EU SCCs (Module
              Two) plus India&apos;s DPDP Act safeguards.
            </li>
            <li>
              <strong>USA / India → EEA:</strong> contractual
              processor-to-controller arrangements.
            </li>
          </ul>
          <p>
            On request we will provide an executed copy of the SCCs +
            transfer impact assessment for your records.
          </p>
        </Prose>
      </Section>

      <Section title="5 · Security measures">
        <Prose>
          <p>
            We maintain technical + organisational measures appropriate
            to the risk, including:
          </p>
          <ul>
            <li>
              TLS 1.2+ everywhere in transit, AES-256 at rest in the
              underlying Convex storage.
            </li>
            <li>
              Multi-tenant isolation enforced by workspace-scoped
              indexes on every query; no cross-tenant query path
              exists in the codebase.
            </li>
            <li>
              Operator passwords hashed with bcryptjs (cost 12);
              session tokens stored only as SHA-256 hashes.
            </li>
            <li>
              Webhook payloads HMAC-SHA256 signed; per-workspace API
              keys with prefix + hash storage.
            </li>
            <li>
              Field-level redaction of OAuth tokens, signing secrets,
              and password hashes in every export — including the
              customer-facing JSON download at /app/settings.
            </li>
            <li>
              Continuous deployment with type-checked schema
              migrations; no out-of-band production database access.
            </li>
            <li>
              SOC 2 Type II audit in progress — committed for v1.0
              GA. ISO 27001 on the post-GA roadmap.
            </li>
          </ul>
          <p>
            Detailed control mappings are at{" "}
            <a href="/security">/security</a>.
          </p>
        </Prose>
      </Section>

      <Section title="6 · Data subject rights">
        <Prose>
          <p>
            We will assist you in responding to data subject requests
            (access, rectification, erasure, restriction, portability,
            objection) within 5 business days. Most requests can be
            satisfied directly:
          </p>
          <ul>
            <li>
              <strong>Access + portability:</strong> the workspace
              owner can download a complete JSON export of every
              record in the workspace from{" "}
              <a href="/app/settings">/app/settings</a> at any time
              — no support ticket required.
            </li>
            <li>
              <strong>Erasure:</strong> deleting a workspace removes
              all associated records; deleting a single conversation
              cascades to its messages. Hard-delete is immediate;
              backups roll over within 30 days.
            </li>
            <li>
              <strong>Rectification:</strong> in-place edit of every
              record from the dashboard.
            </li>
          </ul>
          <p>
            For everything else, email{" "}
            <a href="mailto:privacy@praxtalk.com">privacy@praxtalk.com</a>{" "}
            and we will action it.
          </p>
        </Prose>
      </Section>

      <Section title="7 · Personal data breach">
        <Prose>
          <p>
            We will notify you without undue delay and in any case
            within 72 hours of becoming aware of a personal data
            breach affecting your workspace, including the nature of
            the breach, categories and approximate number of data
            subjects affected, likely consequences, and the measures
            we are taking. Notification is sent to the workspace
            owner&apos;s email on file and posted to{" "}
            <a href="/status">/status</a> for severity 1 incidents.
          </p>
        </Prose>
      </Section>

      <Section title="8 · Audit + compliance">
        <Prose>
          <p>
            On reasonable notice (and no more than once per twelve-
            month period unless required by your supervisory authority),
            we will make available all information necessary to
            demonstrate compliance with this DPA, including the SOC 2
            Type II report (when available), penetration-test summary,
            and answers to a standard CAIQ / SIG questionnaire. Audits
            beyond document review are by mutual agreement and at the
            requesting party&apos;s cost.
          </p>
        </Prose>
      </Section>

      <Section title="9 · Retention + deletion">
        <Prose>
          <p>
            We retain personal data for as long as your workspace is
            active. On workspace deletion or termination of the
            underlying agreement:
          </p>
          <ul>
            <li>
              Operational records (conversations, leads, messages,
              integrations) are deleted within 30 days.
            </li>
            <li>
              Backups containing the workspace expire within a further
              30 days under our rolling backup schedule.
            </li>
            <li>
              Audit log entries that name a deleted operator retain
              the operator id but no other PII; we keep these for 12
              months for security investigation.
            </li>
          </ul>
          <p>
            On request before deletion takes effect, we will provide a
            final export in machine-readable form (JSON), at no charge.
          </p>
        </Prose>
      </Section>

      <Section title="10 · Liability + governing law">
        <Prose>
          <p>
            Liability under this DPA is governed by the limitation of
            liability clause in the underlying{" "}
            <a href="/terms">Terms</a>. The DPA is governed by the laws
            of India (where Praxxii Global is incorporated); for
            customers established in the EEA / UK, GDPR / UK GDPR
            applies as a matter of public order. Disputes go to the
            courts of Aligarh, India unless mandatory law requires
            otherwise.
          </p>
        </Prose>
      </Section>

      <Section title="11 · Counter-signing + amendments">
        <Prose>
          <p>
            This DPA is incorporated by reference into the Terms when
            you create a workspace. Customers requiring a
            counter-signed copy on their own paper can request one by
            emailing{" "}
            <a href="mailto:privacy@praxtalk.com?subject=DPA%20counter-sign%20request">
              privacy@praxtalk.com
            </a>{" "}
            with the legal entity name, registered address, and
            VAT/GST number.
          </p>
          <p>
            Material amendments will be announced 30 days in advance
            via email to workspace owners and posted to this page with
            an updated &ldquo;Last updated&rdquo; date.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

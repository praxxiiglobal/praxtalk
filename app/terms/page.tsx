import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Terms of service · PraxTalk",
  description:
    "Terms governing use of the PraxTalk customer messaging service.",
  alternates: { canonical: "/terms" },
};

const LAST_UPDATED = "May 3, 2026";

export default function TermsPage() {
  return (
    <MarketingShell
      eyebrow="Legal"
      title="Terms of service"
      description={`Last updated ${LAST_UPDATED}. By creating a PraxTalk workspace you agree to these terms.`}
    >
      <Section title="The service">
        <Prose>
          <p>
            PraxTalk is operated by Praxxii Global (Aligarh,
            India). The service is in <strong>open beta</strong>: features,
            pricing, and SLAs may change with reasonable notice.
          </p>
        </Prose>
      </Section>

      <Section title="Acceptable use">
        <Prose>
          <p>You may not use PraxTalk to:</p>
          <ul>
            <li>Send spam, phishing, or unsolicited bulk messages;</li>
            <li>
              Process special-category personal data (health, biometric,
              etc.) without a separately-signed BAA / DPA covering it;
            </li>
            <li>
              Reverse-engineer, abuse the API beyond documented rate
              limits, or interfere with other workspaces&apos; service;
            </li>
            <li>Build a competing product using our APIs.</li>
          </ul>
          <p>
            We may suspend or terminate workspaces that breach these
            limits, with notice where reasonable.
          </p>
        </Prose>
      </Section>

      <Section title="Your data">
        <Prose>
          <p>
            You retain ownership of every conversation, lead, and
            knowledge-base entry in your workspace. We process this data
            on your behalf as described in our{" "}
            <a href="/privacy">Privacy Policy</a>. The DPA at{" "}
            <a href="/dpa">/dpa</a> governs sub-processor obligations
            for B2B customers under GDPR Art. 28.
          </p>
        </Prose>
      </Section>

      <Section title="Billing">
        <Prose>
          <p>
            Paid plans bill monthly via PayPal or Razorpay. The free
            Spark tier carries no commitment. Upgrades take effect
            immediately; downgrades at the next billing cycle. Refunds
            are issued for genuine service failures (extended outages,
            data loss) on a pro-rata basis.
          </p>
        </Prose>
      </Section>

      <Section
        id="sla"
        title="Service level agreement"
        description="Uptime targets + service credits for paid tiers. Live status: praxtalk.com/status."
      >
        <Prose>
          <p>
            <strong>Uptime targets:</strong>
          </p>
          <ul>
            <li>
              <strong>Spark (free):</strong> best-effort. No SLA, no
              credits. Live status published at{" "}
              <a href="/status">praxtalk.com/status</a>.
            </li>
            <li>
              <strong>Team:</strong> 99.9% monthly uptime on the
              dashboard, widget runtime, REST API, and webhook
              delivery — 43 minutes of allowable downtime per month.
            </li>
            <li>
              <strong>Scale:</strong> 99.9% with priority incident
              response (24/7 on-call paged for P1 within 15 minutes).
            </li>
            <li>
              <strong>Enterprise:</strong> 99.95% on a per-region
              basis, contractual escalation paths, dedicated solutions
              architect.
            </li>
          </ul>
          <p>
            Atlas AI inference and the third-party voice / SMS /
            WhatsApp providers are excluded from these targets where
            their own provider availability is the bottleneck (we
            publish provider uptime alongside ours on the status
            page).
          </p>
          <p>
            <strong>Service credits</strong> apply to Team / Scale /
            Enterprise on the following schedule, calculated against
            the monthly fee for the affected workspace:
          </p>
          <ul>
            <li>
              Below 99.9% but at or above 99.0% → <strong>10%</strong>{" "}
              credit on next invoice.
            </li>
            <li>
              Below 99.0% but at or above 95.0% → <strong>25%</strong>{" "}
              credit.
            </li>
            <li>
              Below 95.0% → <strong>50%</strong> credit and the right
              to terminate without penalty.
            </li>
          </ul>
          <p>
            Credits are requested via{" "}
            <a href="mailto:hello@praxtalk.com?subject=SLA%20credit%20request">
              hello@praxtalk.com
            </a>{" "}
            within 30 days of the affected billing period and applied
            to the next invoice. Credits are the sole and exclusive
            remedy for SLA breaches.
          </p>
          <p>
            <strong>Excluded from SLA calculation:</strong> scheduled
            maintenance announced 48+ hours in advance (rare; capped
            at 4 hours / month), force majeure, customer-caused
            incidents (mis-configured widgets, exhausted API rate
            limits), and any downtime affecting only the free Spark
            tier.
          </p>
          <p className="text-[12.5px] text-muted">
            During the open beta (pre-v1.0 GA), the SLA targets
            above are best-effort commitments. Contractual SLA + the
            credit schedule become binding at GA. Enterprise customers
            on signed contracts get the contractual SLA from day one.
          </p>
        </Prose>
      </Section>

      <Section title="Beta-quality disclaimer">
        <Prose>
          <p>
            PraxTalk is provided &quot;as is&quot; during the open-beta
            period. Atlas AI replies are generated by language models and
            may be inaccurate; you are responsible for reviewing
            auto-replies before they go to your customers (use the
            confidence threshold and operator drafts mode if uncertain).
          </p>
        </Prose>
      </Section>

      <Section title="Liability">
        <Prose>
          <p>
            To the extent permitted by law, our aggregate liability
            under these terms is capped at the fees you paid in the
            twelve months preceding the claim. We exclude indirect,
            consequential, and lost-profits damages.
          </p>
        </Prose>
      </Section>

      <Section title="Termination">
        <Prose>
          <p>
            You can delete your workspace at any time from{" "}
            <a href="/app/billing">/app/billing</a>. Upon deletion we
            erase all workspace data within 90 days, except where
            retention is required by law.
          </p>
        </Prose>
      </Section>

      <Section title="Governing law">
        <Prose>
          <p>
            These terms are governed by the laws of India. Disputes
            will be resolved in the courts of Aligarh, Uttar Pradesh,
            unless overridden by the mandatory law of the customer&apos;s
            country.
          </p>
          <p className="text-sm italic text-muted">
            This is a starter draft and should be reviewed by qualified
            counsel before being relied upon. Last reviewed by Praxxii
            Global on {LAST_UPDATED}.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

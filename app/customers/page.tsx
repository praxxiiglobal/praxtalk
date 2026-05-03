import Link from "next/link";
import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Customers shipping with PraxTalk · open beta",
  description:
    "PraxTalk is in open beta. Early customers shipping with us today; case studies follow at v1.0. Talk to us at hello@praxtalk.com.",
  alternates: { canonical: "/customers" },
  // Audit recommended noindex until real customer case studies
  // exist — thin pages are a quality drag on the whole domain.
  robots: { index: false, follow: false },
  openGraph: {
    title: "Customers shipping with PraxTalk",
    description: "Early customers shipping today; case studies at v1.0.",
    url: "/customers",
  },
};

export default function CustomersPage() {
  return (
    <MarketingShell
      eyebrow="Customers"
      title="Open beta · early customers shipping with us."
      description="We're building PraxTalk in the open. Public case studies land at v1.0 — until then, we work directly with each early team to get them to production."
    >
      <Section title="Working in the open">
        <Prose>
          <p>
            If you&apos;re running multiple brands, replacing a stack of
            two or three chat tools, or want to embed AI-resolved
            conversations into your own CRM — we&apos;d love to help you
            ship.
          </p>
          <p>
            What you get during the beta:
          </p>
          <ul>
            <li>Hands-on onboarding (not a wiki link).</li>
            <li>Direct line to the team via shared Slack.</li>
            <li>Free tier for the open beta — pay nothing until v1.0.</li>
            <li>Influence on the roadmap. We ship to your needs first.</li>
          </ul>
        </Prose>
      </Section>

      <Section title="Talk to us">
        <Prose>
          <p>
            Email{" "}
            <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a> with
            a one-paragraph pitch — current setup, what you want to
            replace, what would make PraxTalk a no-brainer.
          </p>
          <p>
            Or just{" "}
            <Link href="/setup" className="font-medium text-ink underline-offset-2 hover:underline">
              spin up a workspace at /setup
            </Link>{" "}
            and we&apos;ll find you.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

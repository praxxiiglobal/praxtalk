import { SectionHead } from "./SectionHead";
import { cn } from "@/lib/cn";

type Plan = {
  name: string;
  price: string;
  priceSub: string;
  lede: string;
  features: string[];
  cta: { label: string; style: "ghost" | "dark" | "light"; href: string };
  variant?: "feat";
  ribbon?: string;
};

const plans: Plan[] = [
  {
    name: "Spark",
    price: "$0",
    priceSub: "forever",
    lede: "For solo founders shipping their first website. All channels, full AI, with PraxTalk badge.",
    features: [
      "Unlimited live chat & email",
      "1 seat · 100 AI resolutions / mo",
      "Atlas Resolver agent",
      "Community support",
    ],
    cta: { label: "Start free", style: "ghost", href: "/setup" },
  },
  {
    name: "Team",
    price: "$29",
    priceSub: "/seat / mo",
    lede: "For growing CX teams. Add WhatsApp, voice, and the full Atlas suite.",
    features: [
      "Everything in Spark",
      "Up to 25 seats",
      "$0.04 / AI resolution",
      "WhatsApp, SMS & voice",
      "Copilot for humans",
    ],
    cta: { label: "Start 14-day trial", style: "dark", href: "/setup" },
  },
  {
    name: "Scale",
    price: "$89",
    priceSub: "/seat / mo",
    lede: "For revenue teams running outbound + support on a single graph.",
    features: [
      "Everything in Team",
      "Custom agent SDK",
      "Self-writing KB",
      "Salesforce, HubSpot, Linear sync",
      "Sentiment + routing engine",
      "SOC 2 Type II (when available)",
    ],
    cta: {
      label: "Talk to sales",
      style: "light",
      href: "mailto:hello@praxtalk.com?subject=Scale%20plan%20enquiry",
    },
    variant: "feat",
    ribbon: "Most popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    priceSub: "",
    lede: "For regulated industries — HIPAA, finance, healthcare, gov.",
    features: [
      "Everything in Scale",
      "HIPAA / BAA available",
      "Single-tenant AI runtime",
      "Field-level PII redaction",
      "SAML SSO + SCIM",
      "Dedicated solutions architect",
    ],
    cta: {
      label: "Request quote",
      style: "ghost",
      href: "mailto:hello@praxtalk.com?subject=Enterprise%20enquiry",
    },
  },
];

export function Pricing() {
  return (
    <section id="pricing" className="relative pb-[120px]">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <SectionHead
          number="06"
          label="Pricing"
          description="Every plan includes the full AI suite. You pay per AI-resolved conversation, not per agent. No surprise overage. Cancel anytime."
        >
          Pay for{" "}
          <span className="font-serif italic font-normal">outcomes</span>,
          <br />
          not seats you don&apos;t fill.
        </SectionHead>

        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-4">
          {plans.map((p) => (
            <PlanCard key={p.name} plan={p} />
          ))}
        </div>
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const isFeat = plan.variant === "feat";
  return (
    <div
      className={cn(
        "relative flex min-h-[480px] flex-col gap-[18px] rounded-[18px] border p-7",
        isFeat
          ? "border-ink bg-ink text-paper"
          : "border-rule-2 bg-paper",
      )}
    >
      {plan.ribbon && (
        <span className="absolute right-3.5 top-3.5 rounded-full bg-accent px-2 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-white">
          {plan.ribbon}
        </span>
      )}

      <div
        className={cn(
          "font-mono text-[11px] uppercase tracking-[0.08em]",
          isFeat ? "text-accent" : "text-muted",
        )}
      >
        {plan.name}
      </div>

      <div className="text-[48px] font-semibold leading-none tracking-[-0.04em]">
        {plan.price}
        {plan.priceSub && (
          <small
            className={cn(
              "ml-1.5 text-[14px] font-normal tracking-normal",
              isFeat ? "text-paper/60" : "text-muted",
            )}
          >
            {plan.priceSub}
          </small>
        )}
      </div>

      <p
        className={cn(
          "m-0 text-sm leading-[1.45]",
          isFeat ? "text-paper/65" : "text-muted",
        )}
      >
        {plan.lede}
      </p>

      <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[13.5px]">
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 leading-[1.4]">
            <span
              aria-hidden
              className="plan-bullet"
              style={{ color: isFeat ? "var(--color-paper)" : "var(--color-ink)" }}
            />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-2">
        <a
          href={plan.cta.href}
          className={cn(
            "group inline-flex h-[38px] items-center gap-2 rounded-full px-4 text-sm font-medium transition hover:-translate-y-px",
            plan.cta.style === "ghost" &&
              "border border-rule-2 bg-transparent text-ink",
            plan.cta.style === "dark" && "bg-ink text-paper",
            plan.cta.style === "light" && "bg-paper text-ink",
          )}
        >
          {plan.cta.label}
          <span aria-hidden className="transition group-hover:translate-x-0.5">
            →
          </span>
        </a>
      </div>
    </div>
  );
}

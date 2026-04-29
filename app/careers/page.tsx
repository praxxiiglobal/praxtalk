import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Careers · PraxTalk",
  description:
    "Build the AI-native customer messaging platform. PraxTalk is hiring across engineering, design, and go-to-market.",
};

export default function CareersPage() {
  return (
    <MarketingShell
      eyebrow="Careers"
      title="Build the AI-native customer messaging platform."
      description="PraxTalk is a small team shipping weekly. If you want to own a surface area end-to-end and ship to real customers — read on."
    >
      <Section title="Open roles">
        <Prose>
          <p>
            We aren&apos;t running formal job listings yet. If any of these
            sound like your shape, email{" "}
            <a href="mailto:careers@praxtalk.com">careers@praxtalk.com</a>{" "}
            with a one-pager on what you&apos;ve shipped.
          </p>
          <ul>
            <li>
              <strong>Full-stack engineer (TypeScript / Convex / Next.js).</strong>{" "}
              You&apos;ll own a vertical — AI agent, multi-channel, billing —
              from schema to UI to ship.
            </li>
            <li>
              <strong>Founding designer.</strong> Product surface + marketing
              site + design system. We&apos;re post-Tailwind; you&apos;ll be
              hands-on in the codebase.
            </li>
            <li>
              <strong>Founding GTM.</strong> Talk to early customers, write
              the case studies that don&apos;t exist yet, run the open-beta
              waitlist.
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="What we offer">
        <Prose>
          <ul>
            <li>Meaningful equity. Early-team economics.</li>
            <li>Remote, async-first. We meet on purpose, not on schedule.</li>
            <li>
              Latitude to ship. You pick the problems and own the outcome.
            </li>
            <li>
              Direct customer contact. We don&apos;t do "engineering vs.
              support" — every engineer is on the inbox.
            </li>
          </ul>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

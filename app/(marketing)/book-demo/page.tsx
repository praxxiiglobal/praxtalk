import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Book a demo · PraxTalk",
  description:
    "30-minute walkthrough of PraxTalk — pick a slot or email us directly.",
  alternates: { canonical: "/book-demo" },
};

export default function BookDemoPage() {
  return (
    <MarketingShell
      eyebrow="Demo"
      title="See PraxTalk in 30 minutes."
      description="A walkthrough of the inbox, Atlas AI, multi-brand setup, and integrations — tailored to your stack."
    >
      <Section title="Schedule">
        <Prose>
          <p>
            Email{" "}
            <a href="mailto:hello@praxtalk.com?subject=Demo%20request">
              hello@praxtalk.com
            </a>{" "}
            with two or three time slots that work for you and we&apos;ll
            confirm within one business day. Mention the team size and
            what you&apos;re currently using so we can prep the demo to your
            workflow.
          </p>
          <p>
            Already know you want it? Skip the demo and{" "}
            <a href="/sign-up">start your workspace free</a> — Atlas
            costs nothing on the Spark tier.
          </p>
        </Prose>
      </Section>

      <Section title="What we'll cover">
        <Prose>
          <ul>
            <li>The unified inbox: chat, email, WhatsApp, voice, in-app.</li>
            <li>
              Atlas AI — autonomous replies with confidence-thresholded
              hand-off, knowledge base from your website URL, tool calls.
            </li>
            <li>
              Multi-brand: one workspace, N brands, per-operator brand
              access.
            </li>
            <li>Booking pages, calendar sync, approval gating.</li>
            <li>
              REST API + webhooks if you want to drive PraxTalk from your
              own stack.
            </li>
          </ul>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

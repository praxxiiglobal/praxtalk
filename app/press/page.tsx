import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Press kit · PraxTalk",
  description: "Logos, screenshots, and boilerplate for press and partners.",
};

export default function PressPage() {
  return (
    <MarketingShell
      eyebrow="Press kit"
      title="Press & brand assets."
      description="Use these for stories, partner integrations, or community posts. Email hello@praxtalk.com for anything not listed."
    >
      <Section title="Logo">
        <Prose>
          <p>
            <strong>Wordmark.</strong> "PraxTalk" with the infinity-and-chat
            mark. Use the full-colour version on light backgrounds. The
            mark may be used standalone for square avatars / favicons.
          </p>
          <ul>
            <li>
              <a href="/praxtalk-logo.png" download>
                Download wordmark (PNG, transparent)
              </a>
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="Boilerplate">
        <Prose>
          <p>
            Use this paragraph verbatim or adapt it. Anything longer,
            email us.
          </p>
          <pre>{`PraxTalk is the AI-native customer messaging platform.
One inbox for live chat, email, WhatsApp, voice and in-app —
with Atlas, an autonomous agent that resolves common
conversations end to end. PraxTalk is a product of Praxxii Global,
headquartered in Aligarh, India.`}</pre>
        </Prose>
      </Section>

      <Section title="Spelling">
        <Prose>
          <p>
            One word, two capitals: <strong>PraxTalk</strong>. Atlas (the
            AI agent) is one word, capitalised. The parent company is{" "}
            <strong>Praxxii Global</strong> — two i&apos;s, one l.
          </p>
        </Prose>
      </Section>

      <Section title="Contact">
        <Prose>
          <p>
            Press inquiries:{" "}
            <a href="mailto:hello@praxtalk.com?subject=Press%20inquiry">
              hello@praxtalk.com
            </a>
            . We respond within one business day.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

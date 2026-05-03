import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { SetupForm } from "../setup/SetupForm";

export const metadata = {
  title: "Start your PraxTalk workspace · free forever for 100 AI res/mo",
  description:
    "Spin up a PraxTalk workspace in two minutes. No credit card. AI-native customer messaging — chat, email, WhatsApp, voice, in-app.",
  alternates: { canonical: "/sign-up" },
};

const TRUST_BULLETS = [
  "Free forever — 100 AI auto-replies per month, every channel, full operator dashboard.",
  "No credit card to start. Upgrade only when you outgrow Spark.",
  "Embed the widget in 30 seconds — one <script> tag, no SDK install.",
  "Atlas AI ships with your workspace. Bring your Anthropic key, point it at your website, you're live.",
];

export default function SignUpPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <section className="relative py-[80px] sm:py-[120px]">
          <div className="mx-auto grid max-w-[1320px] gap-12 px-4 sm:px-8 lg:grid-cols-[1.1fr_1fr] lg:gap-20">
            {/* Pitch */}
            <div className="flex flex-col">
              <div className="eyebrow mb-3 inline-flex w-fit items-center gap-2.5 text-muted">
                <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
                Open beta · free for 100 AI res/mo
              </div>

              <h1 className="text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[56px]">
                Spin up your{" "}
                <span className="font-serif italic font-normal">workspace</span>{" "}
                in two minutes.
              </h1>
              <p className="mt-5 max-w-[52ch] text-[15.5px] leading-[1.6] text-muted">
                One inbox for chat, email, WhatsApp, voice and in-app — with
                Atlas, an autonomous agent that resolves common conversations
                end to end. No credit card. No CC seat fees while you&apos;re
                figuring it out.
              </p>

              <ul className="mt-8 flex flex-col gap-3">
                {TRUST_BULLETS.map((b) => (
                  <li
                    key={b}
                    className="flex items-start gap-3 text-[14px] leading-[1.55] text-ink"
                  >
                    <span
                      aria-hidden
                      className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-paper"
                    >
                      ✓
                    </span>
                    {b}
                  </li>
                ))}
              </ul>

              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                <span>Trusted by indie founders + agencies</span>
                <span aria-hidden>·</span>
                <span>GDPR roadmap · SOC 2 planned for v1.0</span>
              </div>
            </div>

            {/* Form */}
            <div className="self-start rounded-3xl border border-rule-2 bg-paper p-6 shadow-[0_24px_48px_-24px_rgba(11,15,18,0.16)] sm:p-8">
              <h2 className="mb-1 text-[20px] font-semibold tracking-[-0.02em]">
                Create your workspace
              </h2>
              <p className="mb-6 text-[13px] text-muted">
                You&apos;ll land in the dashboard with your widget snippet ready
                to copy.
              </p>
              <SetupForm />
              <p className="mt-6 text-center text-[12px] text-muted">
                Already have a workspace?{" "}
                <a
                  href="/login"
                  className="text-ink underline-offset-2 hover:underline"
                >
                  Sign in
                </a>
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

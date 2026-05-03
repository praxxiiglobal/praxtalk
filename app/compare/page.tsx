import { Nav } from "@/components/marketing/Nav";
import { Compare } from "@/components/marketing/Compare";
import { Pricing } from "@/components/marketing/Pricing";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title:
    "Compare · PraxTalk vs Intercom, Crisp, LiveChat, Drift, HubSpot Chat, Tawk.to",
  description:
    "Side-by-side comparison of PraxTalk against the major customer messaging platforms. Sourced + dated; updated when competitors ship pricing or feature changes.",
  alternates: { canonical: "/compare" },
};

export default function ComparePage() {
  return (
    <>
      <Nav />
      <main id="main">
        <section className="pt-[80px] pb-0 sm:pt-[120px]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
            <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              Compare
            </div>
            <h1 className="max-w-[20ch] text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[64px]">
              How PraxTalk{" "}
              <span className="font-serif italic font-normal">stacks up</span>{" "}
              against the rest.
            </h1>
            <p className="mt-5 max-w-[60ch] text-[15.5px] leading-[1.6] text-muted">
              The capabilities below are scored against each vendor&apos;s
              public docs, verified May 3, 2026. We re-verify monthly and on
              any pricing-page update — sources are listed in the footnote
              under the table.
            </p>
          </div>
        </section>
        <Compare />
        <Pricing />
        <CtaBlock />
      </main>
      <Footer />
    </>
  );
}

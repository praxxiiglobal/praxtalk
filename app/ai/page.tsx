import { Nav } from "@/components/marketing/Nav";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Compare } from "@/components/marketing/Compare";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Atlas AI · PraxTalk — autonomous customer messaging agent",
  description:
    "Atlas is the AI agent at the heart of PraxTalk. Bring your Anthropic key, point it at your website, and Atlas drafts or auto-sends replies with a confidence threshold you control. RAG via Voyage embeddings + reranking.",
  alternates: { canonical: "/ai" },
};

export default function AiPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <section className="pt-[80px] pb-0 sm:pt-[120px]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
            <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              Atlas AI Suite
            </div>
            <h1 className="max-w-[18ch] text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[64px]">
              An AI agent that{" "}
              <span className="font-serif italic font-normal">resolves</span>,
              not just replies.
            </h1>
            <p className="mt-5 max-w-[60ch] text-[15.5px] leading-[1.6] text-muted">
              Atlas reads the conversation, retrieves the most relevant chunks
              from your website-crawled knowledge base, drafts a reply, and
              scores its own confidence. Above the threshold it auto-sends;
              below it the reply lands in the operator&apos;s inbox as a
              one-click suggestion.
            </p>
          </div>
        </section>
        <FeatureGrid />
        <Compare />
        <CtaBlock />
      </main>
      <Footer />
    </>
  );
}

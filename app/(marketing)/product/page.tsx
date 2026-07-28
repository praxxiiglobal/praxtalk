import { Nav } from "@/components/marketing/Nav";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Integrations } from "@/components/marketing/Integrations";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Product · PraxTalk — one inbox for chat, email, WhatsApp, voice",
  description:
    "PraxTalk consolidates live chat, email, WhatsApp, voice, and in-app messaging into one operator inbox — with Atlas AI handling the conversations that don't need a human.",
  alternates: { canonical: "/product" },
};

export default function ProductPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <section className="pt-[80px] pb-0 sm:pt-[120px]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
            <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              Product
            </div>
            <h1 className="max-w-[18ch] text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[64px]">
              One inbox{" "}
              <span className="font-serif italic font-normal">replaces</span>{" "}
              the six tabs in your stack.
            </h1>
            <p className="mt-5 max-w-[60ch] text-[15.5px] leading-[1.6] text-muted">
              Live chat, email, WhatsApp, voice, in-app, SMS — operators reply
              from a single thread. Atlas AI drafts or auto-sends based on a
              confidence threshold you control. Reminders, booking pages, and
              Calendar sync are first-class.
            </p>
          </div>
        </section>
        <ProductMockup />
        <FeatureGrid />
        <Integrations />
        <CtaBlock />
      </main>
      <Footer />
    </>
  );
}

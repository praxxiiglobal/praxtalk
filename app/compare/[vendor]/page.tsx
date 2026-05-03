import { notFound } from "next/navigation";
import { Nav } from "@/components/marketing/Nav";
import { Compare } from "@/components/marketing/Compare";
import { Pricing } from "@/components/marketing/Pricing";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";
import { VENDORS, vendorBySlug } from "../_vendors";

type Params = { vendor: string };

export function generateStaticParams(): Params[] {
  return VENDORS.map((v) => ({ vendor: v.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}) {
  const { vendor } = await params;
  const v = vendorBySlug(vendor);
  if (!v) return {};
  return {
    title: `PraxTalk vs ${v.name} — pricing, AI agent, multi-brand`,
    description: `Side-by-side comparison: PraxTalk vs ${v.name}, sourced from each vendor's public pricing page on ${v.verifiedOn}.`,
    alternates: { canonical: `/compare/${v.slug}` },
  };
}

export default async function VendorComparePage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { vendor } = await params;
  const v = vendorBySlug(vendor);
  if (!v) notFound();

  return (
    <>
      <Nav />
      <main id="main">
        <section className="pt-[80px] pb-0 sm:pt-[120px]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
            <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              Compare · vs {v.name}
            </div>
            <h1 className="max-w-[20ch] text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[64px]">
              PraxTalk{" "}
              <span className="font-serif italic font-normal">vs</span>{" "}
              {v.name}.
            </h1>
            <p className="mt-5 max-w-[60ch] text-[15.5px] leading-[1.6] text-muted">
              {v.positioning}
            </p>

            <div className="mt-10 grid gap-8 sm:grid-cols-2">
              <div className="rounded-2xl border border-rule-2 bg-paper-2/40 p-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                  {v.name} pricing
                </div>
                <p className="mt-2 text-[14px] leading-[1.55] text-ink">
                  {v.pricingNote}
                </p>
                <p className="mt-3 text-[11px] text-muted">
                  Source:{" "}
                  <a
                    href={v.pricingUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline-offset-2 hover:underline"
                  >
                    {v.pricingUrl.replace(/^https?:\/\//, "")}
                  </a>{" "}
                  · verified {v.verifiedOn}
                </p>
              </div>
              <div className="rounded-2xl border border-rule-2 bg-paper-2/40 p-5">
                <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                  Where {v.name} struggles
                </div>
                <p className="mt-2 text-[14px] leading-[1.55] text-ink">
                  {v.weakSpot}
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-accent/40 bg-accent-soft/40 p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                Why teams switch to PraxTalk
              </div>
              <p className="mt-2 text-[14.5px] leading-[1.6] text-ink">
                {v.praxStrength}
              </p>
            </div>

            <p className="mt-6 font-mono text-[10.5px] leading-[1.5] text-muted">
              {v.trademark} Used here for comparative reference under
              fair use; PraxTalk is not affiliated with or endorsed by
              this vendor.
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

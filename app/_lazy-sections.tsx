"use client";

import dynamic from "next/dynamic";

/**
 * Below-the-fold marketing sections that are visually-heavy but
 * carry little SEO weight (the inbox demo + the tech-stack logo
 * wall). Lazy-loaded with ssr: false so they're absent from the
 * initial RSC payload — drops ~50KB off the homepage HTML budget
 * (audit P-01). Skeleton heights are tuned to match the real
 * sections so there's no layout shift on hydration.
 *
 * Compare + Pricing stay server-rendered because their content
 * (vendor names, price points) is what search engines + AI search
 * crawlers actually quote.
 */

export const LazyProductMockup = dynamic(
  () =>
    import("@/components/marketing/ProductMockup").then((m) => ({
      default: m.ProductMockup,
    })),
  {
    ssr: false,
    loading: () => (
      <SectionSkeleton minHeight={760} label="Loading product demo…" />
    ),
  },
);

export const LazyTechStack = dynamic(
  () =>
    import("@/components/marketing/TechStack").then((m) => ({
      default: m.TechStack,
    })),
  {
    ssr: false,
    loading: () => (
      <SectionSkeleton minHeight={520} label="Loading stack diagram…" />
    ),
  },
);

function SectionSkeleton({
  minHeight,
  label,
}: {
  minHeight: number;
  label: string;
}) {
  return (
    <section
      aria-label={label}
      style={{ minHeight }}
      className="relative pb-[120px]"
    >
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <div
          className="rounded-3xl border border-rule-2 bg-paper-2/40"
          style={{ minHeight: minHeight - 120 }}
        />
      </div>
    </section>
  );
}

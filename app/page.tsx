import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { LogoStrip } from "@/components/marketing/LogoStrip";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { Compare } from "@/components/marketing/Compare";
import { Metrics } from "@/components/marketing/Metrics";
import { Integrations } from "@/components/marketing/Integrations";
import { Pricing } from "@/components/marketing/Pricing";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";
import { LazyProductMockup, LazyTechStack } from "./_lazy-sections";

export default function Home() {
  return (
    <>
      <Nav />
      <main id="main">
        <Hero />
        <LogoStrip />
        <FeatureGrid />
        <LazyProductMockup />
        <Compare />
        <Metrics />
        <Integrations />
        <LazyTechStack />
        <Pricing />
        <CtaBlock />
      </main>
      <Footer />
    </>
  );
}

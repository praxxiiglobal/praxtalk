import { Nav } from "@/components/marketing/Nav";
import { Hero } from "@/components/marketing/Hero";
import { LogoStrip } from "@/components/marketing/LogoStrip";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { ProductMockup } from "@/components/marketing/ProductMockup";
import { Compare } from "@/components/marketing/Compare";
import { Metrics } from "@/components/marketing/Metrics";
import { Integrations } from "@/components/marketing/Integrations";
import { TechStack } from "@/components/marketing/TechStack";
import { Pricing } from "@/components/marketing/Pricing";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <LogoStrip />
      <FeatureGrid />
      <ProductMockup />
      <Compare />
      <Metrics />
      <Integrations />
      <TechStack />
      <Pricing />
      <CtaBlock />
      <Footer />
    </>
  );
}

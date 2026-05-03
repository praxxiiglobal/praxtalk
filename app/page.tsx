import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "AI customer messaging platform · PraxTalk",
  description:
    "AI-native customer messaging platform. One inbox for chat, email, WhatsApp, voice. Atlas resolves end to end. Free forever for 100 AI res/mo.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AI customer messaging platform · PraxTalk",
    description:
      "AI-native customer messaging. One inbox for chat, email, WhatsApp, voice. Atlas resolves end to end.",
    url: "/",
    type: "website",
  },
};

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

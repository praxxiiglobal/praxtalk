import { Nav } from "@/components/marketing/Nav";
import { Pricing } from "@/components/marketing/Pricing";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Pricing · PraxTalk",
  description:
    "Simple, transparent pricing for PraxTalk — Spark (free), Team, Scale, and Enterprise. AI auto-replies, multi-brand, full team access.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <Pricing />
        <CtaBlock />
      </main>
      <Footer />
    </>
  );
}

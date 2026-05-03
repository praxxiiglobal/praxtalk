import { Nav } from "@/components/marketing/Nav";
import { Integrations } from "@/components/marketing/Integrations";
import { TechStack } from "@/components/marketing/TechStack";
import { CtaBlock } from "@/components/marketing/CtaBlock";
import { Footer } from "@/components/marketing/Footer";

export const metadata = {
  title: "Integrations · PraxTalk — connects with the tools you already use",
  description:
    "PraxTalk integrates with Postmark, SendGrid, Resend, SMTP/IMAP, WhatsApp Cloud API, Twilio, CallHippo, TeleCMI, Botim, Google Calendar, Microsoft Calendar, Salesforce, HubSpot, Linear, plus a REST API + signed webhooks.",
  alternates: { canonical: "/integrations" },
};

export default function IntegrationsPage() {
  return (
    <>
      <Nav />
      <main id="main">
        <section className="pt-[80px] pb-0 sm:pt-[120px]">
          <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
            <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              Integrations
            </div>
            <h1 className="max-w-[20ch] text-[44px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-[64px]">
              Plugs into the{" "}
              <span className="font-serif italic font-normal">stack</span>{" "}
              you already run.
            </h1>
            <p className="mt-5 max-w-[60ch] text-[15.5px] leading-[1.6] text-muted">
              Email via Postmark / SendGrid / Resend / SMTP+IMAP. WhatsApp
              Cloud API. Voice + SMS via Twilio, CallHippo, TeleCMI. Google
              + Microsoft Calendar. CRM webhooks for Salesforce, HubSpot,
              Linear. A REST API with workspace + brand-scoped keys for
              everything else.
            </p>
          </div>
        </section>
        <Integrations />
        <TechStack />
        <CtaBlock />
      </main>
      <Footer />
    </>
  );
}

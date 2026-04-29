import { SectionHead } from "./SectionHead";
import { cn } from "@/lib/cn";

type Integration = {
  glyph: string;
  name: string;
  cat: string;
  style?: "accent" | "dot";
};

const integrations: Integration[] = [
  { glyph: "St", name: "Stripe", cat: "payments", style: "accent" },
  { glyph: "Sh", name: "Shopify", cat: "commerce", style: "dot" },
  { glyph: "HS", name: "HubSpot", cat: "crm" },
  { glyph: "Sf", name: "Salesforce", cat: "crm", style: "dot" },
  { glyph: "Sl", name: "Slack", cat: "internal" },
  { glyph: "Ln", name: "Linear", cat: "eng", style: "accent" },
  { glyph: "Gh", name: "GitHub", cat: "eng" },
  { glyph: "Nt", name: "Notion", cat: "docs", style: "dot" },
  { glyph: "Sg", name: "Segment", cat: "cdp" },
  { glyph: "Wa", name: "WhatsApp", cat: "channel", style: "accent" },
  { glyph: "Tw", name: "Twilio", cat: "voice / sms", style: "dot" },
  { glyph: "Zd", name: "Zendesk", cat: "migration" },
];

export function Integrations() {
  return (
    <section id="integrations" className="relative pb-[120px]">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <SectionHead
          number="04"
          label="Integrations"
          description="240+ native integrations planned for v1.0 plus an open SDK. Atlas can read and write to any of them under your policy gates."
        >
          Connects to{" "}
          <span className="font-serif italic font-normal">everything</span>{" "}
          your stack already runs.
        </SectionHead>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-rule bg-rule sm:grid-cols-3 lg:grid-cols-6">
          {integrations.map((i) => (
            <div
              key={i.name}
              className="flex min-h-[130px] flex-col gap-2.5 bg-paper p-5"
            >
              <div
                className={cn(
                  "grid size-[34px] place-items-center font-mono text-[13px] font-semibold text-paper",
                  i.style === "accent" ? "bg-accent" : "bg-ink",
                  i.style === "dot" ? "rounded-full" : "rounded-lg",
                )}
              >
                {i.glyph}
              </div>
              <div className="text-[14px] font-semibold tracking-[-0.01em]">
                {i.name}
              </div>
              <div className="font-mono text-[12px] text-muted">{i.cat}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

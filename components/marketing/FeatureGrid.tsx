import { SectionHead } from "./SectionHead";
import { cn } from "@/lib/cn";

export function FeatureGrid() {
  return (
    <section id="ai" className="relative py-[120px]">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <SectionHead
          number="01"
          label="The AI Layer"
          description="Atlas isn't a chatbot bolted onto a helpdesk. It's a multi-agent runtime that reads your knowledge base, your product API, and the customer's own session — then takes action."
        >
          Six agents.{" "}
          <span className="font-serif italic font-normal">One</span>{" "}
          conversation.
          <br />
          Zero hand-offs.
        </SectionHead>

        <div className="grid grid-cols-12 gap-px overflow-hidden rounded-3xl border border-rule bg-rule">
          <Feat span={6} dark num="A.01" title="Resolver Agent">
            <p>
              Understands intent across 104 languages, follows multi-step
              procedures, and escalates only when confidence drops below your
              threshold.
            </p>
            <Bars />
          </Feat>

          <Feat span={6} num="A.02" title="Copilot for humans">
            <p>
              Live drafting, tone matching, and one-click summaries inside
              every reply box. Agents stay in flow — Atlas does the typing.
            </p>
            <SuggestedReply />
          </Feat>

          <Feat span={4} num="A.03" title="Smart routing">
            <p>
              Sentiment, plan tier, language and current topic — all weighed
              in real time before the ticket lands.
            </p>
            <Chips
              chips={[
                { label: "EN" },
                { label: "Pro plan" },
                { label: "Billing" },
                { label: "→", muted: true },
                { label: "Ana K.", accent: true },
              ]}
            />
          </Feat>

          <Feat span={4} num="A.04" title="Self-writing KB">
            <p>
              Atlas drafts knowledge articles from resolved tickets, then PRs
              them to your help center with citations.
            </p>
            <KbDraft />
          </Feat>

          <Feat span={4} dark num="A.05" title="Voice & channel parity">
            <p>
              Phone, WhatsApp, email, in-app, Slack, Messenger, SMS — Atlas
              reasons identically across every surface.
            </p>
            <Globe />
          </Feat>

          <Feat span={8} num="A.06" title="Outcomes, not tickets.">
            <p>
              Atlas can issue refunds, change subscriptions, dispatch shipping
              labels and update CRM records — under the policies you set.
              Every action is logged, reversible, and explainable.
            </p>
            <Chips
              wrap
              chips={[
                { label: "stripe.refund()" },
                { label: "shopify.cancelOrder()" },
                { label: "hubspot.updateDeal()" },
                { label: "salesforce.createCase()" },
                { label: "+ 240 actions", accent: true },
              ]}
            />
          </Feat>

          <Feat span={4} num="A.07" title="Compliance & redaction">
            <p>
              Field-level PII redaction before any prompt leaves your tenant.
              GDPR ready today; SOC 2 Type II in progress.
            </p>
            <Chips
              chips={[
                { label: "GDPR" },
                { label: "SOC 2 (in prog)" },
                { label: "PII redact" },
                { label: "EU residency" },
              ]}
            />
          </Feat>
        </div>
      </div>
    </section>
  );
}

function Feat({
  num,
  title,
  span,
  dark,
  children,
}: {
  num: string;
  title: string;
  span: 4 | 6 | 8;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[280px] flex-col gap-3.5 p-8",
        dark ? "bg-ink text-paper" : "bg-paper",
        span === 4 && "col-span-12 md:col-span-4",
        span === 6 && "col-span-12 md:col-span-6",
        span === 8 && "col-span-12 md:col-span-8",
      )}
    >
      <div
        className={cn(
          "absolute right-6 top-[18px] font-mono text-[11px]",
          dark ? "text-paper/50" : "text-muted",
        )}
      >
        {num}
      </div>
      <h3 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">
        {title}
      </h3>
      <div
        className={cn(
          "[&_p]:m-0 [&_p]:text-sm [&_p]:leading-[1.5]",
          dark ? "[&_p]:text-paper/60" : "[&_p]:text-muted",
        )}
      >
        {children}
      </div>
      <div className="mt-auto" aria-hidden="true" />
    </div>
  );
}

function Bars() {
  const heights = [35, 55, 40, 70, 90, 65, 80, 100, 55, 75, 60, 85];
  const hi = new Set([4, 7, 11]);
  return (
    <div className="mt-auto flex h-20 items-end gap-1.5">
      {heights.map((h, i) => (
        <span
          key={i}
          className={cn(
            "flex-1 rounded-[3px]",
            hi.has(i) ? "bg-accent" : "bg-white/[0.18]",
          )}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function SuggestedReply() {
  return (
    <div className="mt-auto rounded-[10px] border-l-2 border-accent bg-paper-2 p-3.5 text-[13px] leading-[1.5] text-ink">
      <span className="eyebrow mb-1 block text-accent">
        SUGGESTED REPLY · 0.91
      </span>
      Hey Jordan — totally get it. I just refunded the duplicate $24.99 charge
      to your Visa ending 4412. You&apos;ll see it in 2–3 business days.
      Anything else?
    </div>
  );
}

function Chips({
  chips,
  wrap,
}: {
  chips: { label: string; accent?: boolean; muted?: boolean }[];
  wrap?: boolean;
}) {
  return (
    <div
      className={cn(
        "mt-auto flex items-center gap-2 font-mono text-[11px]",
        wrap && "flex-wrap",
      )}
    >
      {chips.map((c, i) => (
        <span
          key={i}
          className={cn(
            "rounded-full border px-2.5 py-1",
            c.accent && "border-accent bg-accent text-white",
            c.muted && "border-transparent bg-transparent opacity-40",
            !c.accent &&
              !c.muted &&
              "border-rule-2 bg-paper-2 text-ink",
          )}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

function KbDraft() {
  return (
    <div className="mt-auto rounded-[10px] border border-dashed border-rule-2 p-3.5 font-mono text-[12px] leading-[1.6] text-muted">
      <b className="font-medium text-ink">+ How to switch billing cycles</b>
      <br />
      drafted 14m ago · 3 sources
      <br />
      <span className="text-accent">[ review &amp; publish ]</span>
    </div>
  );
}

function Globe() {
  const cells = [
    "mid", "", "on", "mid", "",
    "on", "", "mid", "on", "",
    "mid", "on", "", "mid", "",
    "on", "", "mid", "on", "mid",
  ];
  return (
    <div className="mt-auto grid h-[90px] grid-cols-[repeat(20,1fr)] items-end gap-0.5">
      {cells.map((c, i) => (
        <span
          key={i}
          className={cn(
            "block",
            c === "on" && "h-full bg-accent opacity-100",
            c === "mid" && "h-[60%] bg-white/40",
            c === "" && "h-[30%] bg-white/15",
          )}
        />
      ))}
    </div>
  );
}

import { SectionHead } from "./SectionHead";

const inboxItems = [
  { initials: "JR", name: "Jordan R.", preview: "Refund issue · Visa 4412", badge: "2m", color: "bg-accent" },
  { initials: "MA", name: "Maya A.", preview: "Promo not applying at chec…", badge: "live", active: true },
  { initials: "EL", name: "Elif L.", preview: "How do I export my data?", badge: "14m", color: "bg-[#4A6B3F]" },
  { initials: "DK", name: "Daniel K.", preview: "Switching from Crisp — m…", badge: "1h", color: "bg-[#8A7A3F]" },
  { initials: "SP", name: "Sana P.", preview: "Billing cycle question", badge: "3h", color: "bg-[#3F5C2E]" },
];

const views = [
  { color: "bg-accent", label: "VIP queue · 3" },
  { color: "bg-good", label: "AI-resolved · 312" },
  { color: "bg-warn", label: "Awaiting review · 7" },
];

export function ProductMockup() {
  return (
    <section id="product" className="relative pb-[120px]">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <SectionHead
          number="02"
          label="The Workspace"
          description="An inbox engineered with frontline support teams. Keyboard-first, infinitely scriptable, with real-time AI context in every pane."
        >
          Built for the way agents{" "}
          <span className="font-serif italic font-normal">actually</span>{" "}
          work.
        </SectionHead>

        {/* Mockup wrapper */}
        <div className="relative overflow-hidden rounded-3xl border border-rule-2 bg-paper-2 p-3.5">
          <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-transparent via-transparent to-black/[0.04]" />
          <div className="overflow-hidden rounded-2xl border border-rule bg-paper shadow-[0_30px_60px_-30px_rgba(11,15,18,0.25)]">
            {/* Browser bar */}
            <div className="flex items-center gap-2.5 border-b border-rule bg-paper-2 px-3.5 py-2.5">
              <div className="flex gap-1.5">
                <i className="block size-2.5 rounded-full bg-rule-2" />
                <i className="block size-2.5 rounded-full bg-rule-2" />
                <i className="block size-2.5 rounded-full bg-rule-2" />
              </div>
              <div className="flex flex-1 items-center gap-2 rounded-lg border border-rule bg-paper px-2.5 py-1 font-mono text-[11px] text-muted">
                <span className="size-2 rounded-full bg-good" />
                https://app.praxtalk.com/inbox/all
              </div>
              <div className="font-mono text-[11px] text-muted">
                workspace · acme
              </div>
            </div>

            {/* App grid */}
            <div className="grid lg:h-[560px] lg:grid-cols-[220px_1.05fr_1fr]">
              {/* Sidebar */}
              <aside className="hidden flex-col gap-1.5 border-r border-rule bg-paper-2 p-3.5 lg:flex">
                <div className="px-2 pb-1.5 pt-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                  Inboxes
                </div>
                {inboxItems.map((item, i) => (
                  <div
                    key={i}
                    className={
                      "flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] " +
                      (item.active ? "border border-rule bg-paper" : "")
                    }
                  >
                    <div
                      className={
                        "grid size-[26px] place-items-center rounded-full font-mono text-[11px] text-paper " +
                        (item.color ?? "bg-ink")
                      }
                    >
                      {item.initials}
                    </div>
                    <div className="min-w-0 flex-1">
                      <b className="block text-[13px] font-semibold tracking-[-0.01em]">
                        {item.name}
                      </b>
                      <span className="block max-w-[140px] truncate text-[11px] text-muted">
                        {item.preview}
                      </span>
                    </div>
                    <span
                      className={
                        "font-mono text-[9px] " +
                        (item.active ? "text-accent" : "text-muted")
                      }
                    >
                      {item.badge}
                    </span>
                  </div>
                ))}

                <div className="px-2 pb-1.5 pt-3.5 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
                  Views
                </div>
                {views.map((v) => (
                  <div
                    key={v.label}
                    className="flex items-center gap-2 px-2 py-1.5 text-[12px] text-muted"
                  >
                    <span className={"size-1.5 rounded-full " + v.color} />
                    {v.label}
                  </div>
                ))}
              </aside>

              {/* Convo */}
              <div className="flex flex-col border-r border-rule bg-paper">
                <div className="flex items-center gap-3 border-b border-rule px-4 py-3.5">
                  <div className="grid size-[30px] place-items-center rounded-full bg-ink font-mono text-[11px] text-paper">
                    MA
                  </div>
                  <div>
                    <b className="tracking-[-0.01em]">Maya Aronsson</b>
                    <div className="text-[11px] text-muted">
                      maya@nordbright.io · Pro plan · Stockholm
                    </div>
                  </div>
                  <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-rule-2 px-2 py-1 font-mono text-[10px] text-muted">
                    <span className="size-1.5 rounded-full bg-good" /> LIVE
                  </span>
                  <span className="rounded-full border border-rule-2 px-2 py-1 font-mono text-[10px] text-muted">
                    CSAT 4.9
                  </span>
                </div>

                <div className="flex flex-1 flex-col gap-3.5 overflow-hidden p-4">
                  <Bubble who="them" name="Maya · 10:24">
                    Hey! My promo <b>SPRING30</b> isn&apos;t applying at
                    checkout — order #44218.
                  </Bubble>
                  <Bubble who="ai" name="Atlas drafted reply · 0.94">
                    Promo requires $50+ subtotal. Cart is $48. Suggest applying
                    free-shipping credit ($6.40) to unlock — proceed?
                  </Bubble>
                  <Bubble who="me" name="You · 10:24">
                    Found it — your cart is $48 and SPRING30 needs $50+.
                    I&apos;ve added a free shipping credit ($6.40) so the
                    promo unlocks. Try refreshing checkout?
                  </Bubble>
                  <Bubble who="them" name="Maya · 10:25">
                    That worked! ❤️ thank you!
                  </Bubble>
                </div>

                <div className="flex items-center gap-2 border-t border-rule bg-paper-2 px-3.5 py-2.5">
                  <div className="flex-1 rounded-[10px] border border-rule bg-paper px-2.5 py-1.5 font-mono text-[12px] text-muted">
                    ⌘K  Reply, /macro, or ask Atlas…
                  </div>
                  <div className="grid size-[30px] place-items-center rounded-lg bg-ink text-base text-paper">
                    ↵
                  </div>
                </div>
              </div>

              {/* Right panel */}
              <div className="hidden flex-col gap-4 bg-paper-2 p-4 lg:flex">
                <Heading>Customer Context</Heading>
                <Card
                  rows={[
                    ["Plan", "Pro · $79/mo"],
                    ["LTV", "$1,240"],
                    ["Last order", "2d ago · #44218"],
                    ["Sentiment", "Positive ↑", "good"],
                    ["Risk score", "0.08 · low"],
                  ]}
                />
                <Heading>AI Suggestion</Heading>
                <div className="ai-card-glow relative overflow-hidden rounded-xl bg-ink p-3.5 text-paper">
                  <span className="relative z-10 mb-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-accent">
                    Atlas · proactive
                  </span>
                  <p className="relative z-10 m-0 text-[13px] leading-[1.5]">
                    Maya churned a similar promo last month. Offer a 10%
                    loyalty code now — predicted lift +$84 LTV.
                  </p>
                  <div className="relative z-10 mt-3 flex gap-1.5">
                    {["Send code", "Snooze", "Why?"].map((a) => (
                      <span
                        key={a}
                        className="rounded-full bg-white/[0.08] px-2 py-1 font-mono text-[10.5px]"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                </div>
                <Heading>Linked records</Heading>
                <Card
                  rows={[
                    ["HubSpot deal", "#H-7740"],
                    ["Stripe customer", "cus_PqA…2v"],
                    ["Linear issue", "—"],
                  ]}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Bubble({
  who,
  name,
  children,
}: {
  who: "them" | "me" | "ai";
  name: string;
  children: React.ReactNode;
}) {
  const base =
    "max-w-[80%] rounded-2xl px-3 py-2.5 text-[13px] leading-[1.45]";
  const cls =
    who === "them"
      ? `${base} self-start rounded-tl-[4px] bg-paper-2`
      : who === "me"
      ? `${base} self-end rounded-tr-[4px] bg-ink text-paper`
      : `${base} self-start rounded-tl-[4px] bg-accent-soft border border-accent/30`;
  return (
    <div className={cls}>
      <span
        className={
          "mb-0.5 block font-mono text-[9px] uppercase tracking-[0.08em] " +
          (who === "ai" ? "text-accent" : "text-muted")
        }
      >
        {name}
      </span>
      {children}
    </div>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="m-0 font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
      {children}
    </h4>
  );
}

function Card({ rows }: { rows: Array<[string, string, "good"?]> }) {
  return (
    <div className="rounded-xl border border-rule bg-paper p-3.5">
      {rows.map(([label, value, tone], i) => (
        <div
          key={i}
          className="flex justify-between border-b border-dashed border-rule py-1.5 text-[12px] last:border-0"
        >
          <b className="font-semibold tracking-[-0.01em]">{label}</b>
          <span
            className={
              "font-mono text-[11px] " +
              (tone === "good" ? "text-good" : "text-muted")
            }
          >
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

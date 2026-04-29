import { SectionHead } from "./SectionHead";
import { cn } from "@/lib/cn";

type Cell = { kind: "yes" } | { kind: "no" } | { kind: "partial"; label: string };

const yes: Cell = { kind: "yes" };
const no: Cell = { kind: "no" };
const partial = (label: string): Cell => ({ kind: "partial", label });

const competitors = [
  "PraxTalk",
  "Intercom",
  "HubSpot Chat",
  "LiveChat",
  "Drift",
  "Crisp",
  "Tawk.to",
];

const rows: Array<{
  feature: string;
  detail: string;
  cells: Cell[];
}> = [
  {
    feature: "Autonomous resolution agent",
    detail: "Multi-step actions, not just FAQ replies",
    cells: [yes, partial("add-on"), no, no, partial("basic"), no, no],
  },
  {
    feature: "Unified inbox: chat, email, voice, WhatsApp",
    detail: "Single thread per customer across channels",
    cells: [yes, yes, partial("partial"), partial("add-on"), no, yes, no],
  },
  {
    feature: "Action-taking AI (refunds, orders, CRM writes)",
    detail: "Atlas executes via your API, not just suggests",
    cells: [yes, no, no, no, no, no, no],
  },
  {
    feature: "Self-writing knowledge base",
    detail: "AI drafts and PRs articles from resolved tickets",
    cells: [yes, partial("draft only"), no, no, no, no, no],
  },
  {
    feature: "Field-level PII redaction before LLM call",
    detail: "Compliance-grade AI for healthcare & fintech",
    cells: [yes, partial("enterprise"), no, no, no, no, no],
  },
  {
    feature: "Transparent per-resolution pricing",
    detail: "Pay only for AI conversations Atlas closes",
    cells: [yes, partial("$0.99/res"), no, no, partial("tiered"), yes, partial("free")],
  },
  {
    feature: "Open agent SDK + tool framework",
    detail: "Build custom agents in TypeScript",
    cells: [yes, no, no, no, no, no, no],
  },
  {
    feature: "Free tier with full AI features",
    detail: "No credit card, all channels included",
    cells: [yes, no, partial("limited"), no, no, partial("2 seats"), yes],
  },
];

export function Compare() {
  return (
    <section id="compare" className="relative pb-[120px]">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <SectionHead
          number="03"
          label="Why Prax"
          description="Tawk.to. Intercom. Crisp. LiveChat. Drift. HubSpot Chat. Most teams stitch two or three together. PraxTalk is built to consolidate the workflow — and add an autonomous AI layer none of them ship natively."
        >
          One platform replaces the{" "}
          <span className="font-serif italic font-normal">six</span> tabs in
          your stack.
        </SectionHead>

        <div className="overflow-x-auto rounded-3xl border border-rule-2 bg-paper">
          <div className="min-w-[860px]">
          {/* Header row */}
          <div className="grid grid-cols-[1.6fr_repeat(7,1fr)] items-center">
            {competitors.map((name, i) => (
              <div
                key={name}
                className={cn(
                  "border-b border-rule p-4 font-mono text-[11px] uppercase tracking-[0.06em]",
                  i === 0 ? "text-muted" : "text-muted",
                  i === 1 && "bg-ink text-paper",
                  i !== 1 && "bg-paper-2",
                )}
              >
                {i === 0 ? "Capability" : name}
              </div>
            ))}
          </div>

          {rows.map((row, ri) => (
            <div
              key={ri}
              className="grid grid-cols-[1.6fr_repeat(7,1fr)] items-center"
            >
              <div className="border-b border-rule p-4 last:border-0">
                <div className="font-medium tracking-[-0.01em] text-[14px]">
                  {row.feature}
                </div>
                <small className="mt-0.5 block text-[12px] font-normal text-muted">
                  {row.detail}
                </small>
              </div>
              {row.cells.map((cell, ci) => (
                <div
                  key={ci}
                  className={cn(
                    "border-b border-rule p-4 text-[14px] last:border-0",
                    ci === 0 && "bg-accent-soft/60",
                  )}
                >
                  <CellMark cell={cell} primary={ci === 0} />
                </div>
              ))}
            </div>
          ))}
          </div>
        </div>

        <p className="mt-6 text-center text-[12px] text-muted">
          PraxTalk is in open beta — this table reflects the v1.0 release scope.
        </p>
      </div>
    </section>
  );
}

function CellMark({ cell, primary }: { cell: Cell; primary?: boolean }) {
  if (cell.kind === "yes") {
    return (
      <span
        className={cn(
          "inline-grid size-6 place-items-center rounded-full text-[13px] font-bold text-white",
          primary ? "bg-accent" : "bg-good",
        )}
      >
        ✓
      </span>
    );
  }
  if (cell.kind === "partial") {
    return (
      <span className="inline-grid h-6 min-w-[24px] place-items-center rounded-full border border-rule-2 bg-paper-2 px-2 font-mono text-[11px] text-muted">
        {cell.label}
      </span>
    );
  }
  return <span className="text-[18px] text-rule-2">—</span>;
}

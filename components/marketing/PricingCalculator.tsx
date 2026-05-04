"use client";

import { useMemo, useState } from "react";

const PER_SEAT = { team: 29, scale: 89 } as const;
const FREE_RES_PER_MONTH = 100; // Spark allowance reused inside Team/Scale
const PRAXTALK_PER_RES = 0.04;
// Annual prepayment trades a chunky discount for cash-up-front. 20%
// is the standard SaaS anchor (matches Crisp + Intercom's annual
// rates) and lands the Team plan at $23.20/seat — competitive with
// Tawk.to + a chatbot add-on at scale.
const ANNUAL_DISCOUNT = 0.2;

// Rough comparison anchors. These are public list prices for a small
// CX team — not negotiated rates. Linked to provider sites in the
// footnote so anyone can verify.
const COMPETITORS = [
  {
    name: "Tawk.to",
    formula: (_seats: number) => 0,
    note: "free, no AI; you'll add a chatbot for $29/mo",
  },
  {
    name: "Crisp Pro",
    formula: (_seats: number) => 25, // flat
    note: "$25/mo flat, 4 seats included",
  },
  {
    name: "Intercom Essential",
    formula: (seats: number) => 39 * seats,
    note: "$39/seat/mo + $0.99/AI resolution",
  },
  {
    name: "Zendesk Suite Growth",
    formula: (seats: number) => 79 * seats,
    note: "$79/seat/mo, AI add-on extra",
  },
];

export function PricingCalculator() {
  const [seats, setSeats] = useState(5);
  const [aiRes, setAiRes] = useState(2000);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const billed = useMemo(() => {
    const seatMultiplier = billing === "annual" ? 1 - ANNUAL_DISCOUNT : 1;
    const teamPerSeat = PER_SEAT.team * seatMultiplier;
    const scalePerSeat = PER_SEAT.scale * seatMultiplier;
    const teamSeatCost = seats * teamPerSeat;
    const scaleSeatCost = seats * scalePerSeat;
    const billableRes = Math.max(0, aiRes - FREE_RES_PER_MONTH * seats);
    const aiCost = billableRes * PRAXTALK_PER_RES;
    return {
      team: teamSeatCost + aiCost,
      scale: scaleSeatCost + aiCost,
      aiCost,
      teamSeatCost,
      scaleSeatCost,
      billableRes,
      teamPerSeat,
      scalePerSeat,
    };
  }, [seats, aiRes, billing]);

  const annualSavingsTeam =
    billing === "annual"
      ? Math.round((seats * PER_SEAT.team - billed.teamPerSeat * seats) * 12)
      : 0;

  return (
    <section className="border-t border-rule bg-paper-2/40 py-16 sm:py-20">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
          <div>
            <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
              Total cost · {billing === "annual" ? "annual prepay" : "monthly"}
            </div>
            <h2 className="mt-2 text-[36px] font-semibold leading-[1.05] tracking-[-0.025em] text-ink sm:text-[44px]">
              Run the numbers for{" "}
              <span className="font-serif italic font-normal">your</span>{" "}
              team.
            </h2>
            <p className="mt-3 max-w-[44ch] text-[15px] leading-[1.55] text-muted">
              Drag the sliders. We&apos;ll show what PraxTalk costs at your
              size and how that compares to the four tools you&apos;re
              probably weighing it against.
            </p>

            <div className="mt-7 inline-flex items-center gap-1 rounded-full border border-rule-2 bg-paper p-1">
              <BillingToggle
                active={billing === "monthly"}
                onClick={() => setBilling("monthly")}
              >
                Monthly
              </BillingToggle>
              <BillingToggle
                active={billing === "annual"}
                onClick={() => setBilling("annual")}
              >
                Annual
                <span className="ml-1.5 rounded-full bg-good/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.06em] text-good">
                  −{Math.round(ANNUAL_DISCOUNT * 100)}%
                </span>
              </BillingToggle>
            </div>

            <div className="mt-7 flex flex-col gap-6">
              <Slider
                label="Operators / agents"
                value={seats}
                min={1}
                max={50}
                step={1}
                onChange={setSeats}
                suffix={seats === 1 ? "person" : "people"}
              />
              <Slider
                label="AI-resolved conversations / month"
                value={aiRes}
                min={0}
                max={20000}
                step={100}
                onChange={setAiRes}
                suffix={aiRes.toLocaleString()}
                hideValueText
              />
              <p className="text-[12px] leading-relaxed text-muted">
                First {FREE_RES_PER_MONTH} resolutions per seat are free.
                After that, $0.04 per AI resolution. Human-handled
                conversations are always free.
                {billing === "annual" && annualSavingsTeam > 0 && (
                  <>
                    {" "}
                    <strong className="text-ink">
                      Annual prepay saves $
                      {annualSavingsTeam.toLocaleString()} on Team across the
                      year vs the monthly plan.
                    </strong>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="rounded-[18px] border border-rule-2 bg-paper p-6 sm:p-8">
            <PlanRow
              name="PraxTalk Team"
              total={billed.team}
              detail={`${seats} × $${billed.teamPerSeat.toFixed(2)}${
                billing === "annual" ? " (annual)" : ""
              } + ${billed.billableRes.toLocaleString()} AI res @ $0.04`}
              feat
            />
            <PlanRow
              name="PraxTalk Scale"
              total={billed.scale}
              detail={`${seats} × $${billed.scalePerSeat.toFixed(2)}${
                billing === "annual" ? " (annual)" : ""
              } + ${billed.billableRes.toLocaleString()} AI res @ $0.04`}
            />
            <div className="my-5 border-t border-dashed border-rule-2" />
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              For comparison · same {seats}-person team
            </div>
            <div className="mt-3 flex flex-col gap-2.5">
              {COMPETITORS.map((c) => (
                <CompareRow
                  key={c.name}
                  name={c.name}
                  total={c.formula(seats)}
                  note={c.note}
                />
              ))}
            </div>
            <p className="mt-5 text-[10.5px] leading-[1.5] text-muted">
              Comparison numbers are public list prices as of{" "}
              {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}.
              We don&apos;t track competitor changes daily — verify on
              their sites before you decide. AI-resolution costs not
              included for competitors that meter them differently.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  hideValueText,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  suffix: string;
  hideValueText?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
        <span className="font-mono text-[13px] tabular-nums text-ink">
          {hideValueText ? suffix : `${value} ${suffix}`}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 w-full cursor-pointer appearance-none rounded-full bg-rule-2 accent-ink"
      />
    </label>
  );
}

function PlanRow({
  name,
  total,
  detail,
  feat,
}: {
  name: string;
  total: number;
  detail: string;
  feat?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-4 rounded-xl px-4 py-3.5 ${
        feat ? "bg-ink text-paper" : "bg-paper-2/60 text-ink"
      }`}
    >
      <div>
        <div className="text-[14px] font-semibold tracking-[-0.01em]">
          {name}
        </div>
        <div
          className={`mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] ${
            feat ? "text-paper/65" : "text-muted"
          }`}
        >
          {detail}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[24px] font-semibold tabular-nums tracking-[-0.02em]">
          ${Math.round(total).toLocaleString()}
        </div>
        <div
          className={`text-[10.5px] uppercase tracking-[0.06em] ${
            feat ? "text-paper/65" : "text-muted"
          }`}
        >
          /mo
        </div>
      </div>
    </div>
  );
}

function CompareRow({
  name,
  total,
  note,
}: {
  name: string;
  total: number;
  note: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]">
      <div>
        <div className="font-medium text-ink">{name}</div>
        <div className="font-mono text-[10.5px] text-muted">{note}</div>
      </div>
      <div className="text-right font-mono text-[13px] tabular-nums text-muted">
        ${total.toLocaleString()}
        <span className="ml-0.5 text-[10.5px] uppercase tracking-[0.06em]">
          /mo
        </span>
      </div>
    </div>
  );
}

function BillingToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex h-7 items-center rounded-full px-3 font-mono text-[10.5px] uppercase tracking-[0.06em] transition " +
        (active ? "bg-ink text-paper" : "text-muted hover:text-ink")
      }
    >
      {children}
    </button>
  );
}

export function CtaBlock() {
  return (
    <section className="relative pb-[120px]">
      <div className="mx-auto max-w-[1320px] px-8">
        <div className="cta-glow relative overflow-hidden rounded-[28px] bg-ink px-14 py-20 text-paper">
          <h2 className="relative z-10 m-0 mb-5 max-w-[14ch] text-[clamp(48px,6vw,96px)] font-semibold leading-[0.95] tracking-[-0.04em]">
            Stop staffing tickets.
            <br />
            Start{" "}
            <span className="font-serif italic font-normal">resolving</span>{" "}
            them.
          </h2>
          <p className="relative z-10 m-0 mb-8 max-w-[42ch] text-[18px] leading-[1.5] text-paper/65">
            Spin up PraxTalk in minutes. Migrate from Intercom, Crisp,
            LiveChat or Tawk in a single click. Free forever for 100 AI
            resolutions / month.
          </p>
          <div className="relative z-10 flex flex-wrap items-center gap-3">
            <a
              href="#start"
              className="group inline-flex h-[38px] items-center gap-2 rounded-full bg-paper px-4 text-sm font-medium text-ink transition hover:-translate-y-px"
            >
              Start free — no card
              <span
                aria-hidden
                className="transition group-hover:translate-x-0.5"
              >
                →
              </span>
            </a>
            <a
              href="#demo"
              className="inline-flex h-[38px] items-center rounded-full border border-white/25 px-4 text-sm font-medium text-paper transition hover:-translate-y-px"
            >
              Book a 20-min demo
            </a>
          </div>
          <div className="absolute bottom-12 right-12 text-right font-mono text-[11px] uppercase tracking-[0.08em] text-paper/50">
            PRAXTALK · ATLAS
            <br />
            OPEN BETA · 2026
          </div>
        </div>
      </div>
    </section>
  );
}

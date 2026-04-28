export function Hero() {
  return (
    <header className="relative pt-20 pb-10">
      <div className="mx-auto max-w-[1320px] px-8">
        <div className="grid items-end gap-16 lg:grid-cols-[1.05fr_0.95fr]">
          {/* LEFT */}
          <div>
            <div className="eyebrow mb-7 inline-flex items-center gap-2.5 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              Open beta · Atlas AI live
            </div>

            <h1 className="font-sans font-semibold tracking-[-0.045em] leading-[0.92] text-[clamp(56px,7.6vw,116px)] m-0">
              Conversations
              <br />
              that{" "}
              <span className="font-serif italic font-normal tracking-[-0.02em]">
                close
              </span>
              <br />
              <span className="text-accent">themselves.</span>
            </h1>

            <p className="mt-8 max-w-[520px] text-[19px] leading-[1.45] text-muted">
              PraxTalk is the AI-native customer messaging platform. One inbox
              for live chat, email, WhatsApp, voice and in-app — with Atlas,
              an autonomous agent that resolves common conversations end to
              end.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <a
                href="#start"
                className="group inline-flex h-[38px] items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px"
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
                className="inline-flex h-[38px] items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
              >
                Watch 90-sec tour
              </a>
            </div>

            <div className="mt-9 grid max-w-[520px] grid-cols-3 gap-8 border-t border-rule pt-[18px] text-[13px] text-muted">
              <div>
                <b className="block text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  6
                </b>
                channels in one inbox
              </div>
              <div>
                <b className="block text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  104
                </b>
                languages reasoned in
              </div>
              <div>
                <b className="block text-[22px] font-semibold tracking-[-0.02em] text-ink">
                  &lt;50<span className="text-base font-normal">KB</span>
                </b>
                widget footprint
              </div>
            </div>
          </div>

          {/* RIGHT — console */}
          <div className="relative">
            <ConsoleCard />

            <div className="absolute left-[-20px] top-[30%] flex items-center gap-2.5 rounded-2xl border border-rule-2 bg-paper px-3 py-2.5 text-xs shadow-[0_8px_24px_-12px_rgba(11,15,18,0.25)]">
              <div>
                <span className="eyebrow mb-0.5 block text-muted">
                  Status
                </span>
                <span className="font-semibold tracking-[-0.01em]">
                  Open beta · 2026
                </span>
              </div>
            </div>

            <div className="absolute right-[-30px] bottom-[18%] flex items-center gap-2.5 rounded-2xl border border-rule-2 bg-paper px-3 py-2.5 text-xs shadow-[0_8px_24px_-12px_rgba(11,15,18,0.25)]">
              <div>
                <span className="eyebrow mb-0.5 block text-muted">
                  Free tier
                </span>
                <span className="font-semibold tracking-[-0.01em]">
                  100 AI res / mo
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function ConsoleCard() {
  return (
    <div className="console-glow relative overflow-hidden rounded-[20px] bg-ink p-[18px] text-paper shadow-[0_1px_0_rgba(255,255,255,0.05)_inset,0_30px_60px_-30px_rgba(11,15,18,0.45),0_8px_20px_-10px_rgba(11,15,18,0.25)]">
      {/* head */}
      <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-2 pb-3.5 pt-1.5 font-mono text-[11px] text-white/60">
        <span className="mr-2 flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/[0.18]" />
          <span className="size-2.5 rounded-full bg-white/[0.18]" />
          <span className="size-2.5 rounded-full bg-white/[0.18]" />
        </span>
        <span>atlas.praxtalk.com / live</span>
        <span className="ml-auto inline-flex items-center gap-1.5">
          <span className="size-1.5 rounded-full bg-good shadow-[0_0_0_4px_oklch(0.62_0.13_150_/_0.2)]" />
          PREVIEW · simulated trace
        </span>
      </div>

      {/* chat */}
      <div className="flex flex-col gap-3.5 px-2 pb-1.5 pt-4">
        <div className="max-w-[78%] self-start rounded-2xl rounded-tl-[6px] bg-white/[0.07] px-3.5 py-2.5 text-sm leading-snug">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] opacity-70">
            Maya · checkout
          </span>
          My promo <b>SPRING30</b> isn&apos;t applying at checkout — order
          #44218.
        </div>

        <div className="max-w-[78%] self-end rounded-2xl rounded-tr-[6px] bg-accent px-3.5 py-2.5 text-sm leading-snug text-white">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] opacity-85">
            Atlas AI · resolved 0:03
          </span>
          Found it — your cart total is $48 and SPRING30 needs $50+. I&apos;ve
          added a free shipping credit ($6.40) so the promo unlocks. Try
          refreshing checkout?
        </div>

        <div className="max-w-[78%] self-start rounded-2xl rounded-tl-[6px] bg-white/[0.07] px-3.5 py-2.5 text-sm leading-snug">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.08em] opacity-70">
            Maya
          </span>
          That worked! ❤️
        </div>

        <div className="inline-flex w-fit gap-1 self-start rounded-2xl rounded-tl-[6px] bg-white/5 px-3 py-2.5">
          <i className="typing-dot block size-1.5 rounded-full bg-white/55" />
          <i className="typing-dot block size-1.5 rounded-full bg-white/55" />
          <i className="typing-dot block size-1.5 rounded-full bg-white/55" />
        </div>
      </div>

      <div className="mt-2.5 flex justify-between border-t border-white/[0.08] px-2 pb-1 pt-3 font-mono text-[10.5px] tracking-[0.05em] text-white/55">
        <span className="inline-flex items-center gap-1.5 text-white">
          <span className="pulse-dot size-1.5 rounded-full bg-accent" />
          Atlas reasoning · 6 tools · 1 KB article cited
        </span>
        <span>conf 0.94</span>
      </div>
    </div>
  );
}

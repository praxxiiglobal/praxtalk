import { SectionHead } from "./SectionHead";
import { cn } from "@/lib/cn";

export function TechStack() {
  return (
    <section id="stack" className="relative pb-[120px]">
      <div className="mx-auto max-w-[1320px] px-8">
        <SectionHead
          number="05"
          label="Engineered for builders"
          description="PraxTalk is built on a modern, fully-typed runtime — TypeScript from the database to the React Server Component. No SQL migrations, no ORM tax, no schema drift. Just the same types from your Convex document to your useQuery hook."
        >
          End-to-end{" "}
          <span className="font-serif italic font-normal">type-safe.</span>
          <br />
          Document-native.{" "}
          <span className="text-accent">Edge-rendered.</span>
        </SectionHead>

        <div className="grid items-stretch gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {/* Stack callouts */}
          <div className="grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-rule bg-rule sm:grid-cols-2">
            <Callout num="FE" title="Next.js 16">
              <p>
                App Router, React Server Components, partial pre-rendering and
                Turbopack by default. The dashboard streams to first byte in
                under 200ms on the edge.
              </p>
              <Chips chips={["RSC", "Turbopack", "PPR", { label: "edge", accent: true }]} />
            </Callout>

            <Callout num="DB" title="Convex">
              <p>
                TypeScript-native, document-based reactive database. Every
                query is real-time by default — no websocket plumbing, no
                polling, no NoSQL ceremony.
              </p>
              <Chips chips={["document", "reactive", "no-SQL", { label: "TS-native", accent: true }]} />
            </Callout>

            <Callout num="UI" title="Tailwind 4">
              <p>
                Oxide engine, CSS-native @theme config, container queries
                everywhere. The design system rebuilds in under 80ms during
                development.
              </p>
              <Chips chips={["oxide", "@theme", "cq", { label: "80ms HMR", accent: true }]} />
            </Callout>

            <Callout num="LANG" title="TypeScript, end-to-end" dark>
              <p>
                The same{" "}
                <code className="font-mono text-[12px] text-accent">
                  Conversation
                </code>{" "}
                type flows from the Convex document, through the Atlas SDK,
                into your React component. Refactor once — everything compiles.
              </p>
              <Chips
                chips={[
                  { label: "strict", solid: true },
                  { label: "zod", solid: true },
                  "v.object()",
                  { label: "0 any", accent: true },
                ]}
              />
            </Callout>
          </div>

          {/* Code preview */}
          <div className="console-glow relative overflow-hidden rounded-3xl bg-ink p-[18px] text-paper shadow-[0_30px_60px_-30px_rgba(11,15,18,0.45)]">
            <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-2 pb-3 pt-1.5 font-mono text-[11px] text-white/60">
              <span className="mr-2 flex gap-1.5">
                <span className="size-2.5 rounded-full bg-white/[0.18]" />
                <span className="size-2.5 rounded-full bg-white/[0.18]" />
                <span className="size-2.5 rounded-full bg-white/[0.18]" />
              </span>
              <span>convex/messages.ts</span>
              <span className="ml-auto text-white/55">type-checked</span>
            </div>
            <pre className="m-0 overflow-auto whitespace-pre-wrap p-3.5 font-mono text-[12.5px] leading-[1.65] text-paper/85">
              <span className="text-white/45">{"// fully reactive — no useEffect, no fetch\n"}</span>
              <span className="text-accent">import</span>{" { v } "}
              <span className="text-accent">from</span>{" "}
              <span className="text-[#9ed393]">{`"convex/values"`}</span>
              {";\n"}
              <span className="text-accent">import</span>{" { query, mutation } "}
              <span className="text-accent">from</span>{" "}
              <span className="text-[#9ed393]">{`"./_generated/server"`}</span>
              {";\n\n"}
              <span className="text-accent">export const</span>
              {" resolve = mutation({\n"}
              {"  args: { conversationId: v."}
              <span className="text-[#7ec4ff]">id</span>
              {"("}
              <span className="text-[#9ed393]">{`"conversations"`}</span>
              {") },\n"}
              {"  handler: "}
              <span className="text-accent">async</span>
              {" (ctx, { conversationId }) => {\n"}
              {"    "}
              <span className="text-accent">const</span>
              {" convo = "}
              <span className="text-accent">await</span>
              {" ctx.db."}
              <span className="text-[#7ec4ff]">get</span>
              {"(conversationId);\n"}
              {"    "}
              <span className="text-accent">const</span>
              {" reply = "}
              <span className="text-accent">await</span>
              {" ctx.runAction(api.atlas."}
              <span className="text-[#7ec4ff]">draft</span>
              {", {\n"}
              {"      thread: convo.messages,\n"}
              {"      tools: ["}
              <span className="text-[#9ed393]">{`"stripe.refund"`}</span>
              {", "}
              <span className="text-[#9ed393]">{`"shopify.order"`}</span>
              {"],\n"}
              {"      policy: "}
              <span className="text-[#9ed393]">{`"resolver-v1"`}</span>
              {",\n"}
              {"    });\n"}
              {"    "}
              <span className="text-accent">await</span>
              {" ctx.db."}
              <span className="text-[#7ec4ff]">patch</span>
              {"(conversationId, {\n"}
              {"      status: "}
              <span className="text-[#9ed393]">{`"resolved"`}</span>
              {",\n"}
              {"      resolvedBy: "}
              <span className="text-[#9ed393]">{`"atlas"`}</span>
              {",\n"}
              {"      confidence: reply.confidence,\n"}
              {"    });\n"}
              {"  },\n"}
              {"});"}
            </pre>
            <div className="flex justify-between border-t border-white/[0.08] px-2 pb-1 pt-3 font-mono text-[10.5px] tracking-[0.05em] text-white/55">
              <span className="inline-flex items-center gap-1.5 text-white">
                <span className="pulse-dot size-1.5 rounded-full bg-accent" />
                npx convex dev · synced 2.4s ago
              </span>
              <span>0 errors · 0 warnings</span>
            </div>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-6 rounded-full border border-rule bg-paper px-8 py-6">
          <span className="eyebrow text-muted">BUILT WITH</span>
          {[
            "TypeScript 5.6",
            "Next.js 16",
            "Convex",
            "Tailwind 4",
            "React 19",
            "Vercel Edge",
          ].map((b, i, arr) => (
            <span key={b} className="contents">
              <span className="text-[14px] font-semibold tracking-[-0.01em]">
                {b}
              </span>
              {i < arr.length - 1 && (
                <span className="text-ink/30">·</span>
              )}
            </span>
          ))}
          <span className="text-ink/30">·</span>
          <span className="eyebrow text-accent">DEPLOY ANYWHERE</span>
        </div>
      </div>
    </section>
  );
}

function Callout({
  num,
  title,
  dark,
  children,
}: {
  num: string;
  title: string;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex min-h-[200px] flex-col gap-3.5 p-8",
        dark ? "bg-ink text-paper" : "bg-paper",
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
      <div className="mt-auto" />
    </div>
  );
}

type ChipDef =
  | string
  | { label: string; accent?: boolean; solid?: boolean };

function Chips({ chips }: { chips: ChipDef[] }) {
  return (
    <div className="mt-auto flex flex-wrap items-center gap-2 font-mono text-[11px]">
      {chips.map((c, i) => {
        const def = typeof c === "string" ? { label: c } : c;
        return (
          <span
            key={i}
            className={cn(
              "rounded-full border px-2.5 py-1",
              def.accent && "border-accent bg-accent text-white",
              def.solid && "border-paper bg-paper text-ink",
              !def.accent && !def.solid && "border-rule-2 bg-paper-2 text-ink",
            )}
          >
            {def.label}
          </span>
        );
      })}
    </div>
  );
}

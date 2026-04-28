const stack = [
  "TypeScript",
  "Next.js 16",
  "React 19",
  "Convex",
  "Tailwind 4",
  "Vercel Edge",
  "Atlas AI",
];

export function LogoStrip() {
  return (
    <div className="mt-16 border-y border-rule py-12">
      <div className="mx-auto max-w-[1320px] px-8">
        <div className="grid items-center gap-10 md:grid-cols-[200px_1fr]">
          <div className="eyebrow max-w-[180px] leading-snug text-muted">
            Open beta — built on
            <br />
            modern, type-safe primitives
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
            {stack.map((name) => (
              <span
                key={name}
                className="inline-flex items-center gap-2 text-[20px] font-bold tracking-[-0.04em] text-ink/55"
              >
                <span className="size-[18px] rounded-[4px] bg-ink/70" />
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

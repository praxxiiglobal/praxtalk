const metrics = [
  {
    n: "6",
    accent: "",
    label: "Atlas sub-agents working as one conversation — Resolver, Copilot, Routing, KB, Channel and Outcomes.",
  },
  {
    n: "104",
    accent: "",
    label: "Languages reasoned in by Atlas, including RTL and CJK scripts.",
  },
  {
    n: "<50",
    accent: "KB",
    label: "Widget bundle target — Lighthouse 99+ on a 4G connection.",
  },
  {
    n: "$0.04",
    accent: "",
    label: "Target cost per AI resolution at scale — vs. $0.99/res on Intercom Fin.",
  },
];

export function Metrics() {
  return (
    <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
      <div className="mt-16 grid grid-cols-1 gap-px overflow-hidden rounded-3xl border border-rule bg-rule sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((m, i) => (
          <div key={i} className="bg-paper p-8">
            <div className="text-[56px] font-semibold leading-none tracking-[-0.045em]">
              {m.n}
              {m.accent && <span className="text-accent">{m.accent}</span>}
            </div>
            <div className="mt-2 text-[13px] leading-[1.4] text-muted">
              {m.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

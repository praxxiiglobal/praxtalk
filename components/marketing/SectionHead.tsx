export function SectionHead({
  number,
  label,
  children,
  description,
}: {
  number: string;
  label: string;
  children: React.ReactNode;
  description: React.ReactNode;
}) {
  return (
    <div className="mb-16 grid items-end gap-16 md:grid-cols-[1fr_1.6fr]">
      <div>
        <div className="eyebrow text-muted">
          {number} — {label}
        </div>
      </div>
      <div>
        <h2 className="mt-3.5 text-[clamp(40px,5vw,72px)] font-semibold leading-[0.95] tracking-[-0.035em]">
          {children}
        </h2>
        <p className="mt-0 max-w-[520px] text-[17px] leading-[1.5] text-muted">
          {description}
        </p>
      </div>
    </div>
  );
}

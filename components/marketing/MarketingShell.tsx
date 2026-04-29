import type { ReactNode } from "react";
import { Footer } from "./Footer";
import { Nav } from "./Nav";

/**
 * Shell for non-homepage marketing pages (/docs, /about, /security, …).
 * Renders the same Nav + Footer as the homepage, plus a centred page
 * header and a max-width content area.
 */
export function MarketingShell({
  title,
  eyebrow,
  description,
  children,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className="relative pb-[80px] pt-[60px]">
        <div className="mx-auto max-w-[860px] px-4 sm:px-8">
          {eyebrow ? (
            <div className="eyebrow mb-4 inline-flex items-center gap-2 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              {eyebrow}
            </div>
          ) : null}
          <h1 className="m-0 text-[clamp(40px,5.5vw,72px)] font-semibold leading-[1.02] tracking-[-0.035em]">
            {title}
          </h1>
          {description ? (
            <p className="mt-5 max-w-[58ch] text-[18px] leading-[1.5] text-muted">
              {description}
            </p>
          ) : null}
          <div className="mt-12">{children}</div>
        </div>
      </main>
      <Footer />
    </>
  );
}

export function Section({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="border-t border-rule pt-12 first:border-t-0 first:pt-0 last:pb-0"
    >
      <div className="mb-6">
        <h2 className="m-0 text-[28px] font-semibold tracking-[-0.02em] text-ink">
          {title}
        </h2>
        {description ? (
          <p className="mt-2 max-w-[60ch] text-[15px] leading-[1.55] text-muted">
            {description}
          </p>
        ) : null}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function Prose({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-4 text-[15px] leading-[1.65] text-ink/85 [&_a]:text-ink [&_a]:underline-offset-2 hover:[&_a]:underline [&_code]:rounded [&_code]:bg-paper-2 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[13.5px] [&_h3]:mt-8 [&_h3]:text-[18px] [&_h3]:font-semibold [&_h3]:text-ink [&_li]:my-1 [&_pre]:overflow-x-auto [&_pre]:rounded-xl [&_pre]:border [&_pre]:border-rule [&_pre]:bg-paper-2 [&_pre]:p-4 [&_pre]:font-mono [&_pre]:text-[12.5px] [&_pre]:leading-[1.55] [&_pre]:text-ink [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
      {children}
    </div>
  );
}

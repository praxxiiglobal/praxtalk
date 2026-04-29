import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <header className="border-b border-rule px-4 py-6 sm:px-8 sm:py-8">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="m-0 text-[28px] font-semibold tracking-[-0.02em] text-ink sm:text-[32px]">
            {title}
          </h1>
          {description ? (
            <p className="mt-2 max-w-[60ch] text-sm leading-[1.55] text-muted">
              {description}
            </p>
          ) : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

export function PageBody({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 py-8 sm:px-8 sm:py-10">
      <div className="mx-auto flex max-w-[1080px] flex-col gap-8">{children}</div>
    </div>
  );
}

export function Card({
  title,
  description,
  children,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-rule bg-paper p-5 sm:p-6">
      {title ? (
        <header className="mb-4">
          <h2 className="m-0 text-base font-semibold tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-sm leading-[1.55] text-muted">
              {description}
            </p>
          ) : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

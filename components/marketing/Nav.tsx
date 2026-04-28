import Link from "next/link";
import { Mark } from "./Mark";

const links = [
  { href: "#product", label: "Product", caret: true },
  { href: "#ai", label: "AI Suite", caret: true },
  { href: "#compare", label: "Why Prax" },
  { href: "#integrations", label: "Integrations" },
  { href: "#pricing", label: "Pricing" },
  { href: "#docs", label: "Docs" },
];

export function Nav() {
  return (
    <nav className="sticky top-0 z-50 border-b border-rule bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-10 px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-semibold tracking-tight text-ink"
        >
          <Mark className="text-ink" />
          <span>PraxTalk</span>
        </Link>

        <div className="hidden items-center gap-7 text-sm md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="inline-flex items-center gap-1 text-ink/85 transition hover:text-ink"
            >
              {l.label}
              {l.caret && <span className="text-[9px] opacity-60">▾</span>}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="#login"
            className="eyebrow hidden rounded-full border border-rule-2 px-2.5 py-1.5 sm:inline-flex"
          >
            Sign in
          </Link>
          <Link
            href="#demo"
            className="hidden h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px sm:inline-flex"
          >
            Book demo
          </Link>
          <Link
            href="#start"
            className="group inline-flex h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px hover:bg-black"
          >
            Start free
            <span aria-hidden className="transition group-hover:translate-x-0.5">
              →
            </span>
          </Link>
        </div>
      </div>
    </nav>
  );
}

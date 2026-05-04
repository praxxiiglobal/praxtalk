import Link from "next/link";

/**
 * Trust strip — replaces the old "built on TypeScript / Next.js / etc"
 * dev-stack list (which doesn't help a buyer evaluate a chat tool).
 * Each item links to a page that backs up the claim.
 *
 * When real customer logos exist, swap this for a logo grid and move
 * these trust items into the hero strip.
 */
const items = [
  {
    headline: "100%",
    sub: "uptime · last 90 days",
    href: "/status",
  },
  {
    headline: "Open beta",
    sub: "free until v1.0",
    href: "/pricing",
  },
  {
    headline: "Ship weekly",
    sub: "see the changelog",
    href: "/changelog",
  },
  {
    headline: "Atlas live",
    sub: "AI that resolves end to end",
    href: "/product",
  },
  {
    headline: "We use it",
    sub: "on praxtalk.com itself",
    href: "/customers",
  },
];

export function LogoStrip() {
  return (
    <div className="mt-16 border-y border-rule py-10">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <div className="grid items-center gap-y-8 md:grid-cols-[200px_1fr] md:gap-x-10">
          <div className="eyebrow max-w-[200px] leading-snug text-muted">
            Open beta — straight talk
            <br />
            instead of placeholder logos
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {items.map((item) => (
              <Link
                key={item.headline}
                href={item.href}
                className="group flex flex-col gap-0.5 transition"
              >
                <span className="text-[20px] font-semibold tracking-[-0.02em] text-ink transition group-hover:text-accent">
                  {item.headline}
                </span>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                  {item.sub}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

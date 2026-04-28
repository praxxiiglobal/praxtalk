import Link from "next/link";
import { Mark } from "./Mark";

const cols: Array<{ title: string; links: { label: string; href: string }[] }> = [
  {
    title: "Product",
    links: [
      { label: "Live chat", href: "#" },
      { label: "Atlas AI", href: "#ai" },
      { label: "Help center", href: "#" },
      { label: "Voice & phone", href: "#" },
      { label: "WhatsApp", href: "#" },
      { label: "What's new", href: "#" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "vs. Intercom", href: "#" },
      { label: "vs. Crisp", href: "#" },
      { label: "vs. LiveChat", href: "#" },
      { label: "vs. Drift", href: "#" },
      { label: "vs. HubSpot Chat", href: "#" },
      { label: "vs. Tawk.to", href: "#" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "#" },
      { label: "Agent SDK", href: "#" },
      { label: "REST API", href: "#" },
      { label: "Webhooks", href: "#" },
      { label: "Status", href: "#" },
      { label: "Changelog", href: "#" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Praxxii", href: "#" },
      { label: "Customers", href: "#" },
      { label: "Careers", href: "#" },
      { label: "Press kit", href: "#" },
      { label: "Security", href: "#" },
      { label: "Contact", href: "mailto:hello@praxtalk.com" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="mt-[120px] border-t border-rule pb-10 pt-20">
      <div className="mx-auto max-w-[1320px] px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-[1.6fr_repeat(4,1fr)]">
          <div>
            <Link
              href="/"
              className="flex items-center gap-2.5 font-semibold tracking-tight text-ink"
            >
              <Mark className="text-ink" />
              <span>PraxTalk</span>
            </Link>
            <p className="my-3.5 max-w-[30ch] text-sm leading-[1.5] text-muted">
              The AI-native customer messaging platform. One inbox. Six
              agents. Zero hand-offs.
            </p>
            <div className="font-mono text-[11px] tracking-[0.06em] text-muted">
              A product of <b className="font-semibold text-ink">Praxxii Global</b>
            </div>
          </div>

          {cols.map((c) => (
            <div key={c.title}>
              <h5 className="m-0 mb-4 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted">
                {c.title}
              </h5>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-sm">
                {c.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      className="opacity-85 transition hover:text-accent hover:opacity-100"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 flex flex-wrap justify-between gap-4 border-t border-rule pt-6 font-mono text-[11px] tracking-[0.04em] text-muted">
          <span>© 2026 Praxxii Global · All rights reserved.</span>
          <span>
            praxtalk.com ·{" "}
            <a href="mailto:hello@praxtalk.com" className="hover:text-accent">
              hello@praxtalk.com
            </a>
          </span>
          <span>GDPR ready · SOC 2 Type II in progress</span>
        </div>
      </div>
    </footer>
  );
}

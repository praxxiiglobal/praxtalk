import Link from "next/link";

const cols: Array<{ title: string; links: { label: string; href: string }[] }> = [
  {
    title: "Product",
    links: [
      { label: "Live chat", href: "/#product" },
      { label: "Atlas AI", href: "/#ai" },
      { label: "Help center", href: "/docs" },
      { label: "Voice & phone", href: "/#product" },
      { label: "WhatsApp", href: "/#integrations" },
      { label: "What's new", href: "/changelog" },
    ],
  },
  {
    title: "Compare",
    links: [
      { label: "vs. Intercom", href: "/#compare" },
      { label: "vs. Crisp", href: "/#compare" },
      { label: "vs. LiveChat", href: "/#compare" },
      { label: "vs. Drift", href: "/#compare" },
      { label: "vs. HubSpot Chat", href: "/#compare" },
      { label: "vs. Tawk.to", href: "/#compare" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "Agent SDK", href: "/docs#sdk" },
      { label: "REST API", href: "/docs#api" },
      { label: "Webhooks", href: "/docs#webhooks" },
      { label: "Status", href: "/status" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Praxxii", href: "/about" },
      { label: "Customers", href: "/customers" },
      { label: "Careers", href: "/careers" },
      { label: "Press kit", href: "/press" },
      { label: "Security", href: "/security" },
      { label: "Contact", href: "mailto:hello@praxtalk.com" },
    ],
  },
];

const socials: { label: string; href: string; icon: SocialIconName }[] = [
  { label: "Facebook", href: "#", icon: "facebook" },
  { label: "Instagram", href: "#", icon: "instagram" },
  { label: "X", href: "#", icon: "x" },
  { label: "LinkedIn", href: "#", icon: "linkedin" },
  { label: "YouTube", href: "#", icon: "youtube" },
];

export function Footer() {
  return (
    <footer className="mt-[120px] border-t border-rule pb-10 pt-20">
      <div className="mx-auto max-w-[1320px] px-4 sm:px-8">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 lg:grid-cols-[repeat(5,minmax(0,1fr))]">
          <div className="flex h-full flex-col items-start">
            <Link
              href="/"
              className="text-2xl font-semibold tracking-tight text-ink transition hover:text-accent"
            >
              Prax<span className="text-accent">Talk</span>
            </Link>
            <p className="mt-3 max-w-[32ch] text-sm leading-[1.55] text-muted">
              The AI-native customer messaging platform. One inbox. Six agents.
              Zero hand-offs.
            </p>
            <div className="mt-3 flex items-center gap-2 text-sm">
              <span aria-hidden>🇮🇳</span>
              <a
                href="tel:+919084732432"
                className="text-ink transition hover:text-accent"
              >
                +91-9084732432
              </a>
            </div>
            <a
              href="mailto:hello@praxtalk.com"
              className="mt-1 text-sm text-ink transition hover:text-accent"
            >
              hello@praxtalk.com
            </a>
            <div className="mt-3 flex items-center gap-2">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="inline-flex size-8 items-center justify-center rounded-full border border-rule-2 bg-paper text-ink transition hover:-translate-y-px hover:border-ink hover:text-accent"
                >
                  <SocialIcon name={s.icon} />
                </a>
              ))}
            </div>
            <div className="mt-auto pt-4 font-mono text-[11px] tracking-[0.06em] text-muted">
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

type SocialIconName = "facebook" | "instagram" | "x" | "linkedin" | "youtube";

function SocialIcon({ name }: { name: SocialIconName }) {
  const common = { width: 16, height: 16, fill: "currentColor" } as const;
  switch (name) {
    case "facebook":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M13.5 21v-7.5h2.55l.4-3h-2.95V8.55c0-.86.24-1.45 1.48-1.45H16.6V4.42c-.27-.04-1.18-.12-2.24-.12-2.22 0-3.74 1.36-3.74 3.85V10.5H8v3h2.62V21h2.88z" />
        </svg>
      );
    case "instagram":
      return (
        <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden>
          <rect
            x="3"
            y="3"
            width="18"
            height="18"
            rx="5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle
            cx="12"
            cy="12"
            r="3.6"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <circle cx="17.3" cy="6.7" r="1.05" fill="currentColor" />
        </svg>
      );
    case "x":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
        </svg>
      );
    case "linkedin":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5zM.22 8h4.56v15H.22V8zm7.6 0h4.37v2.05h.06c.61-1.15 2.09-2.36 4.3-2.36 4.6 0 5.45 3.03 5.45 6.97V23h-4.56v-7.46c0-1.78-.03-4.07-2.48-4.07-2.48 0-2.86 1.94-2.86 3.94V23H7.82V8z" />
        </svg>
      );
    case "youtube":
      return (
        <svg viewBox="0 0 24 24" {...common} aria-hidden>
          <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8A3 3 0 0 0 2.6 19.9c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1c.5-1.9.5-5.8.5-5.8s0-3.9-.5-5.8zM9.5 15.6V8.4L15.8 12l-6.3 3.6z" />
        </svg>
      );
  }
}

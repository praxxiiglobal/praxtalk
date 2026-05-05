import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Inter_Tight, JetBrains_Mono, Instrument_Serif } from "next/font/google";
import { CookieConsent } from "@/components/marketing/CookieConsent";
import "./globals.css";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500"],
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "PraxTalk — Conversations that close themselves",
  description:
    "PraxTalk is the AI-native customer messaging platform. One inbox for live chat, email, WhatsApp, voice and in-app — with Atlas, an autonomous agent that resolves conversations end to end.",
  metadataBase: new URL("https://www.praxtalk.com"),
  // NO global alternates.canonical here — it would override every
  // page's own canonical and de-index secondary routes. Each
  // page.tsx sets its own alternates.canonical (and openGraph.url
  // for social shares).
  openGraph: {
    title: "PraxTalk — Conversations that close themselves",
    description:
      "AI-native customer messaging. Six agents. One inbox. Zero hand-offs.",
    siteName: "PraxTalk",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "PraxTalk — Conversations that close themselves",
    description:
      "AI-native customer messaging. One inbox for chat, email, WhatsApp, voice and in-app — Atlas resolves the rest.",
  },
  appleWebApp: {
    capable: true,
    title: "PraxTalk",
    statusBarStyle: "default",
  },
  // Tell crawlers we're indexable; the manifest covers the rest.
  robots: { index: true, follow: true },
};

// themeColor moved to the viewport export per Next.js 14+ guidance.
export const viewport: Viewport = {
  themeColor: "#0F1A12",
  width: "device-width",
  initialScale: 1,
};

/**
 * Structured data for Google + AI search engines. Organization +
 * WebSite + SoftwareApplication is the standard SaaS triple — see
 * Q-03 in 2026-05-03 audit.
 */
const structuredData = [
  {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "PraxTalk",
    url: "https://www.praxtalk.com",
    logo: "https://www.praxtalk.com/praxtalk-logo.png",
    sameAs: ["https://github.com/praxxiiglobal/praxtalk"],
    contactPoint: [
      {
        "@type": "ContactPoint",
        email: "hello@praxtalk.com",
        contactType: "customer support",
        availableLanguage: ["English"],
      },
    ],
  },
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "PraxTalk",
    url: "https://www.praxtalk.com",
    potentialAction: {
      "@type": "SearchAction",
      target: "https://www.praxtalk.com/docs?q={search_term_string}",
      "query-input": "required name=search_term_string",
    },
  },
  {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "PraxTalk",
    operatingSystem: "Web",
    applicationCategory: "BusinessApplication",
    description:
      "AI-native customer messaging — one inbox for chat, email, WhatsApp, voice and in-app.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Pull the per-request nonce middleware.ts attached, so we can
  // gate our two own inline scripts (JSON-LD blob + GA gtag-init)
  // through CSP. Without this, both get blocked.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      className={`${interTight.variable} ${jetbrainsMono.variable} ${instrumentSerif.variable} antialiased`}
    >
      <body className="paper-grain min-h-screen bg-paper text-ink font-sans">
        {/* CookieConsent gates Google Analytics on opt-in; gtag.js
            is only injected after the visitor accepts. The banner
            renders on first visit and writes the decision to
            localStorage; /privacy exposes the same controls so the
            decision can be revoked later. */}
        <CookieConsent nonce={nonce} />
        {/* WCAG 2.1 AA — skip link for keyboard / screen-reader users.
            Visually hidden until focused. Marketing pages should
            wrap their main content in <main id="main">. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[2147483647] focus:rounded-md focus:bg-ink focus:px-3 focus:py-2 focus:text-sm focus:text-paper focus:outline-none"
        >
          Skip to main content
        </a>
        {/* JSON-LD structured data — needs the per-request nonce
            because the inline body is blocked by the strict CSP. */}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
        {children}
      </body>
    </html>
  );
}

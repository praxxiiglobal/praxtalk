/**
 * Re-compute the sha256 hashes that next.config.ts pins for our two
 * inline scripts. Run with:
 *
 *   node scripts/compute-csp-hashes.mjs
 *
 * If you edit the JSON-LD blob in app/layout.tsx or the gtag-init
 * template in components/marketing/CookieConsent.tsx, re-run this
 * and paste the new hashes into INLINE_SCRIPT_HASHES in
 * next.config.ts. CSP report-uri /api/csp-report will surface a
 * mismatch immediately — you'll see the rejected hash in the
 * `script-sample` field of the violation report and you can paste
 * that exact hash back into the config.
 *
 * NB: byte-identity matters — the leading newline + indentation in
 * gtagInit below must mirror the actual JSX `__html` payload.
 */

import { createHash } from "node:crypto";

// Mirrors the const in app/layout.tsx. KEEP IN SYNC.
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

const jsonLd = JSON.stringify(structuredData);

// Mirrors GA_MEASUREMENT_ID in components/marketing/CookieConsent.tsx.
const GA = "G-LSQHM1LCTE";

// Mirrors the dangerouslySetInnerHTML payload in CookieConsent.tsx.
// KEEP BYTE-IDENTICAL.
const gtagInit = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA}', { anonymize_ip: true });
`;

function sha256base64(s) {
  return createHash("sha256").update(s, "utf8").digest("base64");
}

console.log(`'sha256-${sha256base64(jsonLd)}'   // JSON-LD (app/layout.tsx)`);
console.log(`'sha256-${sha256base64(gtagInit)}'   // gtag-init (CookieConsent.tsx)`);

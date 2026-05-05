import { NextResponse, type NextRequest } from "next/server";

/**
 * Strip framework / platform fingerprint headers on the way out.
 * Audit S-13 (2026-05-03): server / x-vercel-id / x-nextjs-* leak
 * the stack to scanners and let attackers correlate against
 * published CVEs without probing.
 *
 * next.config.ts already drops poweredByHeader, but the Vercel
 * edge layer adds its own headers AFTER Next, so we need a
 * middleware response transform to scrub them.
 */
const STRIP_HEADERS = [
  "server",
  "x-vercel-id",
  "x-vercel-cache",
  "x-vercel-execution-region",
  "x-nextjs-prerender",
  "x-nextjs-stale-time",
  "x-nextjs-matched-path",
  "x-matched-path",
  "x-powered-by",
];

const isDev = process.env.NODE_ENV === "development";

/**
 * Per-request CSP with a fresh nonce. Migrating away from the
 * 'unsafe-inline' policy in next.config.ts — Next.js auto-attaches
 * the nonce to its own framework scripts (and to any <Script>
 * component that reads `headers().get('x-nonce')` and passes it via
 * the nonce prop).
 *
 * Trade-off: any page that reads `headers()` becomes dynamically
 * rendered. We're already rendering the dashboard + admin dynamically
 * (cookie auth in layouts), and marketing pages were already importing
 * CookieConsent which puts them on the dynamic path too. Net cost is
 * minimal — Vercel's edge cache still serves repeat hits within
 * milliseconds.
 *
 * Dev keeps 'unsafe-eval' because React DevTools uses eval() for
 * server-error stack reconstruction.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""} https://*.vercel-scripts.com https://www.googletagmanager.com`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://ipinfo.io https://ipapi.co https://*.vercel-insights.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
    "report-uri /api/csp-report",
  ].join("; ");
}

export function middleware(req: NextRequest) {
  // Skip the prefetch path that next/link uses — they don't render
  // the page, so they don't need a unique nonce, and serving CSP
  // there inflates cache misses on the edge.
  const isPrefetch =
    req.headers.get("next-router-prefetch") === "1" ||
    req.headers.get("purpose") === "prefetch";

  const nonce = isPrefetch
    ? ""
    : Buffer.from(crypto.randomUUID()).toString("base64");

  const requestHeaders = new Headers(req.headers);
  if (nonce) requestHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (nonce) res.headers.set("Content-Security-Policy", buildCsp(nonce));
  for (const h of STRIP_HEADERS) res.headers.delete(h);
  return res;
}

// Run on every route except Next internals + static assets — those
// don't carry sensitive headers and skipping them avoids paying the
// middleware cost on every image / font fetch.
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon|apple-icon|manifest.webmanifest|robots.txt|sitemap.xml|sw.js|praxtalk-logo.png).*)",
  ],
};

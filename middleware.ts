import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request CSP with a fresh nonce + framework fingerprint scrub.
 *
 * Why nonce instead of hash: Next.js emits per-page inline bootstrap
 * scripts at runtime, with hashes we can't enumerate statically (we
 * tried this in 3cc37d7 and it broke prod — Next's own scripts were
 * blocked, hydration died, dashboard live queries hung). Per-request
 * nonces sidestep that — Next auto-attaches the nonce to its
 * bootstrap scripts when it sees the x-nonce request header.
 *
 * Trade-off: any page that reads `headers()` becomes dynamically
 * rendered. The dashboard + admin were already dynamic (cookie auth),
 * marketing pages were already on the dynamic path via CookieConsent.
 * Vercel's edge cache still serves repeat hits within milliseconds.
 *
 * Dev keeps 'unsafe-eval' because React DevTools uses eval() for
 * server-error stack reconstruction.
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
  // Skip prefetches — they don't render and forcing a unique nonce
  // there inflates edge cache misses.
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

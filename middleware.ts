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
 *
 * CSP lives in next.config.ts (static, hash-allowlist for the two
 * inline scripts we control — see scripts/compute-csp-hashes.mjs).
 * We tried per-request nonce here and it killed marketing-page
 * static caching (every response stamped private/no-cache, TTFB
 * regressed 500-900ms). The static-hash policy keeps `unsafe-inline`
 * out without forcing dynamic rendering.
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

export function middleware(_req: NextRequest) {
  const res = NextResponse.next();
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

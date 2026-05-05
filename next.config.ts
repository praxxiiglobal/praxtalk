import type { NextConfig } from "next";
import path from "node:path";

/**
 * Strict security headers applied to every HTML response. CSP is now
 * enforced (no longer report-only). Violations still hit /api/csp-report
 * via report-uri so we get visibility into anything that breaks; if
 * something legitimate gets blocked, broaden the directive and ship.
 *
 * Audit refs: S-04, S-10, S-13 (2026-05-03 audit). Strips the
 * Access-Control-Allow-Origin: * default from HTML and removes the
 * x-powered-by leak.
 */
const SECURITY_HEADERS = [
  // Defense-in-depth alongside CSP frame-ancestors below.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value:
      "camera=(), microphone=(), geolocation=(self), payment=(), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  // HSTS — 2-year max-age, includeSubDomains, preload-eligible. Every
  // subdomain we currently use (app/api are co-located on praxtalk.com,
  // assets pull from Vercel's CDN over HTTPS, Convex is on
  // *.convex.cloud which is HTTPS-only) is reachable over HTTPS, so
  // we can include subdomains without bricking anything. Submit to
  // hstspreload.org once this header lands in production.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

/**
 * CSP — static, with 'unsafe-inline' allowed for script-src.
 *
 * We tried hash-based pinning (commit 3cc37d7) but Next.js emits
 * its own per-page inline bootstrap scripts at runtime that we
 * can't enumerate statically — every one of them was rejected by
 * the browser and hydration died, breaking dashboard live queries.
 *
 * The proper hardening is per-request nonce in middleware (which
 * Next.js auto-attaches to its bootstrap scripts when it sees the
 * x-nonce request header), at the cost of forcing dynamic
 * rendering on every HTML response. That's a separate commit when
 * we're ready to accept the TTFB cost.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com https://www.googletagmanager.com",
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

const nextConfig: NextConfig = {
  // Pin Turbopack root to this project so the warning about
  // multiple lockfiles in the home directory goes away.
  turbopack: {
    root: path.resolve(__dirname),
  },

  // Strip Next.js's default x-powered-by header — discloses the
  // framework to scanners. (Vercel still adds its own server header;
  // strip those at the platform layer if needed — they can't be
  // overridden from a Next.js app config.)
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Apply strict headers to every page response.
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
      {
        // Widget script is meant to be embedded cross-origin —
        // explicit CORS + CORP override on this one route only.
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cross-Origin-Resource-Policy", value: "cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;

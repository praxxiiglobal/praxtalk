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
  // Strict-Transport-Security: includeSubDomains + preload added once
  // every subdomain (app, api, status) is HTTPS-only — see audit S-07.
  // For now the existing 2-year max-age stays as the platform default.
];

const CSP = [
  "default-src 'self'",
  // Next.js inlines a small bootstrap script per page; 'unsafe-inline'
  // covers it. Vercel scripts include analytics + insights. Google
  // Analytics gtag.js loads from googletagmanager.com.
  "script-src 'self' 'unsafe-inline' https://*.vercel-scripts.com https://www.googletagmanager.com",
  // Google Fonts (Roboto) loads CSS from fonts.googleapis.com and the
  // actual woff2 files from fonts.gstatic.com. Both must be allowed
  // explicitly or the dashboard renders in fallback fonts and the
  // console fills with 50+ CSP errors per page load.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Convex subdomains for the live socket + REST. ipinfo/ipapi for the
  // widget's geo lookup. GA beacon endpoints (google-analytics.com +
  // analytics.google.com + googletagmanager.com) for outbound events.
  // Razorpay/PayPal callbacks land at our own backend so don't need
  // outbound entries.
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://ipinfo.io https://ipapi.co https://*.vercel-insights.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
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

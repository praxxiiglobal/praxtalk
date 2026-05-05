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

/**
 * Defense-in-depth auth gate for /app and /admin. Each layout
 * already does its own check, but a missed page (or a future route
 * added without re-reading the SessionGuard pattern) would expose
 * data. This middleware redirects to /login if the session cookie
 * is absent — it deliberately does NOT call Convex (Edge runtime
 * can't), so it's a presence check only. Real validation still
 * happens in the layout with `api.auth.me`.
 */
const SESSION_COOKIE_PROD = "__Host-praxtalk_session";
const SESSION_COOKIE_DEV = "praxtalk_session";

function hasSessionCookie(req: NextRequest): boolean {
  // Match the dev-vs-prod cookie name picked in lib/session.ts.
  // `__Host-` cookies require HTTPS so dev (next dev over HTTP)
  // uses the unprefixed name. Both checks here keep the middleware
  // single-binary across environments.
  return Boolean(
    req.cookies.get(SESSION_COOKIE_PROD)?.value ||
      req.cookies.get(SESSION_COOKIE_DEV)?.value,
  );
}

function isAuthGatedPath(pathname: string): boolean {
  if (pathname === "/app" || pathname.startsWith("/app/")) return true;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return true;
  return false;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Cookie presence gate (defense-in-depth). Does NOT short-circuit
  // for prefetches because Next.js fires prefetches without cookies
  // sometimes — letting the layout handle that case keeps behaviour
  // identical to current.
  if (isAuthGatedPath(pathname) && !hasSessionCookie(req)) {
    const target = pathname.startsWith("/admin")
      ? `/login?next=${encodeURIComponent(pathname)}`
      : "/login";
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    void target; // referenced for clarity above; final URL set on the cloned NextURL.
    return NextResponse.redirect(url);
  }

  // CSP nonce is generated for EVERY request — even prefetches and
  // never-rendered ones. Skipping prefetches was an early caching
  // optimisation, but it relied on Next.js never serving a
  // prefetched response as a render. The nonce is cheap to compute,
  // and the alternative (a prefetch promoted to render with no CSP)
  // is a real defence-in-depth gap.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("Content-Security-Policy", buildCsp(nonce));
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

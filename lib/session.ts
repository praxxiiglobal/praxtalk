import "server-only";
import { cookies } from "next/headers";

/**
 * Session cookie naming + flags hardened per audit:
 *   - `__Host-` prefix anchors the cookie to the exact origin (no
 *     Domain attribute, must be Secure, must have Path=/). Stops a
 *     subdomain takeover on `*.praxtalk.com` from receiving the
 *     dashboard cookie.
 *   - `sameSite: "strict"` blocks cross-site GET-link CSRF entirely
 *     (the dashboard never needs to be linked into mid-flow; Convex
 *     auth happens client-side over WebSocket anyway).
 *
 * Local development falls back to the unprefixed name because
 * `__Host-` requires Secure + HTTPS, which `next dev` doesn't serve
 * by default. Production / Vercel always uses the prefixed form.
 *
 * The transitional fallback that read the legacy `praxtalk_session`
 * cookie was removed once everyone had re-cookied — anyone still
 * carrying the legacy cookie now gets bounced to /login (one-time
 * re-login, then they're on the prefixed cookie permanently).
 */
const isProd = process.env.NODE_ENV === "production";
export const SESSION_COOKIE = isProd
  ? "__Host-praxtalk_session"
  : "praxtalk_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  // Defensively also clear the legacy name in prod, in case any
  // browser still carries it from before the rename.
  if (isProd) store.delete("praxtalk_session");
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value;
}

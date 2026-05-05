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
 * Migration note: switching the cookie name invalidates every active
 * dashboard session on first deploy — operators land on /login. This
 * is intentional (it's the audit-mandated forced-rotation that comes
 * with hardening cookie flags) and was acknowledged by the owner.
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
  // Also clear the legacy unprefixed name so a deploy that flipped to
  // the __Host- prefix doesn't leave a stale cookie around.
  if (isProd) store.delete("praxtalk_session");
}

export async function readSessionToken(): Promise<string | undefined> {
  const store = await cookies();
  return (
    store.get(SESSION_COOKIE)?.value ??
    // Fall back to the legacy name for one deploy cycle so already-
    // signed-in operators don't get bounced the moment this lands.
    // Remove this fallback in the next release once everyone's
    // re-cookied.
    (isProd ? store.get("praxtalk_session")?.value : undefined)
  );
}

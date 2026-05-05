import "server-only";

/**
 * Cloudflare Turnstile verification. The signup form mounts the
 * Turnstile widget when NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, the
 * widget produces a `cf-turnstile-response` form field, and this
 * helper verifies it on the server before letting the signup
 * through.
 *
 * Env vars:
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY — public site key (rendered in
 *     the form's data-sitekey).
 *   TURNSTILE_SECRET_KEY — server-only secret used here for
 *     siteverify. NEVER expose to the client.
 *
 * Returns:
 *   { ok: true }                    — token verified or feature not
 *                                     enabled (no env keys set).
 *   { ok: false, reason: string }   — token rejected.
 */
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(args: {
  token: string | null | undefined;
  remoteIp?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    // Feature not enabled — let the request through. The server
    // action and middleware are still doing their other checks.
    return { ok: true };
  }
  if (!args.token) return { ok: false, reason: "Missing Turnstile token." };

  const body = new URLSearchParams();
  body.set("secret", secret);
  body.set("response", args.token);
  if (args.remoteIp) body.set("remoteip", args.remoteIp);

  let res: Response;
  try {
    res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      // 5s ceiling — Turnstile's siteverify is reliable but if
      // Cloudflare is down we'd rather fail-closed than hang.
      signal: AbortSignal.timeout(5_000),
    });
  } catch {
    return { ok: false, reason: "Turnstile verifier unreachable." };
  }
  if (!res.ok) {
    return { ok: false, reason: `Turnstile verifier HTTP ${res.status}` };
  }

  const data = (await res.json()) as {
    success?: boolean;
    "error-codes"?: string[];
  };
  if (!data.success) {
    const codes = (data["error-codes"] ?? []).join(", ");
    return {
      ok: false,
      reason: codes ? `Turnstile rejected (${codes})` : "Turnstile rejected.",
    };
  }
  return { ok: true };
}

export function turnstileSiteKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  return key && key.length > 0 ? key : undefined;
}

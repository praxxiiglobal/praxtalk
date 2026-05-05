/**
 * Platform-level transactional email — used for things that happen
 * BEFORE a workspace exists (signup verification today; account
 * recovery, cross-workspace billing notices later). Distinct from
 * the per-workspace `emailIntegrations` rows used for password
 * resets + booking confirmations, which require an existing
 * workspace as the tenant.
 *
 * Env:
 *   PRAXTALK_RESEND_API_KEY — Resend API key (server-only).
 *   PRAXTALK_FROM_EMAIL     — fully-qualified From address. Domain
 *                             must be verified in Resend. Defaults
 *                             to "no-reply@praxtalk.com".
 *
 * If PRAXTALK_RESEND_API_KEY is unset, callers should fall back to
 * the current direct-create flow (`workspaces.create`) and skip
 * verification — see app/setup/actions.ts. The boolean
 * `platformEmailEnabled()` helper exposes that decision.
 */
const RESEND_API = "https://api.resend.com/emails";

export function platformEmailEnabled(): boolean {
  return Boolean(process.env.PRAXTALK_RESEND_API_KEY);
}

export async function sendPlatformEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  const apiKey = process.env.PRAXTALK_RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: "Platform email not configured." };

  const from = process.env.PRAXTALK_FROM_EMAIL ?? "no-reply@praxtalk.com";
  const body = {
    from: `PraxTalk <${from}>`,
    to: args.to,
    subject: args.subject,
    html: args.html,
    text: args.text ?? stripHtml(args.html),
  };

  let res: Response;
  try {
    res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Resend unreachable.",
    };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return { ok: false, error: `Resend HTTP ${res.status}: ${text.slice(0, 200)}` };
  }
  const data = (await res.json()) as { id?: string };
  return { ok: true, id: data.id };
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

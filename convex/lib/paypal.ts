/**
 * PayPal Subscriptions API client. Runs in Convex's V8 runtime — no
 * Node-only deps. Fetches a fresh OAuth token per call (subscriptions
 * traffic is low; not worth a cache layer yet).
 *
 * Env vars (set with `npx convex env set`):
 *   PAYPAL_MODE          sandbox | live   (defaults to sandbox)
 *   PAYPAL_CLIENT_ID     REST app client id
 *   PAYPAL_CLIENT_SECRET REST app secret
 *   PAYPAL_WEBHOOK_ID    id of the webhook to verify against
 */

export type PayPalSubscription = {
  id: string;
  status:
    | "APPROVAL_PENDING"
    | "APPROVED"
    | "ACTIVE"
    | "SUSPENDED"
    | "CANCELLED"
    | "EXPIRED";
  plan_id: string;
  subscriber?: { payer_id?: string; email_address?: string };
  billing_info?: { next_billing_time?: string };
  links?: Array<{ href: string; rel: string; method: string }>;
};

export type WebhookHeaders = {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
};

function apiBase(): string {
  const mode = (process.env.PAYPAL_MODE ?? "sandbox").toLowerCase();
  return mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

export function isConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET,
  );
}

async function getAccessToken(): Promise<string> {
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new Error("PayPal not configured (missing CLIENT_ID/CLIENT_SECRET).");
  }
  const auth = btoa(`${id}:${secret}`);
  const res = await fetch(`${apiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    throw new Error(`PayPal OAuth failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("PayPal OAuth: no access_token.");
  return json.access_token;
}

export async function createSubscription(args: {
  planId: string;
  returnUrl: string;
  cancelUrl: string;
  customId: string; // workspaceId — round-tripped through PayPal so the
  // webhook can identify the workspace if subscriptionId lookup is empty.
}): Promise<PayPalSubscription> {
  const token = await getAccessToken();
  const res = await fetch(`${apiBase()}/v1/billing/subscriptions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      plan_id: args.planId,
      custom_id: args.customId,
      application_context: {
        brand_name: "PraxTalk",
        user_action: "SUBSCRIBE_NOW",
        return_url: args.returnUrl,
        cancel_url: args.cancelUrl,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `PayPal createSubscription failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as PayPalSubscription;
}

export async function getSubscription(
  subscriptionId: string,
): Promise<PayPalSubscription> {
  const token = await getAccessToken();
  const res = await fetch(
    `${apiBase()}/v1/billing/subscriptions/${subscriptionId}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  if (!res.ok) {
    throw new Error(
      `PayPal getSubscription failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as PayPalSubscription;
}

/**
 * Returns:
 *   "ok"        — cancelled or already terminal (404 / 422 INVALID_STATE).
 *                 Caller should flip local state to cancelled.
 *   "not_cancellable" — sub exists but PayPal refused for some other reason.
 *                 Caller should surface the error.
 */
export async function cancelSubscription(args: {
  subscriptionId: string;
  reason?: string;
}): Promise<"ok"> {
  const token = await getAccessToken();
  const res = await fetch(
    `${apiBase()}/v1/billing/subscriptions/${args.subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ reason: args.reason ?? "Cancelled from PraxTalk dashboard" }),
    },
  );
  if (res.ok || res.status === 204) return "ok";

  // Sub doesn't exist anymore — treat as already-cancelled. Happens when
  // an APPROVAL_PENDING sub timed out, or a sandbox account got purged.
  if (res.status === 404) return "ok";

  // Already in a non-cancellable terminal state (CANCELLED/EXPIRED) —
  // PayPal returns 422 SUBSCRIPTION_STATUS_INVALID. Same outcome.
  if (res.status === 422) {
    const body = await res.text();
    if (
      body.includes("SUBSCRIPTION_STATUS_INVALID") ||
      body.includes("STATUS_INVALID")
    ) {
      return "ok";
    }
    throw new Error(`PayPal cancelSubscription failed: 422 ${body}`);
  }

  throw new Error(
    `PayPal cancelSubscription failed: ${res.status} ${await res.text()}`,
  );
}

export function approveLinkOf(sub: PayPalSubscription): string | null {
  const link = sub.links?.find((l) => l.rel === "approve");
  return link?.href ?? null;
}

/**
 * Verify a webhook callback is genuinely from PayPal. Uses PayPal's
 * server-side verification endpoint — avoids implementing the cert
 * chain validation manually.
 *
 * The raw body must be the *unparsed* request body string; PayPal hashes
 * over the exact bytes it sent.
 */
export async function verifyWebhookSignature(args: {
  headers: WebhookHeaders;
  rawBody: string;
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PayPal webhook not configured (missing PAYPAL_WEBHOOK_ID).");
  }
  const token = await getAccessToken();
  // The verification endpoint expects webhook_event as a JSON object,
  // not a string. Parse the raw body (PayPal hashed the *bytes*, but
  // the verify API itself takes structured event JSON).
  let webhookEvent: unknown;
  try {
    webhookEvent = JSON.parse(args.rawBody);
  } catch {
    return false;
  }
  const res = await fetch(
    `${apiBase()}/v1/notifications/verify-webhook-signature`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        auth_algo: args.headers.authAlgo,
        cert_url: args.headers.certUrl,
        transmission_id: args.headers.transmissionId,
        transmission_sig: args.headers.transmissionSig,
        transmission_time: args.headers.transmissionTime,
        webhook_id: webhookId,
        webhook_event: webhookEvent,
      }),
    },
  );
  if (!res.ok) return false;
  const json = (await res.json()) as { verification_status?: string };
  return json.verification_status === "SUCCESS";
}

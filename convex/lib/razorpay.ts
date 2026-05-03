/**
 * Razorpay Subscriptions API client. Mirrors convex/lib/paypal.ts.
 * Runs in Convex's V8 runtime — no Node-only deps.
 *
 * Env vars (Convex env):
 *   RAZORPAY_KEY_ID         REST API key id (rzp_test_… / rzp_live_…)
 *   RAZORPAY_KEY_SECRET     REST API key secret
 *   RAZORPAY_WEBHOOK_SECRET HMAC secret for webhook signature verify
 */

export type RazorpaySubscription = {
  id: string;
  status:
    | "created"
    | "authenticated"
    | "active"
    | "pending"
    | "halted"
    | "cancelled"
    | "completed"
    | "expired";
  plan_id: string;
  customer_id?: string;
  short_url?: string; // hosted checkout URL — what we redirect the user to
  current_end?: number; // unix seconds
  charge_at?: number;
};

export function isConfigured(): boolean {
  return Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
  );
}

function basicAuth(): string {
  const id = process.env.RAZORPAY_KEY_ID!;
  const secret = process.env.RAZORPAY_KEY_SECRET!;
  return btoa(`${id}:${secret}`);
}

export async function createSubscription(args: {
  planId: string;
  totalCount: number; // 12 = bill 12 cycles then stop. Use a high number for "perpetual"
  callbackUrl: string;
  notes?: Record<string, string>;
}): Promise<RazorpaySubscription> {
  if (!isConfigured()) throw new Error("Razorpay not configured.");
  const res = await fetch("https://api.razorpay.com/v1/subscriptions", {
    method: "POST",
    headers: {
      authorization: `Basic ${basicAuth()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      plan_id: args.planId,
      total_count: args.totalCount,
      customer_notify: 1,
      // Razorpay returns to this URL with ?razorpay_payment_id=…&
      // razorpay_subscription_id=…&razorpay_signature=… after the
      // user completes the auth payment.
      notify_info: undefined,
      notes: args.notes,
      // The hosted-checkout URL is in the response.short_url.
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Razorpay createSubscription failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as RazorpaySubscription;
}

export async function getSubscription(
  subscriptionId: string,
): Promise<RazorpaySubscription> {
  if (!isConfigured()) throw new Error("Razorpay not configured.");
  const res = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${subscriptionId}`,
    { headers: { authorization: `Basic ${basicAuth()}` } },
  );
  if (!res.ok) {
    throw new Error(
      `Razorpay getSubscription failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as RazorpaySubscription;
}

export async function cancelSubscription(args: {
  subscriptionId: string;
  cancelAtCycleEnd?: boolean;
}): Promise<"ok"> {
  if (!isConfigured()) throw new Error("Razorpay not configured.");
  const res = await fetch(
    `https://api.razorpay.com/v1/subscriptions/${args.subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${basicAuth()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        cancel_at_cycle_end: args.cancelAtCycleEnd ? 1 : 0,
      }),
    },
  );
  // Razorpay returns 400 BAD_REQUEST_ERROR with "subscription is not in
  // a cancellable state" when the sub is already cancelled or completed —
  // treat as success so re-cancelling isn't a hard error.
  if (res.ok) return "ok";
  if (res.status === 400) {
    const body = await res.text();
    if (
      body.includes("not in a cancellable state") ||
      body.includes("already") ||
      body.includes("BAD_REQUEST_ERROR")
    ) {
      return "ok";
    }
    throw new Error(`Razorpay cancel ${res.status}: ${body}`);
  }
  throw new Error(
    `Razorpay cancel failed: ${res.status} ${await res.text()}`,
  );
}

/**
 * Verify the X-Razorpay-Signature header on an inbound webhook.
 * Razorpay signs with HMAC-SHA256 over the raw request body. Use the
 * webhook-specific secret (set in your Razorpay dashboard when you
 * register the webhook), NOT the API key secret.
 */
export async function verifyWebhookSignature(args: {
  rawBody: string;
  signature: string;
}): Promise<boolean> {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(args.rawBody));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  // Constant-time compare.
  if (expected.length !== args.signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ args.signature.charCodeAt(i);
  }
  return mismatch === 0;
}

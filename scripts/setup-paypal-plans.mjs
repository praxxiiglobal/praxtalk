#!/usr/bin/env node
/**
 * One-shot: create the PraxTalk Subscription product + Team and Scale
 * billing plans in PayPal. Prints the plan IDs you should set as
 * PAYPAL_PLAN_ID_TEAM and PAYPAL_PLAN_ID_SCALE in Convex env.
 *
 * Usage:
 *   PAYPAL_CLIENT_ID=... PAYPAL_CLIENT_SECRET=... \
 *     node scripts/setup-paypal-plans.mjs [sandbox|live]
 *
 * Defaults to sandbox. Idempotent-ish: re-running creates *new* plans
 * (PayPal won't let you delete plans, only deactivate). Run once.
 */

const mode = (process.argv[2] ?? "sandbox").toLowerCase();
const apiBase =
  mode === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";

const clientId = process.env.PAYPAL_CLIENT_ID;
const secret = process.env.PAYPAL_CLIENT_SECRET;
if (!clientId || !secret) {
  console.error(
    "Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET before running.",
  );
  process.exit(1);
}

async function token() {
  const auth = Buffer.from(`${clientId}:${secret}`).toString("base64");
  const res = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`OAuth: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

async function createProduct(t) {
  const res = await fetch(`${apiBase}/v1/catalogs/products`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${t}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "PraxTalk Subscription",
      description: "Live chat + AI agent for your website",
      type: "SERVICE",
      category: "SOFTWARE",
      home_url: "https://praxtalk.com",
    }),
  });
  if (!res.ok) {
    throw new Error(`createProduct: ${res.status} ${await res.text()}`);
  }
  return (await res.json()).id;
}

async function createPlan(t, productId, name, priceUsd) {
  const res = await fetch(`${apiBase}/v1/billing/plans`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${t}`,
      "content-type": "application/json",
      prefer: "return=representation",
    },
    body: JSON.stringify({
      product_id: productId,
      name,
      description: `${name} plan — recurring monthly`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0, // 0 = renew indefinitely
          pricing_scheme: {
            fixed_price: { value: priceUsd.toFixed(2), currency_code: "USD" },
          },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee: { value: "0", currency_code: "USD" },
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 2,
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`createPlan(${name}): ${res.status} ${await res.text()}`);
  }
  return (await res.json()).id;
}

const t = await token();
console.log(`✓ Got OAuth token (${mode})`);

const productId = await createProduct(t);
console.log(`✓ Created product: ${productId}`);

const teamId = await createPlan(t, productId, "Team", 49);
console.log(`✓ Created Team plan: ${teamId}`);

const scaleId = await createPlan(t, productId, "Scale", 199);
console.log(`✓ Created Scale plan: ${scaleId}`);

console.log(`
Run these to wire the plans into Convex:

  npx convex env set PAYPAL_PLAN_ID_TEAM ${teamId}
  npx convex env set PAYPAL_PLAN_ID_SCALE ${scaleId}
`);

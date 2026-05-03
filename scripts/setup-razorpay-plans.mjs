#!/usr/bin/env node
/**
 * One-shot: create the PraxTalk Team and Scale Razorpay subscription
 * plans. Prints the plan IDs to set as RAZORPAY_PLAN_ID_TEAM and
 * RAZORPAY_PLAN_ID_SCALE in Convex env.
 *
 * Usage:
 *   RAZORPAY_KEY_ID=rzp_test_… RAZORPAY_KEY_SECRET=… \
 *     node scripts/setup-razorpay-plans.mjs [USD|INR]
 *
 * Defaults to INR (Razorpay's home currency). Pass USD if your
 * Razorpay account has USD pricing enabled (international merchants).
 *
 * Idempotent-ish: re-running creates *new* plans. Run once.
 */

const currency = (process.argv[2] ?? "INR").toUpperCase();
if (currency !== "INR" && currency !== "USD") {
  console.error("Currency must be INR or USD.");
  process.exit(1);
}

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
if (!keyId || !keySecret) {
  console.error(
    "Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET before running.",
  );
  process.exit(1);
}

// Pricing in the smallest unit (paise for INR, cents for USD).
// Roughly converts $49 → ₹4,099 and $199 → ₹16,599 at ~₹83.6/USD —
// override via env if you want exact pricing.
const teamAmount =
  Number(process.env.RAZORPAY_TEAM_AMOUNT) ||
  (currency === "INR" ? 4099_00 : 49_00);
const scaleAmount =
  Number(process.env.RAZORPAY_SCALE_AMOUNT) ||
  (currency === "INR" ? 16599_00 : 199_00);

const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

async function createPlan(name, amount) {
  const res = await fetch("https://api.razorpay.com/v1/plans", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      period: "monthly",
      interval: 1,
      item: {
        name: `PraxTalk ${name}`,
        amount,
        currency,
        description: `PraxTalk ${name} plan — recurring monthly`,
      },
      notes: { source: "setup-razorpay-plans.mjs" },
    }),
  });
  if (!res.ok) {
    throw new Error(
      `createPlan(${name}): ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()).id;
}

const teamId = await createPlan("Team", teamAmount);
console.log(
  `✓ Created Team plan: ${teamId} (${currency} ${(teamAmount / 100).toFixed(2)}/mo)`,
);

const scaleId = await createPlan("Scale", scaleAmount);
console.log(
  `✓ Created Scale plan: ${scaleId} (${currency} ${(scaleAmount / 100).toFixed(2)}/mo)`,
);

console.log(`
Run these to wire the plans into Convex:

  npx convex env set RAZORPAY_PLAN_ID_TEAM ${teamId}
  npx convex env set RAZORPAY_PLAN_ID_SCALE ${scaleId}
`);

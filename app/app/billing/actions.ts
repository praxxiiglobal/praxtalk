"use server";

import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";

export async function startCheckoutAction(plan: "team" | "scale") {
  const sessionToken = await readSessionToken();
  if (!sessionToken) {
    redirect("/login?next=/app/billing");
  }
  let approvalUrl: string;
  try {
    const result = await convexServer.action(api.billing.createCheckoutLink, {
      sessionToken,
      plan,
    });
    approvalUrl = result.approvalUrl;
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not start PayPal checkout.";
    redirect(`/app/billing?paypal_error=${encodeURIComponent(message)}`);
  }
  redirect(approvalUrl);
}

export async function cancelSubscriptionAction() {
  const sessionToken = await readSessionToken();
  if (!sessionToken) {
    redirect("/login?next=/app/billing");
  }
  try {
    await convexServer.action(api.billing.cancelSubscription, {
      sessionToken,
    });
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not cancel subscription.";
    redirect(`/app/billing?paypal_error=${encodeURIComponent(message)}`);
  }
  redirect("/app/billing?paypal=cancelled");
}

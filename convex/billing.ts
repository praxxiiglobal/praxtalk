import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import * as paypal from "./lib/paypal";

type PlanTier = "spark" | "team" | "scale" | "enterprise";
type BillablePlan = "team" | "scale";

const PAID_PLAN = v.union(v.literal("team"), v.literal("scale"));

const SUBSCRIPTION_STATUS = v.union(
  v.literal("active"),
  v.literal("past_due"),
  v.literal("cancelled"),
  v.literal("paused"),
);

function planIdFor(plan: BillablePlan): string | undefined {
  return plan === "team"
    ? process.env.PAYPAL_PLAN_ID_TEAM
    : process.env.PAYPAL_PLAN_ID_SCALE;
}

function planForId(planId: string): BillablePlan | null {
  if (planId === process.env.PAYPAL_PLAN_ID_TEAM) return "team";
  if (planId === process.env.PAYPAL_PLAN_ID_SCALE) return "scale";
  return null;
}

/**
 * Read the current workspace's billing state. Public query — gated by
 * sessionToken. Returns the fields the dashboard needs to render the
 * upgrade / cancel UI.
 */
export const getSubscription = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    plan: v.union(
      v.literal("spark"),
      v.literal("team"),
      v.literal("scale"),
      v.literal("enterprise"),
    ),
    paypalSubscriptionId: v.union(v.string(), v.null()),
    subscriptionStatus: v.union(SUBSCRIPTION_STATUS, v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
    paypalConfigured: v.boolean(),
    teamPlanConfigured: v.boolean(),
    scalePlanConfigured: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const ws = await ctx.db.get(workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    return {
      plan: ws.plan,
      paypalSubscriptionId: ws.paypalSubscriptionId ?? null,
      subscriptionStatus: ws.subscriptionStatus ?? null,
      currentPeriodEnd: ws.currentPeriodEnd ?? null,
      paypalConfigured: paypal.isConfigured(),
      teamPlanConfigured: Boolean(process.env.PAYPAL_PLAN_ID_TEAM),
      scalePlanConfigured: Boolean(process.env.PAYPAL_PLAN_ID_SCALE),
    };
  },
});

/**
 * Internal: read workspace fields the action needs without exposing
 * them through the public API surface.
 */
export const _loadWorkspaceForCheckout = internalQuery({
  args: { sessionToken: v.string() },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    currentPlan: v.union(
      v.literal("spark"),
      v.literal("team"),
      v.literal("scale"),
      v.literal("enterprise"),
    ),
    paypalSubscriptionId: v.union(v.string(), v.null()),
    subscriptionStatus: v.union(SUBSCRIPTION_STATUS, v.null()),
  }),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const ws = await ctx.db.get(workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    return {
      workspaceId,
      currentPlan: ws.plan,
      paypalSubscriptionId: ws.paypalSubscriptionId ?? null,
      subscriptionStatus: ws.subscriptionStatus ?? null,
    };
  },
});

/**
 * Start a PayPal subscription checkout. Returns the approval URL the
 * browser should redirect to. The webhook at /api/paypal/webhook flips
 * the workspace plan once PayPal confirms ACTIVATED.
 */
export const createCheckoutLink = action({
  args: {
    sessionToken: v.string(),
    plan: PAID_PLAN,
  },
  returns: v.object({ approvalUrl: v.string() }),
  handler: async (ctx, args) => {
    if (!paypal.isConfigured()) {
      throw new ConvexError(
        "PayPal billing isn't configured yet. Contact hello@praxtalk.com.",
      );
    }
    const planId = planIdFor(args.plan);
    if (!planId) {
      throw new ConvexError(
        `PayPal plan id for "${args.plan}" not configured.`,
      );
    }
    const ws: {
      workspaceId: Id<"workspaces">;
      currentPlan: PlanTier;
      paypalSubscriptionId: string | null;
      subscriptionStatus:
        | "active"
        | "past_due"
        | "cancelled"
        | "paused"
        | null;
    } = await ctx.runQuery(internal.billing._loadWorkspaceForCheckout, {
      sessionToken: args.sessionToken,
    });
    // Only block when there's a *confirmed* live subscription. A stashed
    // paypalSubscriptionId with no status means the user opened a checkout
    // but never approved — those orphans time out on PayPal's side, and
    // we let the user re-attempt from a clean slate.
    const liveStatuses: ReadonlyArray<string> = [
      "active",
      "past_due",
      "paused",
    ];
    if (
      ws.subscriptionStatus &&
      liveStatuses.includes(ws.subscriptionStatus)
    ) {
      throw new ConvexError(
        "This workspace already has an active subscription. Cancel it before starting a new one.",
      );
    }
    const returnUrl =
      process.env.PAYPAL_RETURN_URL ??
      "https://app.praxtalk.com/app/billing?paypal=approved";
    const cancelUrl =
      process.env.PAYPAL_CANCEL_URL ??
      "https://app.praxtalk.com/app/billing?paypal=cancelled";

    const sub = await paypal.createSubscription({
      planId,
      returnUrl,
      cancelUrl,
      customId: ws.workspaceId,
    });
    const approvalUrl = paypal.approveLinkOf(sub);
    if (!approvalUrl) {
      throw new ConvexError("PayPal returned no approval URL.");
    }
    // Stash the subscriptionId immediately so a slow / missed webhook
    // doesn't leave us guessing. Status stays unset until the webhook
    // confirms ACTIVATED — we don't grant the plan tier on faith.
    await ctx.runMutation(internal.billing._stashPendingSubscription, {
      workspaceId: ws.workspaceId,
      paypalSubscriptionId: sub.id,
    });
    return { approvalUrl };
  },
});

export const _stashPendingSubscription = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    paypalSubscriptionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workspaceId, {
      paypalSubscriptionId: args.paypalSubscriptionId,
    });
    return null;
  },
});

/**
 * Cancel the workspace's active subscription. PayPal cancels at the
 * end of the current billing period; the webhook eventually fires
 * BILLING.SUBSCRIPTION.CANCELLED and we drop the plan tier back to
 * spark.
 */
export const cancelSubscription = action({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ws: {
      workspaceId: Id<"workspaces">;
      currentPlan: PlanTier;
      paypalSubscriptionId: string | null;
      subscriptionStatus:
        | "active"
        | "past_due"
        | "cancelled"
        | "paused"
        | null;
    } = await ctx.runQuery(internal.billing._loadWorkspaceForCheckout, {
      sessionToken: args.sessionToken,
    });
    if (!ws.paypalSubscriptionId) {
      throw new ConvexError("No active subscription to cancel.");
    }
    await paypal.cancelSubscription({
      subscriptionId: ws.paypalSubscriptionId,
    });
    // Optimistically flip local state. The webhook will fire
    // BILLING.SUBSCRIPTION.CANCELLED for real cancels and converge to the
    // same state — but for already-gone subs (404), the webhook never
    // fires, so the optimistic write is the only thing that updates us.
    await ctx.runMutation(internal.billing._applySubscriptionEvent, {
      workspaceId: ws.workspaceId,
      paypalSubscriptionId: ws.paypalSubscriptionId,
      plan: "spark",
      subscriptionStatus: "cancelled",
    });
    return null;
  },
});

// ── Webhook plumbing ───────────────────────────────────────────────────
//
// Called by the http handler at /api/paypal/webhook after signature
// verification. Idempotent — re-delivering the same event is a no-op.

export const _findWorkspaceBySubscription = internalQuery({
  args: { paypalSubscriptionId: v.string() },
  returns: v.union(v.id("workspaces"), v.null()),
  handler: async (ctx, args) => {
    const ws = await ctx.db
      .query("workspaces")
      .withIndex("by_paypal_subscription", (q) =>
        q.eq("paypalSubscriptionId", args.paypalSubscriptionId),
      )
      .unique();
    return ws?._id ?? null;
  },
});

export const _applySubscriptionEvent = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    paypalSubscriptionId: v.string(),
    paypalPayerId: v.optional(v.string()),
    plan: v.union(
      v.literal("spark"),
      v.literal("team"),
      v.literal("scale"),
    ),
    subscriptionStatus: SUBSCRIPTION_STATUS,
    currentPeriodEnd: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const patch: Record<string, unknown> = {
      paypalSubscriptionId: args.paypalSubscriptionId,
      subscriptionStatus: args.subscriptionStatus,
      plan: args.plan,
    };
    if (args.paypalPayerId) patch.paypalPayerId = args.paypalPayerId;
    if (args.currentPeriodEnd) patch.currentPeriodEnd = args.currentPeriodEnd;
    await ctx.db.patch(args.workspaceId, patch);
    return null;
  },
});

/**
 * Action invoked by the webhook httpAction. Lives in `billing.ts` so
 * the PayPal-API side-effects (re-fetch subscription, cancel, etc) and
 * the DB-write side-effects share one transactional surface.
 */
export const _handleWebhookEvent = internalAction({
  args: {
    eventType: v.string(),
    paypalSubscriptionId: v.string(),
    customId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    let workspaceId: Id<"workspaces"> | null = await ctx.runQuery(
      internal.billing._findWorkspaceBySubscription,
      { paypalSubscriptionId: args.paypalSubscriptionId },
    );
    // Fallback — pre-ACTIVATED webhooks arrive before our local stash
    // is visible to the index, or if the stash mutation got lost. We
    // round-tripped the workspaceId through PayPal's custom_id field
    // exactly for this case.
    if (!workspaceId && args.customId) {
      workspaceId = args.customId as Id<"workspaces">;
    }
    if (!workspaceId) return null; // stale event for an unknown sub — drop

    const sub = await paypal.getSubscription(args.paypalSubscriptionId);
    const tier = planForId(sub.plan_id);

    let nextStatus: "active" | "past_due" | "cancelled" | "paused";
    let nextPlan: "spark" | "team" | "scale";
    switch (args.eventType) {
      case "BILLING.SUBSCRIPTION.ACTIVATED":
      case "BILLING.SUBSCRIPTION.UPDATED":
      case "BILLING.SUBSCRIPTION.RE-ACTIVATED":
        nextStatus = "active";
        nextPlan = tier ?? "spark";
        break;
      case "BILLING.SUBSCRIPTION.CANCELLED":
      case "BILLING.SUBSCRIPTION.EXPIRED":
        nextStatus = "cancelled";
        nextPlan = "spark";
        break;
      case "BILLING.SUBSCRIPTION.SUSPENDED":
        nextStatus = "paused";
        nextPlan = tier ?? "spark";
        break;
      case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
        nextStatus = "past_due";
        nextPlan = tier ?? "spark";
        break;
      default:
        return null;
    }

    const nextBilling = sub.billing_info?.next_billing_time
      ? Date.parse(sub.billing_info.next_billing_time)
      : undefined;

    await ctx.runMutation(internal.billing._applySubscriptionEvent, {
      workspaceId,
      paypalSubscriptionId: args.paypalSubscriptionId,
      paypalPayerId: sub.subscriber?.payer_id,
      plan: nextPlan,
      subscriptionStatus: nextStatus,
      currentPeriodEnd: Number.isFinite(nextBilling) ? nextBilling : undefined,
    });
    return null;
  },
});

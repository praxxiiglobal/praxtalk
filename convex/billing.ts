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
import * as razorpay from "./lib/razorpay";

type PlanTier = "spark" | "team" | "scale" | "enterprise";
type BillablePlan = "team" | "scale";

const PAID_PLAN = v.union(v.literal("team"), v.literal("scale"));

const SUBSCRIPTION_STATUS = v.union(
  v.literal("active"),
  v.literal("past_due"),
  v.literal("cancelled"),
  v.literal("paused"),
);

function paypalPlanIdFor(plan: BillablePlan): string | undefined {
  return plan === "team"
    ? process.env.PAYPAL_PLAN_ID_TEAM
    : process.env.PAYPAL_PLAN_ID_SCALE;
}

function paypalPlanForId(planId: string): BillablePlan | null {
  if (planId === process.env.PAYPAL_PLAN_ID_TEAM) return "team";
  if (planId === process.env.PAYPAL_PLAN_ID_SCALE) return "scale";
  return null;
}

function razorpayPlanIdFor(plan: BillablePlan): string | undefined {
  return plan === "team"
    ? process.env.RAZORPAY_PLAN_ID_TEAM
    : process.env.RAZORPAY_PLAN_ID_SCALE;
}

function razorpayPlanForId(planId: string): BillablePlan | null {
  if (planId === process.env.RAZORPAY_PLAN_ID_TEAM) return "team";
  if (planId === process.env.RAZORPAY_PLAN_ID_SCALE) return "scale";
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
    subscriptionProvider: v.union(
      v.literal("paypal"),
      v.literal("razorpay"),
      v.null(),
    ),
    paypalSubscriptionId: v.union(v.string(), v.null()),
    razorpaySubscriptionId: v.union(v.string(), v.null()),
    subscriptionStatus: v.union(SUBSCRIPTION_STATUS, v.null()),
    currentPeriodEnd: v.union(v.number(), v.null()),
    // Per-provider configuration flags + plan id flags so the UI can
    // render available upgrade buttons (and which CTAs to disable).
    paypal: v.object({
      configured: v.boolean(),
      teamPlanConfigured: v.boolean(),
      scalePlanConfigured: v.boolean(),
    }),
    razorpay: v.object({
      configured: v.boolean(),
      teamPlanConfigured: v.boolean(),
      scalePlanConfigured: v.boolean(),
    }),
  }),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const ws = await ctx.db.get(workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    return {
      plan: ws.plan,
      subscriptionProvider: ws.subscriptionProvider ?? null,
      paypalSubscriptionId: ws.paypalSubscriptionId ?? null,
      razorpaySubscriptionId: ws.razorpaySubscriptionId ?? null,
      subscriptionStatus: ws.subscriptionStatus ?? null,
      currentPeriodEnd: ws.currentPeriodEnd ?? null,
      paypal: {
        configured: paypal.isConfigured(),
        teamPlanConfigured: Boolean(process.env.PAYPAL_PLAN_ID_TEAM),
        scalePlanConfigured: Boolean(process.env.PAYPAL_PLAN_ID_SCALE),
      },
      razorpay: {
        configured: razorpay.isConfigured(),
        teamPlanConfigured: Boolean(process.env.RAZORPAY_PLAN_ID_TEAM),
        scalePlanConfigured: Boolean(process.env.RAZORPAY_PLAN_ID_SCALE),
      },
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
    const planId = paypalPlanIdFor(args.plan);
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
    const workspaceId: Id<"workspaces"> | null = await ctx.runQuery(
      internal.billing._findWorkspaceBySubscription,
      { paypalSubscriptionId: args.paypalSubscriptionId },
    );
    // No customId fallback. Trusting the webhook-supplied custom_id
    // would mean a leaked webhook secret could flip ANY workspace's
    // plan by forging an event with notes={customId:<victim>}. The
    // index-by-paypalSubscriptionId is the only authoritative path;
    // missed-stash events drop here and reconcile when the next
    // webhook fires (PayPal retries up to 25 times over 3 days).
    if (!workspaceId) return null;
    void args.customId;

    const sub = await paypal.getSubscription(args.paypalSubscriptionId);
    const tier = paypalPlanForId(sub.plan_id);

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

// ── Razorpay flows ────────────────────────────────────────────────────

export const _stashPendingRazorpaySubscription = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    razorpaySubscriptionId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.workspaceId, {
      razorpaySubscriptionId: args.razorpaySubscriptionId,
      subscriptionProvider: "razorpay",
    });
    return null;
  },
});

export const createRazorpayCheckoutLink = action({
  args: {
    sessionToken: v.string(),
    plan: PAID_PLAN,
  },
  returns: v.object({ approvalUrl: v.string() }),
  handler: async (ctx, args) => {
    if (!razorpay.isConfigured()) {
      throw new ConvexError(
        "Razorpay billing isn't configured yet. Contact hello@praxtalk.com.",
      );
    }
    const planId = razorpayPlanIdFor(args.plan);
    if (!planId) {
      throw new ConvexError(
        `Razorpay plan id for "${args.plan}" not configured.`,
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
    const callbackUrl =
      process.env.RAZORPAY_RETURN_URL ??
      "https://www.praxtalk.com/app/billing?razorpay=approved";

    const sub = await razorpay.createSubscription({
      planId,
      totalCount: 120, // 10 years of monthly billing — effectively perpetual
      callbackUrl,
      notes: { workspaceId: ws.workspaceId },
    });
    if (!sub.short_url) {
      throw new ConvexError(
        "Razorpay didn't return a checkout URL — check the dashboard.",
      );
    }
    await ctx.runMutation(
      internal.billing._stashPendingRazorpaySubscription,
      { workspaceId: ws.workspaceId, razorpaySubscriptionId: sub.id },
    );
    return { approvalUrl: sub.short_url };
  },
});

export const cancelRazorpaySubscription = action({
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
    // We don't carry the Razorpay sub id on the loadOriginate context;
    // re-read the workspace for the razorpay-specific id.
    const fullWs: {
      razorpaySubscriptionId: string | null;
    } = await ctx.runQuery(internal.billing._loadWorkspaceRazorpay, {
      workspaceId: ws.workspaceId,
    });
    if (!fullWs.razorpaySubscriptionId) {
      throw new ConvexError("No Razorpay subscription to cancel.");
    }
    await razorpay.cancelSubscription({
      subscriptionId: fullWs.razorpaySubscriptionId,
    });
    // Optimistic local flip — webhook converges to the same state.
    await ctx.runMutation(internal.billing._applyRazorpayState, {
      workspaceId: ws.workspaceId,
      razorpaySubscriptionId: fullWs.razorpaySubscriptionId,
      plan: "spark",
      subscriptionStatus: "cancelled",
    });
    return null;
  },
});

export const _loadWorkspaceRazorpay = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    razorpaySubscriptionId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const ws = await ctx.db.get(args.workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    return { razorpaySubscriptionId: ws.razorpaySubscriptionId ?? null };
  },
});

export const _findWorkspaceByRazorpaySubscription = internalQuery({
  args: { razorpaySubscriptionId: v.string() },
  returns: v.union(v.id("workspaces"), v.null()),
  handler: async (ctx, args) => {
    const ws = await ctx.db
      .query("workspaces")
      .withIndex("by_razorpay_subscription", (q) =>
        q.eq("razorpaySubscriptionId", args.razorpaySubscriptionId),
      )
      .unique();
    return ws?._id ?? null;
  },
});

export const _applyRazorpayState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    razorpaySubscriptionId: v.string(),
    razorpayCustomerId: v.optional(v.string()),
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
      razorpaySubscriptionId: args.razorpaySubscriptionId,
      subscriptionProvider: "razorpay",
      subscriptionStatus: args.subscriptionStatus,
      plan: args.plan,
    };
    if (args.razorpayCustomerId) {
      patch.razorpayCustomerId = args.razorpayCustomerId;
    }
    if (args.currentPeriodEnd) {
      patch.currentPeriodEnd = args.currentPeriodEnd;
    }
    await ctx.db.patch(args.workspaceId, patch);
    return null;
  },
});

export const _handleRazorpayWebhookEvent = internalAction({
  args: {
    eventType: v.string(),
    razorpaySubscriptionId: v.string(),
    notesWorkspaceId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const workspaceId: Id<"workspaces"> | null = await ctx.runQuery(
      internal.billing._findWorkspaceByRazorpaySubscription,
      { razorpaySubscriptionId: args.razorpaySubscriptionId },
    );
    // No notes.workspaceId fallback. See _handleWebhookEvent above
    // for the same rationale — only the indexed lookup is trusted.
    if (!workspaceId) return null;
    void args.notesWorkspaceId;

    const sub = await razorpay.getSubscription(args.razorpaySubscriptionId);
    const tier = razorpayPlanForId(sub.plan_id);
    let nextStatus: "active" | "past_due" | "cancelled" | "paused";
    let nextPlan: "spark" | "team" | "scale";
    switch (args.eventType) {
      case "subscription.activated":
      case "subscription.charged":
      case "subscription.resumed":
      case "subscription.updated":
        nextStatus = "active";
        nextPlan = tier ?? "spark";
        break;
      case "subscription.cancelled":
      case "subscription.completed":
      case "subscription.expired":
        nextStatus = "cancelled";
        nextPlan = "spark";
        break;
      case "subscription.paused":
        nextStatus = "paused";
        nextPlan = tier ?? "spark";
        break;
      case "subscription.halted":
      case "subscription.pending":
        nextStatus = "past_due";
        nextPlan = tier ?? "spark";
        break;
      default:
        return null;
    }
    await ctx.runMutation(internal.billing._applyRazorpayState, {
      workspaceId,
      razorpaySubscriptionId: args.razorpaySubscriptionId,
      razorpayCustomerId: sub.customer_id,
      plan: nextPlan,
      subscriptionStatus: nextStatus,
      currentPeriodEnd: sub.current_end ? sub.current_end * 1000 : undefined,
    });
    return null;
  },
});

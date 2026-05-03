import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";

const planKeyValidator = v.union(
  v.literal("spark"),
  v.literal("team"),
  v.literal("scale"),
  v.literal("enterprise"),
);

const overrideShape = v.object({
  planKey: planKeyValidator,
  name: v.union(v.string(), v.null()),
  price: v.union(v.string(), v.null()),
  priceSub: v.union(v.string(), v.null()),
  lede: v.union(v.string(), v.null()),
  features: v.union(v.array(v.string()), v.null()),
  ctaLabel: v.union(v.string(), v.null()),
  ctaHref: v.union(v.string(), v.null()),
  ribbon: v.union(v.string(), v.null()),
  updatedAt: v.union(v.number(), v.null()),
});

/**
 * Public read — any visitor of the marketing site fetches the
 * current overrides. Returns one row per planKey; fields the admin
 * hasn't customised come back as null and the marketing component
 * falls back to its hardcoded default.
 */
export const getPublic = query({
  args: {},
  returns: v.array(overrideShape),
  handler: async (ctx) => {
    const all = await ctx.db.query("marketingPricing").collect();
    return (["spark", "team", "scale", "enterprise"] as const).map(
      (planKey) => {
        const row = all.find((r) => r.planKey === planKey);
        return {
          planKey,
          name: row?.name ?? null,
          price: row?.price ?? null,
          priceSub: row?.priceSub ?? null,
          lede: row?.lede ?? null,
          features: row?.features ?? null,
          ctaLabel: row?.ctaLabel ?? null,
          ctaHref: row?.ctaHref ?? null,
          ribbon: row?.ribbon ?? null,
          updatedAt: row?.updatedAt ?? null,
        };
      },
    );
  },
});

/**
 * Owner / admin upserts the override row for a single plan. Empty
 * strings + empty arrays clear the override (the marketing
 * component falls back to the default). The displayed-vs-billed
 * caveat is shown in the admin UI; this mutation does not touch
 * PayPal or Razorpay plan IDs — it's strictly cosmetic.
 */
export const updatePlan = mutation({
  args: {
    sessionToken: v.string(),
    planKey: planKeyValidator,
    name: v.optional(v.string()),
    price: v.optional(v.string()),
    priceSub: v.optional(v.string()),
    lede: v.optional(v.string()),
    features: v.optional(v.array(v.string())),
    ctaLabel: v.optional(v.string()),
    ctaHref: v.optional(v.string()),
    ribbon: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can edit marketing pricing.",
      );
    }
    // Empty strings → undefined so the row clears that override.
    const norm = (s: string | undefined) =>
      s === undefined || s.trim() === "" ? undefined : s.trim();
    const features =
      args.features && args.features.length > 0
        ? args.features.map((f) => f.trim()).filter((f) => f.length > 0)
        : undefined;

    const existing = await ctx.db
      .query("marketingPricing")
      .withIndex("by_plan_key", (q) => q.eq("planKey", args.planKey))
      .unique();
    const patch = {
      planKey: args.planKey,
      name: norm(args.name),
      price: norm(args.price),
      priceSub: norm(args.priceSub),
      lede: norm(args.lede),
      features,
      ctaLabel: norm(args.ctaLabel),
      ctaHref: norm(args.ctaHref),
      ribbon: norm(args.ribbon),
      updatedAt: Date.now(),
      updatedByOperatorId: operator._id,
    };
    if (existing) {
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("marketingPricing", patch);
    }
    return null;
  },
});

/**
 * Owner-only operator query — same data as getPublic plus the
 * updatedAt + updatedByOperatorId fields the admin UI shows.
 */
export const getForAdmin = query({
  args: { sessionToken: v.string() },
  returns: v.array(overrideShape),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    if (operator.role === "agent") return [];
    const all = await ctx.db.query("marketingPricing").collect();
    return (["spark", "team", "scale", "enterprise"] as const).map(
      (planKey) => {
        const row = all.find((r) => r.planKey === planKey);
        return {
          planKey,
          name: row?.name ?? null,
          price: row?.price ?? null,
          priceSub: row?.priceSub ?? null,
          lede: row?.lede ?? null,
          features: row?.features ?? null,
          ctaLabel: row?.ctaLabel ?? null,
          ctaHref: row?.ctaHref ?? null,
          ribbon: row?.ribbon ?? null,
          updatedAt: row?.updatedAt ?? null,
        };
      },
    );
  },
});

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Insert-and-check for inbound webhook event IDs. Returns true if
 * this is the first time we've seen the event (caller should process
 * it), false if it's a replay (caller should ack but no-op).
 *
 * Convex mutations are transactional, so the read + write happen
 * atomically — no double-processing race even under concurrent
 * deliveries from the provider.
 *
 * Usage from an httpAction:
 *   const fresh = await ctx.runMutation(
 *     internal.webhookDedup.markIfFresh,
 *     { key: `razorpay:${evt.id}` },
 *   );
 *   if (!fresh) return ackResponse;
 */
export const markIfFresh = internalMutation({
  args: { key: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("processedWebhooks")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    if (existing) return false;
    await ctx.db.insert("processedWebhooks", {
      key: args.key,
      receivedAt: Date.now(),
    });
    return true;
  },
});

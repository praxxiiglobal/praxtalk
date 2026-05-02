import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const WINDOW_MS = 60_000; // 1 minute
const LIMIT_PER_WINDOW = 60; // 60 requests per minute per IP

/**
 * Token bucket per IP, 60-second window. Called from http.ts before
 * every authenticated REST request. Returns `{ allowed: true }` if
 * the request fits in the current window's quota, or `{ allowed: false,
 * retryAfterSeconds }` if rate-limited.
 *
 * One row per active IP — when the window rolls over, the existing
 * row is patched back to count=1 with the new windowStart, so the
 * table stays bounded to "currently-active IPs" without needing a
 * cleanup cron.
 */
export const _checkAndRecord = internalMutation({
  args: { ip: v.string() },
  returns: v.object({
    allowed: v.boolean(),
    retryAfterSeconds: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;

    const existing = await ctx.db
      .query("apiRateLimits")
      .withIndex("by_ip", (q) => q.eq("ip", args.ip))
      .first();

    if (!existing) {
      await ctx.db.insert("apiRateLimits", {
        ip: args.ip,
        windowStart,
        count: 1,
      });
      return { allowed: true };
    }

    if (existing.windowStart !== windowStart) {
      // Window rolled over — reset the counter on the existing row.
      await ctx.db.patch(existing._id, { windowStart, count: 1 });
      return { allowed: true };
    }

    if (existing.count >= LIMIT_PER_WINDOW) {
      const retryAfterSeconds = Math.ceil(
        (windowStart + WINDOW_MS - now) / 1000,
      );
      return { allowed: false, retryAfterSeconds };
    }

    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return { allowed: true };
  },
});

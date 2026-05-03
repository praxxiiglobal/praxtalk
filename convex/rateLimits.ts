import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

const WINDOW_MS = 60_000; // 1 minute
const LIMIT_PER_WINDOW = 60; // 60 requests per minute per IP
const LIMIT_PER_KEY_READ = 6_000;  // 6k req/min per read-scope API key
const LIMIT_PER_KEY_WRITE = 600;   // 600 req/min per write-scope API key

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

/**
 * Per-API-key rate limit. Layered ON TOP of the per-IP check —
 * audit S-12 (2026-05-03): per-IP alone is bypassable from any
 * rotating-IP service, and a leaked key with no per-key cap can
 * drain quotas for the legitimate workspace before the operator
 * notices. Reuses the apiRateLimits table by namespacing the key
 * field with a `key:` prefix.
 *
 * Read scope: 6k/min (lookups, dashboards). Write scope: 600/min
 * (mutations — message create, lead update, status patch).
 */
export const _checkAndRecordKey = internalMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    scope: v.union(v.literal("read"), v.literal("write")),
  },
  returns: v.object({
    allowed: v.boolean(),
    retryAfterSeconds: v.optional(v.number()),
    limit: v.number(),
    remaining: v.number(),
  }),
  handler: async (ctx, args) => {
    const limit =
      args.scope === "read" ? LIMIT_PER_KEY_READ : LIMIT_PER_KEY_WRITE;
    const bucket = `key:${String(args.apiKeyId)}`;
    const now = Date.now();
    const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;

    const existing = await ctx.db
      .query("apiRateLimits")
      .withIndex("by_ip", (q) => q.eq("ip", bucket))
      .first();

    if (!existing) {
      await ctx.db.insert("apiRateLimits", {
        ip: bucket,
        windowStart,
        count: 1,
      });
      return { allowed: true, limit, remaining: limit - 1 };
    }
    if (existing.windowStart !== windowStart) {
      await ctx.db.patch(existing._id, { windowStart, count: 1 });
      return { allowed: true, limit, remaining: limit - 1 };
    }
    if (existing.count >= limit) {
      const retryAfterSeconds = Math.ceil(
        (windowStart + WINDOW_MS - now) / 1000,
      );
      return { allowed: false, retryAfterSeconds, limit, remaining: 0 };
    }
    await ctx.db.patch(existing._id, { count: existing.count + 1 });
    return {
      allowed: true,
      limit,
      remaining: limit - existing.count - 1,
    };
  },
});

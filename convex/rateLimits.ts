import { v } from "convex/values";
import { internalMutation, type MutationCtx } from "./_generated/server";

const WINDOW_MS = 60_000; // 1 minute
// Raised 60 → 300 (2026-08-06): every operator of a CRM integration
// egresses through ONE IP (e.g. Convex action servers), so 60/min was
// throttling legitimate multi-agent inboxes (~40 req/min per agent
// with thread + typing polls). 300 supports ~7 concurrent agents;
// per-API-key limits (6k read / 600 write per min) remain the real
// abuse bound for authenticated traffic, and unauthenticated probes
// still can't exceed 300 attempts/min from one host.
const LIMIT_PER_WINDOW = 300;
export const LIMIT_PER_KEY_READ = 6_000; // 6k req/min per read-scope API key
export const LIMIT_PER_KEY_WRITE = 600; // 600 req/min per write-scope API key

// ── Sharded API buckets ──────────────────────────────────────────────
// Every REST request used to patch ONE counter document per client IP
// and ONE per API key. A CRM's agents all poll through a single egress
// IP with a single key (typing every ~1-3s, the open thread every 4s,
// the inbox every 15s), so those two documents took a steady stream of
// concurrent writes. When Convex's optimistic-concurrency retries ran
// out, the mutation threw inside http.ts authenticate() and the caller
// got a bare `500 {"code":"[Request ID: …] Server Error"}` on an
// otherwise trivial GET. Spreading each bucket over API_SHARDS
// documents — random shard per request, per-shard quota = limit /
// shards — divides the collision rate by the shard count; the
// aggregate cap holds statistically (a client may see a 429 a touch
// early on one shard, never late). Shard 0 keeps the legacy bucket
// name so rows that already exist keep counting instead of orphaning.
// http.ts additionally fails open if a check still throws.
const API_SHARDS = 8;

async function takeShardedBucket(
  ctx: MutationCtx,
  base: string,
  limit: number,
): Promise<{
  allowed: boolean;
  retryAfterSeconds?: number;
  limit: number;
  remaining: number;
}> {
  const shard = Math.floor(Math.random() * API_SHARDS);
  const bucket = shard === 0 ? base : `${base}:s${shard}`;
  const perShard = Math.max(1, Math.ceil(limit / API_SHARDS));
  const now = Date.now();
  const windowStart = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  // Estimated headroom across all shards from this shard's count.
  const remainingOf = (count: number) =>
    Math.max(0, (perShard - count) * API_SHARDS);

  const existing = await ctx.db
    .query("apiRateLimits")
    .withIndex("by_ip", (q) => q.eq("ip", bucket))
    .first();

  if (!existing) {
    await ctx.db.insert("apiRateLimits", { ip: bucket, windowStart, count: 1 });
    return { allowed: true, limit, remaining: remainingOf(1) };
  }
  if (existing.windowStart !== windowStart) {
    // Window rolled over — reset the counter on the existing row.
    await ctx.db.patch(existing._id, { windowStart, count: 1 });
    return { allowed: true, limit, remaining: remainingOf(1) };
  }
  if (existing.count >= perShard) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((windowStart + WINDOW_MS - now) / 1000),
      limit,
      remaining: 0,
    };
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return { allowed: true, limit, remaining: remainingOf(existing.count + 1) };
}

const LOGIN_WINDOW_MS = 15 * 60_000; // 15 minutes
const LOGIN_LIMIT_PER_IP = 20; // 20 login attempts / 15 min / IP
const RESET_WINDOW_MS = 60 * 60_000; // 1 hour
const RESET_LIMIT_PER_IP = 10; // 10 password-reset requests / hour / IP
const RESET_LIMIT_PER_EMAIL = 3; // 3 password-reset requests / hour / email

/**
 * Inline rate-limit primitive shared by login + password-reset paths.
 * Mutations can't call other mutations through ctx.runMutation cheaply
 * (async hop + no shared txn), so we inline the bucket update here and
 * import this helper from auth.ts / passwordReset.ts.
 */
export async function takeBucket(
  ctx: MutationCtx,
  bucket: string,
  limit: number,
  windowMs: number,
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
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
    return { allowed: true };
  }
  if (existing.windowStart !== windowStart) {
    await ctx.db.patch(existing._id, { windowStart, count: 1 });
    return { allowed: true };
  }
  if (existing.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((windowStart + windowMs - now) / 1000),
    };
  }
  await ctx.db.patch(existing._id, { count: existing.count + 1 });
  return { allowed: true };
}

export const LOGIN_LIMITS = {
  windowMs: LOGIN_WINDOW_MS,
  perIp: LOGIN_LIMIT_PER_IP,
};

export const RESET_LIMITS = {
  windowMs: RESET_WINDOW_MS,
  perIp: RESET_LIMIT_PER_IP,
  perEmail: RESET_LIMIT_PER_EMAIL,
};

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
    const r = await takeShardedBucket(ctx, args.ip, LIMIT_PER_WINDOW);
    return r.allowed
      ? { allowed: true }
      : { allowed: false, retryAfterSeconds: r.retryAfterSeconds ?? 60 };
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
    return await takeShardedBucket(
      ctx,
      `key:${String(args.apiKeyId)}`,
      limit,
    );
  },
});

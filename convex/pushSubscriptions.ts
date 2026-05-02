import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { requireOperator } from "./auth";

/**
 * Returns the workspace's VAPID public key — the browser needs it to
 * subscribe. Read directly from process.env so it's always in sync
 * with the private key the action uses to sign push payloads.
 */
export const getVapidPublicKey = query({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async () => {
    return process.env.VAPID_PUBLIC_KEY ?? null;
  },
});

/**
 * Persist a PushSubscription from the browser. Idempotent on endpoint —
 * re-subscribing from the same browser updates the keys instead of
 * creating duplicate rows.
 */
export const subscribe = mutation({
  args: {
    sessionToken: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
  },
  returns: v.id("pushSubscriptions"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, {
        operatorId: operator._id,
        workspaceId,
        p256dh: args.p256dh,
        auth: args.auth,
        userAgent: args.userAgent,
      });
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", {
      workspaceId,
      operatorId: operator._id,
      endpoint: args.endpoint,
      p256dh: args.p256dh,
      auth: args.auth,
      userAgent: args.userAgent,
      createdAt: Date.now(),
    });
  },
});

/**
 * The current operator unsubscribes one browser. Removes the row
 * matching the endpoint (if it belongs to this operator).
 */
export const unsubscribe = mutation({
  args: { sessionToken: v.string(), endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing && existing.operatorId === operator._id) {
      await ctx.db.delete(existing._id);
    }
    return null;
  },
});

/**
 * Lightweight check the dashboard can call to render the toggle in
 * "subscribed" state without re-running browser permission checks.
 */
export const myActiveCount = query({
  args: { sessionToken: v.string() },
  returns: v.number(),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
      .collect();
    return subs.length;
  },
});

// ── Internal helpers used by the push action ──────────────────────────

export const _listForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.array(
    v.object({
      _id: v.id("pushSubscriptions"),
      endpoint: v.string(),
      p256dh: v.string(),
      auth: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    return subs.map((s) => ({
      _id: s._id,
      endpoint: s.endpoint,
      p256dh: s.p256dh,
      auth: s.auth,
    }));
  },
});

/**
 * Called by the push action when a push fails with 404/410 — the
 * subscription is dead and should be cleaned up so we don't keep
 * trying. Other status codes (e.g. 429, 5xx) are transient; we leave
 * the row alone.
 */
export const _deleteByEndpoint = internalMutation({
  args: { endpoint: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_endpoint", (q) => q.eq("endpoint", args.endpoint))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

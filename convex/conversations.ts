import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";

/**
 * List the inbox for the current operator's workspace.
 * Filtered by status (default: open), newest message first.
 */
export const listInbox = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("snoozed"),
        v.literal("resolved"),
        v.literal("closed"),
      ),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const status = args.status ?? "open";
    const limit = Math.min(args.limit ?? 50, 200);

    const conversations = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_status_lastmsg", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", status),
      )
      .order("desc")
      .take(limit);

    // Hydrate each with its visitor for the inbox row preview.
    return await Promise.all(
      conversations.map(async (c) => {
        const visitor = await ctx.db.get(c.visitorId);
        return {
          ...c,
          visitor: visitor
            ? { name: visitor.name, email: visitor.email }
            : null,
        };
      }),
    );
  },
});

/**
 * Get a single conversation by id, scoped to the caller's workspace.
 */
export const getById = query({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return null;
    const visitor = await ctx.db.get(convo.visitorId);
    return {
      ...convo,
      visitor,
    };
  },
});

/**
 * Update conversation status (resolve / snooze / reopen / close).
 */
export const setStatus = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    status: v.union(
      v.literal("open"),
      v.literal("snoozed"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) {
      throw new Error("Conversation not found.");
    }
    await ctx.db.patch(args.conversationId, {
      status: args.status,
      resolvedBy: args.status === "resolved" ? "operator" : undefined,
    });
    return null;
  },
});

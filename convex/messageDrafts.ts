import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";

/**
 * Per-operator draft storage. The conversation composer autosaves
 * here as the operator types; on send, the draft is removed in the
 * same flow that creates the message.
 */

export const get = query({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("messageDrafts"),
      body: v.string(),
      isInternal: v.boolean(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const draft = await ctx.db
      .query("messageDrafts")
      .withIndex("by_conversation_operator", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("operatorId", operator._id),
      )
      .first();
    if (!draft) return null;
    return {
      _id: draft._id,
      body: draft.body,
      isInternal: draft.isInternal,
      updatedAt: draft.updatedAt,
    };
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    body: v.string(),
    isInternal: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return null;
    if (!hasBrandAccess(operator, convo.brandId)) return null;

    const existing = await ctx.db
      .query("messageDrafts")
      .withIndex("by_conversation_operator", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("operatorId", operator._id),
      )
      .first();
    const trimmed = args.body;
    const now = Date.now();
    if (existing) {
      // Empty body → delete the draft (operator cleared the composer).
      if (!trimmed.trim()) {
        await ctx.db.delete(existing._id);
        return null;
      }
      await ctx.db.patch(existing._id, {
        body: trimmed,
        isInternal: args.isInternal,
        updatedAt: now,
      });
      return null;
    }
    if (!trimmed.trim()) return null;
    await ctx.db.insert("messageDrafts", {
      workspaceId,
      conversationId: args.conversationId,
      operatorId: operator._id,
      body: trimmed,
      isInternal: args.isInternal,
      updatedAt: now,
    });
    return null;
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const existing = await ctx.db
      .query("messageDrafts")
      .withIndex("by_conversation_operator", (q) =>
        q
          .eq("conversationId", args.conversationId)
          .eq("operatorId", operator._id),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * The current operator's drafts across all conversations — newest
 * first. Used by the Drafts folder of the dedicated emails view.
 */
export const listMine = query({
  args: { sessionToken: v.string(), limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("messageDrafts"),
      conversationId: v.id("conversations"),
      visitorName: v.union(v.string(), v.null()),
      visitorEmail: v.union(v.string(), v.null()),
      body: v.string(),
      isInternal: v.boolean(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const limit = Math.min(Math.max(1, args.limit ?? 50), 200);
    const drafts = await ctx.db
      .query("messageDrafts")
      .withIndex("by_operator_updated", (q) =>
        q.eq("operatorId", operator._id),
      )
      .order("desc")
      .take(limit);
    return await Promise.all(
      drafts.map(async (d) => {
        const convo = await ctx.db.get(d.conversationId);
        const visitor = convo ? await ctx.db.get(convo.visitorId) : null;
        return {
          _id: d._id,
          conversationId: d.conversationId,
          visitorName: visitor?.name ?? null,
          visitorEmail: visitor?.email ?? null,
          body: d.body,
          isInternal: d.isInternal,
          updatedAt: d.updatedAt,
        };
      }),
    );
  },
});

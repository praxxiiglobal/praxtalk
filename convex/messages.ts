import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";

/**
 * Stream messages for a conversation. Reactive — clients subscribe and
 * receive live updates as new messages land.
 */
export const listByConversation = query({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .take(Math.min(args.limit ?? 200, 500));
  },
});

/**
 * Operator sends a reply into an open conversation.
 */
export const send = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    body: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) {
      throw new Error("Conversation not found.");
    }
    const body = args.body.trim();
    if (!body) throw new Error("Message body required.");

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      workspaceId,
      role: "operator",
      senderOperatorId: operator._id,
      body,
      createdAt: now,
    });

    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      assignedOperatorId: convo.assignedOperatorId ?? operator._id,
      status: convo.status === "snoozed" ? "open" : convo.status,
    });

    return messageId;
  },
});

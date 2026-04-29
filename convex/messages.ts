import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";
import { fireEvent } from "./webhooks";

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
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return [];
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) return [];

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
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) {
      throw new Error("No access to this brand.");
    }
    const body = args.body.trim();
    if (!body) throw new Error("Message body required.");

    const channel = convo.channel ?? "web_chat";
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      workspaceId,
      brandId: convo.brandId,
      channel,
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

    await fireEvent(ctx, workspaceId, "message.created", {
      messageId,
      conversationId: args.conversationId,
      brandId: convo.brandId,
      channel,
      role: "operator",
      senderOperatorId: operator._id,
      body,
      createdAt: now,
    });

    // For email-channel conversations, schedule the outbound email send.
    // Web chat replies stream live via Convex websockets and need no extra
    // dispatch.
    if (channel === "email") {
      await ctx.scheduler.runAfter(
        0,
        internal.emailIntegrations.sendOperatorReply,
        { messageId },
      );
    }

    return messageId;
  },
});

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
 * Operator sends a reply into an open conversation. When `internal` is
 * true the message is recorded as an `internal_note` — visible only to
 * operators with brand access, never delivered to the visitor and never
 * dispatched outbound (no email send, no webhook fan-out as a customer
 * message).
 */
export const send = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    body: v.string(),
    internal: v.optional(v.boolean()),
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
    const isInternal = Boolean(args.internal);
    const role = isInternal ? "internal_note" : "operator";
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      workspaceId,
      brandId: convo.brandId,
      channel,
      role,
      senderOperatorId: operator._id,
      body,
      createdAt: now,
    });

    // Internal notes don't bump lastMessageAt — they're not customer
    // engagement signals — but they should still re-open snoozed
    // conversations so the team sees the note.
    if (isInternal) {
      if (convo.status === "snoozed") {
        await ctx.db.patch(args.conversationId, { status: "open" });
      }
    } else {
      await ctx.db.patch(args.conversationId, {
        lastMessageAt: now,
        assignedOperatorId: convo.assignedOperatorId ?? operator._id,
        status: convo.status === "snoozed" ? "open" : convo.status,
      });
    }

    // Public message events for webhooks; skip for internal notes.
    if (!isInternal) {
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
      // For WhatsApp-channel, schedule the Meta Cloud API send. Web chat
      // replies stream live via Convex websockets and need no extra
      // dispatch.
      if (channel === "email") {
        await ctx.scheduler.runAfter(
          0,
          internal.emailIntegrations.sendOperatorReply,
          { messageId },
        );
      } else if (channel === "whatsapp") {
        await ctx.scheduler.runAfter(
          0,
          internal.whatsappIntegrations.sendOperatorReply,
          { messageId },
        );
      }
    }

    return messageId;
  },
});

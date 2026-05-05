import { ConvexError, v } from "convex/values";
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

    // Outbound channels (email / whatsapp / voice / sms) reach the
    // public internet from PraxTalk's egress (or the workspace's
    // own provider). New signups still in pending_review can't use
    // them — abuse vector is using PraxTalk as a spam launchpad
    // before staff has vetted the workspace. Web-chat replies and
    // internal notes stay open since they're internal to the
    // dashboard / widget tenant.
    const isOutbound =
      !isInternal &&
      (channel === "email" ||
        channel === "whatsapp" ||
        channel === "voice" ||
        channel === "sms");
    if (isOutbound) {
      const ws = await ctx.db.get(workspaceId);
      if (ws?.platformStatus === "pending_review") {
        throw new ConvexError(
          "Outbound replies unlock once your workspace passes staff review.",
        );
      }
    }
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

      // @-mention detection. Match `@word` against operator
      // email-prefix OR first-word-of-name (case-insensitive). Each
      // matched operator gets a targeted notification + push, except
      // the author (don't ping yourself by mentioning your own name).
      const mentions = body.match(/@[a-z0-9._-]{2,40}/gi) ?? [];
      if (mentions.length > 0) {
        const tokens = [
          ...new Set(mentions.map((m) => m.slice(1).toLowerCase())),
        ];
        const allOperators = await ctx.db
          .query("operators")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", workspaceId),
          )
          .collect();
        const notified = new Set<string>();
        for (const token of tokens) {
          const target = allOperators.find((op) => {
            if (op._id === operator._id) return false; // ignore self-mentions
            const emailPrefix = op.email.split("@")[0]?.toLowerCase() ?? "";
            const firstName = op.name.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
            return emailPrefix === token || firstName === token;
          });
          if (!target) continue;
          if (notified.has(String(target._id))) continue;
          notified.add(String(target._id));
          await ctx.db.insert("notifications", {
            workspaceId,
            operatorId: target._id,
            kind: "mention",
            severity: "info",
            title: `${operator.name} mentioned you`,
            body: body.slice(0, 200),
            link: `/app?conversation=${args.conversationId}`,
            createdAt: now,
          });
          // Browser push fan-out to that operator's devices.
          await ctx.scheduler.runAfter(
            0,
            internal.pushNotifications.sendToOperator,
            {
              operatorId: target._id,
              title: `${operator.name} mentioned you`,
              body: body.slice(0, 140),
              url: `/app?conversation=${args.conversationId}`,
            },
          );
        }
      }
    } else {
      // Stamp first-operator-response time once, never overwrite —
      // gives us a stable visitor-visible response-latency metric
      // for the SLA analytics surface.
      const patch: {
        lastMessageAt: number;
        assignedOperatorId: typeof convo.assignedOperatorId;
        status: typeof convo.status;
        firstOperatorResponseAt?: number;
      } = {
        lastMessageAt: now,
        assignedOperatorId: convo.assignedOperatorId ?? operator._id,
        status: convo.status === "snoozed" ? "open" : convo.status,
      };
      if (!convo.firstOperatorResponseAt) {
        patch.firstOperatorResponseAt = now;
      }
      await ctx.db.patch(args.conversationId, patch);
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
      } else if (channel === "sms") {
        await ctx.scheduler.runAfter(
          0,
          internal.voiceIntegrations.sendSmsForMessage,
          { messageId },
        );
      }
    }

    return messageId;
  },
});

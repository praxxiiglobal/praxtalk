import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";

const channelValidator = v.union(
  v.literal("chat"),
  v.literal("email"),
  v.literal("sms"),
  v.literal("whatsapp"),
  v.literal("voice"),
);

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("cancelled"),
);

/**
 * Schedule a reminder against an existing conversation. Operator
 * picks channel + sendAt + body. Atlas can also schedule via the
 * internal variant.
 */
export const schedule = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    channel: channelValidator,
    sendAt: v.number(), // unix ms
    body: v.string(),
    whatsappTemplateName: v.optional(v.string()),
  },
  returns: v.id("reminders"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) {
      throw new ConvexError("Conversation not found.");
    }
    if (!hasBrandAccess(operator, convo.brandId)) {
      throw new ConvexError("No access to this brand.");
    }
    const body = args.body.trim();
    if (!body) throw new ConvexError("Reminder body is required.");
    if (args.sendAt < Date.now() - 30_000) {
      throw new ConvexError("sendAt must be in the future.");
    }
    if (args.channel === "whatsapp" && !args.whatsappTemplateName) {
      throw new ConvexError(
        "WhatsApp reminders require a pre-approved template name.",
      );
    }

    return await ctx.db.insert("reminders", {
      workspaceId,
      brandId: convo.brandId,
      conversationId: args.conversationId,
      visitorId: convo.visitorId,
      channel: args.channel,
      sendAt: args.sendAt,
      body,
      whatsappTemplateName: args.whatsappTemplateName,
      status: "pending",
      scheduledByOperatorId: operator._id,
      scheduledAt: Date.now(),
    });
  },
});

export const cancel = mutation({
  args: { sessionToken: v.string(), reminderId: v.id("reminders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const r = await ctx.db.get(args.reminderId);
    if (!r || r.workspaceId !== workspaceId) {
      throw new ConvexError("Reminder not found.");
    }
    if (!hasBrandAccess(operator, r.brandId)) {
      throw new ConvexError("No access to this brand.");
    }
    if (r.status !== "pending") {
      throw new ConvexError(`Can't cancel a ${r.status} reminder.`);
    }
    await ctx.db.patch(args.reminderId, { status: "cancelled" });
    return null;
  },
});

/**
 * /app/reminders page — list this workspace's reminders, newest
 * sendAt first.
 */
export const listForWorkspace = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("reminders"),
      conversationId: v.id("conversations"),
      visitorName: v.union(v.string(), v.null()),
      channel: channelValidator,
      sendAt: v.number(),
      body: v.string(),
      status: statusValidator,
      sentAt: v.union(v.number(), v.null()),
      error: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const limit = Math.min(Math.max(1, args.limit ?? 100), 500);
    const all = await ctx.db
      .query("reminders")
      .withIndex("by_workspace_send_at", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(limit * 2);
    const filtered = args.status
      ? all.filter((r) => r.status === args.status)
      : all;
    const accessible = filtered.filter((r) =>
      hasBrandAccess(operator, r.brandId),
    );
    return await Promise.all(
      accessible.slice(0, limit).map(async (r) => {
        const visitor = await ctx.db.get(r.visitorId);
        return {
          _id: r._id,
          conversationId: r.conversationId,
          visitorName: visitor
            ? (visitor.name ?? visitor.email ?? visitor.phone ?? null)
            : null,
          channel: r.channel,
          sendAt: r.sendAt,
          body: r.body,
          status: r.status,
          sentAt: r.sentAt ?? null,
          error: r.error ?? null,
        };
      }),
    );
  },
});

/**
 * Reminders attached to one conversation — used by the modal in the
 * conversation pane to show what's scheduled.
 */
export const listForConversation = query({
  args: { sessionToken: v.string(), conversationId: v.id("conversations") },
  returns: v.array(
    v.object({
      _id: v.id("reminders"),
      channel: channelValidator,
      sendAt: v.number(),
      body: v.string(),
      status: statusValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return [];
    if (!hasBrandAccess(operator, convo.brandId)) return [];
    const rows = await ctx.db
      .query("reminders")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("desc")
      .take(50);
    return rows.map((r) => ({
      _id: r._id,
      channel: r.channel,
      sendAt: r.sendAt,
      body: r.body,
      status: r.status,
    }));
  },
});

// ── Cron + dispatch ──────────────────────────────────────────────────

export const dispatchDue = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const due: Array<{
      _id: Id<"reminders">;
      channel:
        | "chat"
        | "email"
        | "sms"
        | "whatsapp"
        | "voice";
    }> = await ctx.runQuery(internal.reminders._claimDue);

    for (const r of due) {
      try {
        await ctx.runMutation(internal.reminders._dispatchOne, {
          reminderId: r._id,
        });
      } catch (err) {
        await ctx.runMutation(internal.reminders._markFailed, {
          reminderId: r._id,
          error: err instanceof Error ? err.message : "Dispatch failed",
        });
      }
    }
    return null;
  },
});

export const _claimDue = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("reminders"),
      channel: channelValidator,
    }),
  ),
  handler: async (ctx) => {
    const now = Date.now();
    // Pull pending reminders due in the past — capped to bound work.
    const rows = await ctx.db
      .query("reminders")
      .withIndex("by_status_send_at", (q) =>
        q.eq("status", "pending").lte("sendAt", now),
      )
      .take(50);
    return rows.map((r) => ({ _id: r._id, channel: r.channel }));
  },
});

/**
 * Per-reminder dispatch. Channel-specific:
 * - chat: drops a system message into the conversation (visitor sees
 *   it in the widget; operator sees it in the inbox)
 * - email: schedules sendOperatorReply on a synthetic operator
 *   message (reuses existing email outbound path)
 * - sms: same idea via voiceIntegrations.sendSmsForMessage
 * - whatsapp / voice: not implemented yet — marked failed with a
 *   clear error so the dashboard surfaces it.
 */
export const _dispatchOne = internalMutation({
  args: { reminderId: v.id("reminders") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const r = await ctx.db.get(args.reminderId);
    if (!r || r.status !== "pending") return null;
    const convo = await ctx.db.get(r.conversationId);
    if (!convo) {
      await ctx.db.patch(r._id, {
        status: "failed",
        error: "Conversation no longer exists",
      });
      return null;
    }
    const now = Date.now();

    if (r.channel === "chat") {
      // System message in-thread — visitor sees it next time they
      // open the widget; operator sees it in the inbox immediately.
      await ctx.db.insert("messages", {
        conversationId: r.conversationId,
        workspaceId: r.workspaceId,
        brandId: r.brandId,
        channel: convo.channel,
        role: "system",
        body: `🔔 Reminder: ${r.body}`,
        createdAt: now,
      });
      await ctx.db.patch(r.conversationId, { lastMessageAt: now });
      await ctx.db.patch(r._id, { status: "sent", sentAt: now });
      return null;
    }

    if (r.channel === "email" || r.channel === "sms") {
      // Insert an operator-authored message in the right channel and
      // let the existing outbound dispatchers handle the actual send.
      // We pretend the message was sent by Atlas (no operator id) so
      // it doesn't attribute to a specific person.
      const msgId = await ctx.db.insert("messages", {
        conversationId: r.conversationId,
        workspaceId: r.workspaceId,
        brandId: r.brandId,
        channel: r.channel === "email" ? "email" : "sms",
        role: "atlas",
        body: r.body,
        createdAt: now,
      });
      await ctx.db.patch(r.conversationId, { lastMessageAt: now });
      if (r.channel === "email") {
        await ctx.scheduler.runAfter(
          0,
          internal.emailIntegrations.sendOperatorReply,
          { messageId: msgId },
        );
      } else {
        await ctx.scheduler.runAfter(
          0,
          internal.voiceIntegrations.sendSmsForMessage,
          { messageId: msgId },
        );
      }
      await ctx.db.patch(r._id, { status: "sent", sentAt: now });
      return null;
    }

    // WhatsApp template send + voice TTS — provider-specific work
    // beyond the MVP slice. Mark failed with a clear error so the
    // dashboard's reminder list surfaces it; user can re-schedule on
    // a different channel.
    await ctx.db.patch(r._id, {
      status: "failed",
      error: `Reminder dispatch via ${r.channel} not yet implemented.`,
    });
    return null;
  },
});

export const _markFailed = internalMutation({
  args: { reminderId: v.id("reminders"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.reminderId, {
      status: "failed",
      error: args.error,
    });
    return null;
  },
});

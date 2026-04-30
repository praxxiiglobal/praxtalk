import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import { generateWebhookSecret } from "./lib/auth";
import { pushActivity } from "./notifications";

// ── Dashboard CRUD ────────────────────────────────────────────────────

export const get = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const integration = await ctx.db
      .query("whatsappIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (!integration) return null;
    return {
      _id: integration._id,
      phoneNumberId: integration.phoneNumberId,
      businessAccountId: integration.businessAccountId,
      displayPhoneNumber: integration.displayPhoneNumber,
      // Don't round-trip the raw access token.
      hasAccessToken: Boolean(integration.accessToken),
      accessTokenPreview: integration.accessToken
        ? integration.accessToken.slice(0, 8) + "…"
        : null,
      verifyToken: integration.verifyToken, // safe to show — customer pastes into Meta UI
      enabled: integration.enabled,
      createdAt: integration.createdAt,
    };
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    phoneNumberId: v.string(),
    businessAccountId: v.optional(v.string()),
    displayPhoneNumber: v.optional(v.string()),
    accessToken: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  returns: v.id("whatsappIntegrations"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can configure WhatsApp.",
      );
    }
    if (!args.phoneNumberId.trim()) {
      throw new ConvexError("Phone number ID is required.");
    }

    const existing = await ctx.db
      .query("whatsappIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        phoneNumberId: args.phoneNumberId.trim(),
        businessAccountId: args.businessAccountId?.trim() || undefined,
        displayPhoneNumber: args.displayPhoneNumber?.trim() || undefined,
      };
      if (args.accessToken && args.accessToken.trim()) {
        patch.accessToken = args.accessToken.trim();
      }
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    if (!args.accessToken || !args.accessToken.trim()) {
      throw new ConvexError(
        "Access token is required to create the integration.",
      );
    }

    return await ctx.db.insert("whatsappIntegrations", {
      workspaceId,
      phoneNumberId: args.phoneNumberId.trim(),
      businessAccountId: args.businessAccountId?.trim() || undefined,
      displayPhoneNumber: args.displayPhoneNumber?.trim() || undefined,
      accessToken: args.accessToken.trim(),
      verifyToken: generateWebhookSecret(),
      enabled: args.enabled ?? true,
      createdBy: operator._id,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can remove the WhatsApp integration.",
      );
    }
    const existing = await ctx.db
      .query("whatsappIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

// ── Inbound (Meta Cloud API webhook) ──────────────────────────────────
// Wired from convex/http.ts. The GET handler responds to Meta's webhook
// verification challenge; the POST handler parses message events.

export const findByVerifyToken = internalQuery({
  args: { verifyToken: v.string() },
  handler: async (ctx, { verifyToken }) => {
    const all = await ctx.db.query("whatsappIntegrations").collect();
    const match = all.find((i) => i.verifyToken === verifyToken);
    if (!match) return null;
    return { _id: match._id, workspaceId: match.workspaceId };
  },
});

export const findByPhoneNumberId = internalQuery({
  args: { phoneNumberId: v.string() },
  handler: async (ctx, { phoneNumberId }) => {
    const integration = await ctx.db
      .query("whatsappIntegrations")
      .withIndex("by_phone_number_id", (q) =>
        q.eq("phoneNumberId", phoneNumberId),
      )
      .first();
    if (!integration || !integration.enabled) return null;
    return {
      _id: integration._id,
      workspaceId: integration.workspaceId,
      verifyToken: integration.verifyToken,
    };
  },
});

/**
 * Persist an inbound WhatsApp message. Mirrors `recordInboundEmail` —
 * find/create visitor by phone, find/create open conversation on the
 * whatsapp channel, insert the message row.
 */
export const recordInboundMessage = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    fromPhone: v.string(), // E.164
    fromName: v.optional(v.string()),
    body: v.string(),
    messageId: v.optional(v.string()), // WhatsApp wamid
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
    messageId: v.id("messages"),
  }),
  handler: async (ctx, args) => {
    const fromPhone = args.fromPhone.startsWith("+")
      ? args.fromPhone
      : `+${args.fromPhone}`;

    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (v) => v.workspaceId === args.workspaceId && v.phone === fromPhone,
    );
    const now = Date.now();
    if (!visitor) {
      const visitorKey = `wa_${fromPhone}`;
      const id = await ctx.db.insert("visitors", {
        workspaceId: args.workspaceId,
        visitorKey,
        name: args.fromName,
        phone: fromPhone,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, { lastSeenAt: now });
    }

    // Find/create open conversation on whatsapp channel for this visitor.
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_visitor", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("visitorId", visitor._id),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();

    let conversationId;
    let brandId;
    if (existing && existing.channel === "whatsapp") {
      conversationId = existing._id;
      brandId = existing.brandId;
      await ctx.db.patch(conversationId, { lastMessageAt: now });
    } else {
      const cid = await ctx.db.insert("conversations", {
        workspaceId: args.workspaceId,
        visitorId: visitor._id,
        channel: "whatsapp",
        status: "open",
        lastMessageAt: now,
        createdAt: now,
      });
      conversationId = cid;
      brandId = undefined;
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      workspaceId: args.workspaceId,
      brandId,
      channel: "whatsapp",
      role: "visitor",
      body: args.body,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.webhooks.enqueue, {
      workspaceId: args.workspaceId,
      eventType: "message.created",
      payload: JSON.stringify({
        type: "message.created",
        workspaceId: args.workspaceId,
        occurredAt: new Date(now).toISOString(),        data: {
          messageId,
          conversationId,
          channel: "whatsapp",
          role: "visitor",
          fromPhone,
          body: args.body,
        },
      }),
    });

    return { conversationId, visitorId: visitor._id, messageId };
  },
});

// ── Outbound: operator reply on whatsapp-channel conversation ─────────

export const loadOutboundContext = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) return null;
    const visitor = await ctx.db.get(conversation.visitorId);
    if (!visitor || !visitor.phone) return null;
    const integration = await ctx.db
      .query("whatsappIntegrations")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", message.workspaceId),
      )
      .first();
    if (!integration || !integration.enabled) return null;
    return { message, conversation, visitor, integration };
  },
});

export const recordSendFailure = internalMutation({
  args: { workspaceId: v.id("workspaces"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pushActivity(ctx, {
      workspaceId: args.workspaceId,
      kind: "system",
      severity: "error",
      title: "WhatsApp send failed",
      body: args.error,
      link: "/app/integrations",
    });
    return null;
  },
});

/**
 * Internal action — fires when an operator sends a message on a
 * WhatsApp-channel conversation. Calls the Meta Graph API to deliver
 * the text to the visitor's phone. Single attempt; failures push an
 * activity notification for the dashboard.
 *
 * Note: WhatsApp's 24-hour customer-service window restricts free-form
 * messages outside the window — operators must use approved templates
 * for re-engagement. We don't enforce that here (Meta will reject the
 * call and the error surfaces as an activity). Template-message support
 * is a follow-up.
 */
export const sendOperatorReply = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const data = await ctx.runQuery(
      internal.whatsappIntegrations.loadOutboundContext,
      { messageId },
    );
    if (!data) return null;
    const { message, visitor, integration } = data;
    const phone = visitor.phone!.replace(/^\+/, "");

    try {
      const res = await fetch(
        `https://graph.facebook.com/v20.0/${integration.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            authorization: `Bearer ${integration.accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: phone,
            type: "text",
            text: { body: message.body },
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Meta ${res.status}: ${errText}`);
      }
    } catch (err) {
      await ctx.runMutation(
        internal.whatsappIntegrations.recordSendFailure,
        {
          workspaceId: message.workspaceId,
          error: err instanceof Error ? err.message : "WhatsApp send failed",
        },
      );
    }
    return null;
  },
});

import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
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

// ── Templates ─────────────────────────────────────────────────────────
// Meta requires templates for messages outside the 24h customer-service
// window. The operator registers each Meta-approved template here
// (name + language + body preview); the inbox surfaces a template
// picker that calls `sendTemplate` to dispatch via Meta's API.

function countVariables(body: string): number {
  // Counts distinct {{N}} placeholders in the body.
  const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
  const ids = new Set(matches.map((m) => m.replace(/[^0-9]/g, "")));
  return ids.size;
}

export const listTemplates = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const templates = await ctx.db
      .query("whatsappTemplates")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return templates
      .map((t) => ({
        _id: t._id,
        name: t.name,
        language: t.language,
        category: t.category,
        body: t.body,
        variableCount: t.variableCount,
        createdAt: t.createdAt,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const addTemplate = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    language: v.string(),
    category: v.optional(v.string()),
    body: v.string(),
  },
  returns: v.id("whatsappTemplates"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can manage templates.",
      );
    }
    const name = args.name.trim();
    if (!name) throw new ConvexError("Template name is required.");
    if (!/^[a-z0-9_]+$/.test(name)) {
      throw new ConvexError(
        "Template name must match Meta's format: lowercase letters, digits, underscores.",
      );
    }
    if (!args.language.trim()) {
      throw new ConvexError("Language is required (e.g. en, en_US, hi).");
    }
    const body = args.body.trim();
    if (!body) throw new ConvexError("Body preview is required.");

    return await ctx.db.insert("whatsappTemplates", {
      workspaceId,
      name,
      language: args.language.trim(),
      category: args.category?.trim() || undefined,
      body,
      variableCount: countVariables(body),
      createdBy: operator._id,
      createdAt: Date.now(),
    });
  },
});

export const removeTemplate = mutation({
  args: { sessionToken: v.string(), templateId: v.id("whatsappTemplates") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can manage templates.",
      );
    }
    const t = await ctx.db.get(args.templateId);
    if (!t || t.workspaceId !== workspaceId) {
      throw new ConvexError("Template not found.");
    }
    await ctx.db.delete(args.templateId);
    return null;
  },
});

// ── Send template (operator-initiated outbound) ───────────────────────

export const loadTemplateContext = internalQuery({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    templateId: v.id("whatsappTemplates"),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return null;
    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor || !visitor.phone) return null;
    const template = await ctx.db.get(args.templateId);
    if (!template || template.workspaceId !== workspaceId) return null;
    const integration = await ctx.db
      .query("whatsappIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (!integration || !integration.enabled) return null;
    return { operator, convo, visitor, template, integration };
  },
});

export const recordOperatorTemplateMessage = internalMutation({
  args: {
    conversationId: v.id("conversations"),
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    body: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) throw new Error("Conversation gone.");
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      workspaceId: args.workspaceId,
      brandId: convo.brandId,
      channel: "whatsapp",
      role: "operator",
      senderOperatorId: args.operatorId,
      body: args.body,
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      assignedOperatorId: convo.assignedOperatorId ?? args.operatorId,
      status: convo.status === "snoozed" ? "open" : convo.status,
    });
    return messageId;
  },
});

/**
 * Public action — operator picks a template + fills variables; we send
 * it via Meta's template message API and record an operator-role
 * message in the conversation so the inbox shows it.
 *
 * Why an action and not a mutation: needs `fetch` to hit Meta.
 */
export const sendTemplate = action({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    templateId: v.id("whatsappTemplates"),
    variables: v.array(v.string()),
  },
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
    const data = await ctx.runQuery(
      internal.whatsappIntegrations.loadTemplateContext,
      {
        sessionToken: args.sessionToken,
        conversationId: args.conversationId,
        templateId: args.templateId,
      },
    );
    if (!data) {
      return {
        ok: false,
        error:
          "Couldn't load template context — check the integration is enabled and the visitor has a phone.",
      };
    }
    const { operator, convo, visitor, template, integration } = data;
    if (convo.channel !== "whatsapp") {
      return { ok: false, error: "Templates only apply to WhatsApp." };
    }
    if (args.variables.length !== template.variableCount) {
      return {
        ok: false,
        error: `Template expects ${template.variableCount} variable(s); got ${args.variables.length}.`,
      };
    }

    const phone = visitor.phone!.replace(/^\+/, "");
    const components =
      args.variables.length > 0
        ? [
            {
              type: "body",
              parameters: args.variables.map((value) => ({
                type: "text",
                text: value,
              })),
            },
          ]
        : undefined;

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
            to: phone,
            type: "template",
            template: {
              name: template.name,
              language: { code: template.language },
              ...(components ? { components } : {}),
            },
          }),
        },
      );
      if (!res.ok) {
        const errText = await res.text();
        return { ok: false, error: `Meta ${res.status}: ${errText}` };
      }
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Send failed",
      };
    }

    // Record the message in the conversation. Render the body with
    // variables substituted so the inbox shows what the visitor saw.
    let renderedBody = template.body;
    args.variables.forEach((value, idx) => {
      renderedBody = renderedBody.replace(
        new RegExp(`\\{\\{${idx + 1}\\}\\}`, "g"),
        value,
      );
    });

    const messageId: Id<"messages"> = await ctx.runMutation(
      internal.whatsappIntegrations.recordOperatorTemplateMessage,
      {
        conversationId: args.conversationId,
        workspaceId: convo.workspaceId,
        operatorId: operator._id,
        body: renderedBody,
      },
    );
    void messageId;
    return { ok: true };
  },
});

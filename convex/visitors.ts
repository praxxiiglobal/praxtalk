import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { fireEvent } from "./webhooks";

const locationValidator = v.object({
  country: v.optional(v.string()),
  countryCode: v.optional(v.string()),
  region: v.optional(v.string()),
  city: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  timezone: v.optional(v.string()),
});

/**
 * Public — called from the embeddable widget after the visitor submits
 * the pre-chat form (Name / Email / Phone / Message).
 *
 * Identifies (or creates) a visitor for a brand and starts a fresh
 * conversation if the visitor doesn't have an open one.
 *
 * Authorisation: brand is identified by its public widgetId. No session
 * token — this is the entry point for end-users on customer websites
 * who have no account.
 */
export const identifyAndStartConversation = mutation({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    // Pre-chat form fields — required by the widget UI before chat starts.
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    customData: v.optional(v.string()),
    // Captured by the widget (or the Next.js API route in front of it).
    ip: v.optional(v.string()),
    location: v.optional(locationValidator),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
    brandId: v.id("brands"),
  }),
  handler: async (ctx, args) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) throw new Error("Unknown widget.");

    const now = Date.now();

    // Look for existing visitor for THIS brand. A visitor on Brand A is a
    // separate identity from the same person on Brand B by design.
    let visitor = await ctx.db
      .query("visitors")
      .withIndex("by_brand_visitor_key", (q) =>
        q.eq("brandId", brand._id).eq("visitorKey", args.visitorKey),
      )
      .unique();

    if (visitor) {
      // Update fields the visitor newly provided. Don't clobber existing
      // values with empty ones from a re-prompt.
      const patch: Record<string, unknown> = { lastSeenAt: now };
      if (args.name && !visitor.name) patch.name = args.name;
      if (args.email && !visitor.email) patch.email = args.email;
      if (args.phone && !visitor.phone) patch.phone = args.phone;
      if (args.ip) patch.ip = args.ip;
      if (args.location) patch.location = args.location;
      await ctx.db.patch(visitor._id, patch);
    } else {
      const visitorId = await ctx.db.insert("visitors", {
        workspaceId: brand.workspaceId,
        brandId: brand._id,
        visitorKey: args.visitorKey,
        name: args.name,
        email: args.email,
        phone: args.phone,
        ip: args.ip,
        location: args.location,
        customData: args.customData,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(visitorId))!;
    }

    // Reuse open conversation if one exists.
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_visitor", (q) =>
        q.eq("workspaceId", brand.workspaceId).eq("visitorId", visitor._id),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();

    if (existing) {
      // Backfill brandId on the existing conversation if it predates the
      // multi-brand migration on this row.
      if (!existing.brandId) {
        await ctx.db.patch(existing._id, { brandId: brand._id });
      }
      return {
        conversationId: existing._id,
        visitorId: visitor._id,
        brandId: brand._id,
      };
    }

    const conversationId = await ctx.db.insert("conversations", {
      workspaceId: brand.workspaceId,
      brandId: brand._id,
      visitorId: visitor._id,
      channel: "web_chat",
      status: "open",
      lastMessageAt: now,
      createdAt: now,
    });

    await fireEvent(ctx, brand.workspaceId, "conversation.created", {
      conversationId,
      brandId: brand._id,
      visitorId: visitor._id,
      visitor: {
        name: visitor.name,
        email: visitor.email,
        phone: visitor.phone,
        ip: visitor.ip,
        location: visitor.location,
      },
    });

    return {
      conversationId,
      visitorId: visitor._id,
      brandId: brand._id,
    };
  },
});

/**
 * Public — visitor sends a message. No auth (widget side); the conversation
 * id + visitorKey are validated against the brand's widgetId.
 */
export const sendVisitorMessage = mutation({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    conversationId: v.id("conversations"),
    body: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) throw new Error("Unknown widget.");

    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== brand.workspaceId) {
      throw new Error("Conversation not found.");
    }

    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor || visitor.visitorKey !== args.visitorKey) {
      throw new Error("Visitor mismatch.");
    }

    const body = args.body.trim();
    if (!body) throw new Error("Message body required.");

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      workspaceId: brand.workspaceId,
      brandId: convo.brandId ?? brand._id,
      channel: convo.channel ?? "web_chat",
      role: "visitor",
      body,
      createdAt: now,
    });

    await ctx.db.patch(args.conversationId, { lastMessageAt: now });

    await fireEvent(ctx, brand.workspaceId, "message.created", {
      messageId,
      conversationId: args.conversationId,
      brandId: convo.brandId ?? brand._id,
      channel: convo.channel ?? "web_chat",
      role: "visitor",
      body,
      createdAt: now,
    });

    // Atlas evaluates every visitor message. The action checks whether
    // the workspace has a configured key; if not it logs a "skipped"
    // run for the dashboard banner and does nothing else.
    await ctx.scheduler.runAfter(0, internal.atlas.evaluate, {
      workspaceId: brand.workspaceId,
      conversationId: args.conversationId,
      triggerMessageId: messageId,
    });

    return messageId;
  },
});

/**
 * Public — visitor-initiated precise location share. Called from the
 * widget after the visitor taps the location button and the browser's
 * native geolocation prompt resolves with success.
 *
 * Merges into the existing `location` object — IP-derived city/country
 * are kept (browser GPS doesn't provide reverse-geocoded names) and
 * lat/lng are overwritten with the precise values.
 */
export const setPreciseLocation = mutation({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    lat: v.number(),
    lng: v.number(),
    accuracy: v.optional(v.number()), // meters
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) throw new ConvexError("Unknown widget.");

    const visitor = await ctx.db
      .query("visitors")
      .withIndex("by_brand_visitor_key", (q) =>
        q.eq("brandId", brand._id).eq("visitorKey", args.visitorKey),
      )
      .unique();
    if (!visitor) throw new ConvexError("Visitor not found.");

    const merged = {
      ...(visitor.location ?? {}),
      lat: args.lat,
      lng: args.lng,
    };
    await ctx.db.patch(visitor._id, {
      location: merged,
      lastSeenAt: Date.now(),
    });
    return null;
  },
});

/**
 * Public — reactive message stream for the visitor's own conversation.
 * Authenticated by (widgetId, visitorKey, conversationId) all matching
 * the conversation's stored brand + visitor.
 */
export const listMessagesForVisitor = query({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) return [];

    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== brand.workspaceId) return [];

    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor || visitor.visitorKey !== args.visitorKey) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .take(200);

    // Internal notes never leak to the visitor.
    return messages
      .filter((m) => m.role !== "internal_note")
      .map((m) => ({
        _id: m._id,
        role: m.role,
        body: m.body,
        createdAt: m.createdAt,
      }));
  },
});

import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Public — called from the embeddable widget. Identifies (or creates)
 * a visitor for a workspace and starts a fresh conversation if the
 * visitor doesn't have an open one.
 *
 * Authorisation: workspace is identified by its public widgetId. No
 * session token — this is the entry point for end-users on customer
 * websites who have no account.
 */
export const identifyAndStartConversation = mutation({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    customData: v.optional(v.string()),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
  }),
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!workspace) throw new Error("Unknown widget.");

    const now = Date.now();

    let visitor = await ctx.db
      .query("visitors")
      .withIndex("by_workspace_visitor_key", (q) =>
        q.eq("workspaceId", workspace._id).eq("visitorKey", args.visitorKey),
      )
      .unique();

    if (visitor) {
      await ctx.db.patch(visitor._id, {
        lastSeenAt: now,
        ...(args.name && !visitor.name ? { name: args.name } : {}),
        ...(args.email && !visitor.email ? { email: args.email } : {}),
      });
    } else {
      const visitorId = await ctx.db.insert("visitors", {
        workspaceId: workspace._id,
        visitorKey: args.visitorKey,
        name: args.name,
        email: args.email,
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
        q.eq("workspaceId", workspace._id).eq("visitorId", visitor._id),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();

    if (existing) {
      return { conversationId: existing._id, visitorId: visitor._id };
    }

    const conversationId = await ctx.db.insert("conversations", {
      workspaceId: workspace._id,
      visitorId: visitor._id,
      status: "open",
      lastMessageAt: now,
      createdAt: now,
    });

    return { conversationId, visitorId: visitor._id };
  },
});

/**
 * Public — visitor sends a message. No auth (widget side); the conversation
 * id + visitorKey are validated against the workspace's widgetId.
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
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!workspace) throw new Error("Unknown widget.");

    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspace._id) {
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
      workspaceId: workspace._id,
      role: "visitor",
      body,
      createdAt: now,
    });

    await ctx.db.patch(args.conversationId, { lastMessageAt: now });
    return messageId;
  },
});

/**
 * Public — reactive message stream for the visitor's own conversation.
 * Authenticated by (widgetId, visitorKey, conversationId) all matching
 * the conversation's stored workspace + visitor. The widget subscribes
 * to this so operator replies stream live into the chat panel.
 */
export const listMessagesForVisitor = query({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!workspace) return [];

    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspace._id) return [];

    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor || visitor.visitorKey !== args.visitorKey) return [];

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .take(200);

    // Strip operator id and other internal fields — visitor only sees
    // role + body + createdAt.
    return messages.map((m) => ({
      _id: m._id,
      role: m.role,
      body: m.body,
      createdAt: m.createdAt,
    }));
  },
});

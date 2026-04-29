import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { fireEvent } from "./webhooks";

/**
 * Public REST API helpers.
 *
 * These are `internal*` functions called from `convex/http.ts` after the
 * caller is already authenticated via API key. They accept `workspaceId`
 * directly and apply the same business rules the dashboard mutations do
 * (validators, brand-scoping, etc.) — but skip the sessionToken /
 * brandAccess layer because API keys have full workspace access.
 *
 * If you need scoped API keys later (per-brand), add a `brandId?` field
 * to the apiKeys table and gate these helpers on it.
 */

// ── Conversations ─────────────────────────────────────────────────────

export const listConversations = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.union(
      v.null(),
      v.literal("open"),
      v.literal("snoozed"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
    brandId: v.union(v.null(), v.id("brands")),
    limit: v.number(),
  },
  handler: async (ctx, args) => {
    const status = args.status ?? "open";
    let conversations: Doc<"conversations">[];

    if (args.brandId) {
      conversations = await ctx.db
        .query("conversations")
        .withIndex("by_brand_status_lastmsg", (q) =>
          q.eq("brandId", args.brandId!).eq("status", status),
        )
        .order("desc")
        .take(args.limit);
    } else {
      const all = await ctx.db
        .query("conversations")
        .withIndex("by_workspace_status_lastmsg", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("status", status),
        )
        .order("desc")
        .take(args.limit);
      conversations = all;
    }

    return await Promise.all(
      conversations.map(async (c) => {
        const visitor = await ctx.db.get(c.visitorId);
        const brand: Doc<"brands"> | null = c.brandId
          ? await ctx.db.get(c.brandId)
          : null;
        return shapeConversation(c, visitor, brand);
      }),
    );
  },
});

export const getConversation = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const c = await ctx.db.get(args.conversationId);
    if (!c || c.workspaceId !== args.workspaceId) return null;
    const visitor = await ctx.db.get(c.visitorId);
    const brand: Doc<"brands"> | null = c.brandId
      ? await ctx.db.get(c.brandId)
      : null;
    return shapeConversation(c, visitor, brand);
  },
});

export const sendOperatorMessage = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    body: v.string(),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== args.workspaceId) {
      throw new Error("Conversation not found.");
    }
    const body = args.body.trim();
    if (!body) throw new Error("Message body required.");

    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      workspaceId: args.workspaceId,
      brandId: convo.brandId,
      channel: convo.channel,
      role: "operator",
      body,
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
      status: convo.status === "snoozed" ? "open" : convo.status,
    });

    await fireEvent(ctx, args.workspaceId, "message.created", {
      messageId,
      conversationId: args.conversationId,
      brandId: convo.brandId,
      channel: convo.channel,
      role: "operator",
      via: "api",
      body,
      createdAt: now,
    });

    return messageId;
  },
});

export const setConversationStatus = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    status: v.union(
      v.literal("open"),
      v.literal("snoozed"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== args.workspaceId) {
      throw new Error("Conversation not found.");
    }
    await ctx.db.patch(args.conversationId, {
      status: args.status,
      resolvedBy: args.status === "resolved" ? "operator" : undefined,
    });
    await fireEvent(ctx, args.workspaceId, "conversation.status_changed", {
      conversationId: args.conversationId,
      brandId: convo.brandId,
      previousStatus: convo.status,
      status: args.status,
      via: "api",
    });
    return null;
  },
});

// ── Messages ──────────────────────────────────────────────────────────

export const listMessages = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== args.workspaceId) return [];
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .take(500);
    return messages.map((m) => ({
      id: m._id,
      conversationId: m.conversationId,
      brandId: m.brandId,
      role: m.role,
      body: m.body,
      createdAt: m.createdAt,
    }));
  },
});

// ── Brands ────────────────────────────────────────────────────────────

export const listBrands = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const brands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return brands.map((b) => ({
      id: b._id,
      slug: b.slug,
      name: b.name,
      widgetId: b.widgetId,
      primaryColor: b.primaryColor,
      welcomeMessage: b.welcomeMessage,
      position: b.position,
    }));
  },
});

// ── Leads ─────────────────────────────────────────────────────────────

export const listLeads = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.union(
      v.null(),
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("won"),
      v.literal("lost"),
    ),
    brandId: v.union(v.null(), v.id("brands")),
  },
  handler: async (ctx, args) => {
    let leads: Doc<"leads">[];
    if (args.status) {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_workspace_status_updated", (q) =>
          q.eq("workspaceId", args.workspaceId).eq("status", args.status!),
        )
        .order("desc")
        .take(200);
    } else {
      leads = await ctx.db
        .query("leads")
        .withIndex("by_workspace_status_updated", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .order("desc")
        .take(200);
    }
    if (args.brandId) {
      leads = leads.filter((l) => l.brandId === args.brandId);
    }
    return leads.map(shapeLead);
  },
});

export const createLead = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("qualified"),
        v.literal("won"),
        v.literal("lost"),
      ),
    ),
  },
  returns: v.id("leads"),
  handler: async (ctx, args) => {
    const name = args.name.trim();
    if (!name) throw new Error("Lead name is required.");

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.workspaceId !== args.workspaceId) {
        throw new Error("Brand not found.");
      }
    }

    // API-created leads don't have a session operator. We pick the
    // workspace's owner as createdBy so the row still satisfies the
    // schema's `createdBy: v.id("operators")` validator.
    const owner = await pickOwner(ctx, args.workspaceId);

    const now = Date.now();
    const leadId = await ctx.db.insert("leads", {
      workspaceId: args.workspaceId,
      brandId: args.brandId,
      name,
      email: args.email,
      phone: args.phone,
      notes: args.notes,
      status: args.status ?? "new",
      createdBy: owner._id,
      createdAt: now,
      updatedAt: now,
    });

    await fireEvent(ctx, args.workspaceId, "lead.created", {
      leadId,
      brandId: args.brandId,
      name,
      email: args.email,
      phone: args.phone,
      status: args.status ?? "new",
      via: "api",
    });

    return leadId;
  },
});

export const updateLead = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    notes: v.optional(v.string()),
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("qualified"),
        v.literal("won"),
        v.literal("lost"),
      ),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const lead = await ctx.db.get(args.leadId);
    if (!lead || lead.workspaceId !== args.workspaceId) {
      throw new Error("Lead not found.");
    }
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.email !== undefined) patch.email = args.email;
    if (args.phone !== undefined) patch.phone = args.phone;
    if (args.notes !== undefined) patch.notes = args.notes;
    if (args.status !== undefined && args.status !== lead.status) {
      patch.status = args.status;
      await fireEvent(ctx, args.workspaceId, "lead.status_changed", {
        leadId: args.leadId,
        previousStatus: lead.status,
        status: args.status,
        via: "api",
      });
    }
    await ctx.db.patch(args.leadId, patch);
    return null;
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

function shapeConversation(
  c: Doc<"conversations">,
  visitor: Doc<"visitors"> | null,
  brand: Doc<"brands"> | null,
) {
  return {
    id: c._id,
    brandId: c.brandId,
    visitorId: c.visitorId,
    status: c.status,
    lastMessageAt: c.lastMessageAt,
    createdAt: c.createdAt,
    visitor: visitor
      ? {
          id: visitor._id,
          name: visitor.name,
          email: visitor.email,
          phone: visitor.phone,
          ip: visitor.ip,
          location: visitor.location,
        }
      : null,
    brand: brand
      ? {
          id: brand._id,
          name: brand.name,
          primaryColor: brand.primaryColor,
        }
      : null,
  };
}

function shapeLead(l: Doc<"leads">) {
  return {
    id: l._id,
    name: l.name,
    email: l.email,
    phone: l.phone,
    status: l.status,
    notes: l.notes,
    brandId: l.brandId,
    conversationId: l.conversationId,
    location: l.location,
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

async function pickOwner(
  ctx: { db: { query: any } },
  workspaceId: Id<"workspaces">,
): Promise<Doc<"operators">> {
  const operators = await ctx.db
    .query("operators")
    .withIndex("by_workspace_email", (q: any) =>
      q.eq("workspaceId", workspaceId),
    )
    .collect();
  const owner = operators.find((o: Doc<"operators">) => o.role === "owner");
  if (owner) return owner;
  if (operators.length > 0) return operators[0];
  throw new Error("Workspace has no operators.");
}

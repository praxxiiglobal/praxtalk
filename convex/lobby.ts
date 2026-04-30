import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";

const fieldValidator = v.object({
  id: v.string(),
  label: v.string(),
  type: v.union(
    v.literal("text"),
    v.literal("textarea"),
    v.literal("select"),
    v.literal("email"),
    v.literal("phone"),
  ),
  required: v.boolean(),
  options: v.optional(v.array(v.string())),
  placeholder: v.optional(v.string()),
});

// ── Dashboard CRUD ────────────────────────────────────────────────────

/**
 * List every lobby config in the workspace — workspace default + per
 * brand. The dashboard uses this to render the editor.
 */
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const configs = await ctx.db
      .query("lobbyConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return configs.map((c) => ({
      _id: c._id,
      brandId: c.brandId ?? null,
      enabled: c.enabled,
      title: c.title,
      fields: c.fields,
      updatedAt: c.updatedAt,
    }));
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    brandId: v.optional(v.id("brands")), // null/undefined = workspace default
    enabled: v.boolean(),
    title: v.string(),
    fields: v.array(fieldValidator),
  },
  returns: v.id("lobbyConfigs"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can configure the lobby.",
      );
    }
    if (!args.title.trim()) {
      throw new ConvexError("Title is required.");
    }
    // Sanity-check field IDs are unique + non-empty.
    const ids = new Set<string>();
    for (const f of args.fields) {
      if (!f.id.trim()) throw new ConvexError("Every field needs an id.");
      if (ids.has(f.id)) {
        throw new ConvexError(`Duplicate field id: ${f.id}`);
      }
      ids.add(f.id);
      if (f.type === "select" && (!f.options || f.options.length === 0)) {
        throw new ConvexError(
          `Select field "${f.label}" needs at least one option.`,
        );
      }
    }

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.workspaceId !== workspaceId) {
        throw new ConvexError("Brand not found in this workspace.");
      }
    }

    const now = Date.now();
    const all = await ctx.db
      .query("lobbyConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const existing = all.find(
      (c) => (c.brandId ?? null) === (args.brandId ?? null),
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        enabled: args.enabled,
        title: args.title.trim(),
        fields: args.fields,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("lobbyConfigs", {
      workspaceId,
      brandId: args.brandId,
      enabled: args.enabled,
      title: args.title.trim(),
      fields: args.fields,
      createdBy: operator._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), configId: v.id("lobbyConfigs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can configure the lobby.",
      );
    }
    const c = await ctx.db.get(args.configId);
    if (!c || c.workspaceId !== workspaceId) {
      throw new ConvexError("Lobby config not found.");
    }
    await ctx.db.delete(args.configId);
    return null;
  },
});

// ── Public — used by the widget ───────────────────────────────────────

/**
 * Fetch the active lobby config for a given widget. Brand-specific
 * config wins; falls back to workspace default. Returns null if none
 * is enabled.
 */
export const getForWidget = query({
  args: { widgetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      title: v.string(),
      fields: v.array(fieldValidator),
    }),
  ),
  handler: async (ctx, { widgetId }) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", widgetId))
      .unique();
    if (!brand) return null;

    const all = await ctx.db
      .query("lobbyConfigs")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", brand.workspaceId),
      )
      .collect();
    // Prefer brand-specific over workspace default.
    const specific = all.find((c) => c.brandId === brand._id && c.enabled);
    const fallback = all.find((c) => !c.brandId && c.enabled);
    const chosen = specific ?? fallback;
    if (!chosen) return null;
    return { title: chosen.title, fields: chosen.fields };
  },
});

/**
 * Visitor submits the lobby form. The widget calls this right after
 * `identifyAndStartConversation` returns so we can attach the response
 * to that conversation.
 */
export const submitIntake = mutation({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    conversationId: v.id("conversations"),
    answers: v.string(), // JSON
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) throw new ConvexError("Unknown widget.");

    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== brand.workspaceId) {
      throw new ConvexError("Conversation not found.");
    }
    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor || visitor.visitorKey !== args.visitorKey) {
      throw new ConvexError("Visitor mismatch.");
    }

    // Replace any prior intake on the same conversation. Visitors
    // sometimes resubmit; we keep the latest.
    const prior = await ctx.db
      .query("intakeResponses")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .first();
    if (prior) await ctx.db.delete(prior._id);

    await ctx.db.insert("intakeResponses", {
      conversationId: args.conversationId,
      workspaceId: brand.workspaceId,
      brandId: convo.brandId ?? brand._id,
      answers: args.answers,
      submittedAt: Date.now(),
    });
    return null;
  },
});

// ── Inbox query — operator views the intake response ─────────────────

export const getResponseForConversation = query({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
  },
  returns: v.union(
    v.null(),
    v.object({
      answers: v.string(),
      submittedAt: v.number(),
      fields: v.array(fieldValidator), // for label rendering
    }),
  ),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return null;

    const response = await ctx.db
      .query("intakeResponses")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .first();
    if (!response) return null;

    // Hydrate with the lobby config that produced it so the inbox can
    // render labels (not just field ids) — fall back to workspace
    // default if the brand-specific one was deleted.
    const all = await ctx.db
      .query("lobbyConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const specific = all.find((c) => c.brandId === convo.brandId);
    const fallback = all.find((c) => !c.brandId);
    const config = specific ?? fallback;

    return {
      answers: response.answers,
      submittedAt: response.submittedAt,
      fields: config?.fields ?? [],
    };
  },
});

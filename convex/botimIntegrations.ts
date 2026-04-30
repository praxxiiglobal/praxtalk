import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";

/**
 * Botim integration — UAE messaging app.
 *
 * Status as of 2026-04-30: Botim does not expose a public self-serve
 * messaging API like Meta's WhatsApp Cloud API. Their parent (Astro
 * Tech) offers business messaging through partnership-only channels.
 *
 * What this module does today:
 *   - Captures the workspace's Botim Business profile (display name,
 *     contact email, optional credentials) so it's pre-configured.
 *   - The dashboard surface shows a "pending API access" banner until
 *     the integration is flipped active by an admin who actually has
 *     working credentials.
 *
 * When Botim opens API access (or a partnership is signed) the same
 * row will drive inbound + outbound, mirroring the WhatsApp module.
 */

// ── Dashboard CRUD ────────────────────────────────────────────────────

export const get = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const integration = await ctx.db
      .query("botimIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (!integration) return null;
    return {
      _id: integration._id,
      businessAccountId: integration.businessAccountId,
      hasApiKey: Boolean(integration.apiKey),
      apiKeyPreview: integration.apiKey
        ? integration.apiKey.slice(0, 6) + "…"
        : null,
      displayName: integration.displayName,
      contactEmail: integration.contactEmail,
      enabled: integration.enabled,
      apiAvailable: integration.apiAvailable,
      createdAt: integration.createdAt,
    };
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    displayName: v.string(),
    contactEmail: v.string(),
    businessAccountId: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
    apiAvailable: v.optional(v.boolean()),
  },
  returns: v.id("botimIntegrations"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError("Only admins and owners can configure Botim.");
    }
    if (!args.displayName.trim()) {
      throw new ConvexError("Display name is required.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.contactEmail)) {
      throw new ConvexError("Contact email must be a valid email.");
    }

    const existing = await ctx.db
      .query("botimIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        displayName: args.displayName.trim(),
        contactEmail: args.contactEmail.trim(),
        businessAccountId: args.businessAccountId?.trim() || undefined,
      };
      if (args.apiKey && args.apiKey.trim()) {
        patch.apiKey = args.apiKey.trim();
      }
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      if (args.apiAvailable !== undefined) {
        patch.apiAvailable = args.apiAvailable;
      }
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("botimIntegrations", {
      workspaceId,
      displayName: args.displayName.trim(),
      contactEmail: args.contactEmail.trim(),
      businessAccountId: args.businessAccountId?.trim() || undefined,
      apiKey: args.apiKey?.trim() || undefined,
      enabled: args.enabled ?? false,
      apiAvailable: args.apiAvailable ?? false,
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
        "Only admins and owners can remove the Botim integration.",
      );
    }
    const existing = await ctx.db
      .query("botimIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

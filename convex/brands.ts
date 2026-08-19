import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { generateWidgetId, slugify } from "./lib/auth";
import { requireOperator } from "./auth";
import { pushActivity } from "./notifications";

// Launcher-bubble size bounds (px). Shared with the dashboard slider and
// enforced server-side so a bad value can never reach the widget. The
// widget itself defaults to 64 when the field is unset.
export const LAUNCHER_SIZE_MIN = 48;
export const LAUNCHER_SIZE_MAX = 88;

/**
 * List every brand the caller can access. Admins/owners (`brandAccess: "all"`)
 * see all brands in their workspace. Scoped agents see only the brands in
 * their `brandAccess` array.
 */
export const listMine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);

    const all = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    const accessible = filterByAccess(all, operator);
    return accessible.map(toPublicBrand);
  },
});

/**
 * Get one brand by id, scoped to the caller's workspace + brand access.
 */
export const getById = query({
  args: { sessionToken: v.string(), brandId: v.id("brands") },
  handler: async (ctx, { sessionToken, brandId }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);
    const brand = await ctx.db.get(brandId);
    if (!brand || brand.workspaceId !== workspaceId) return null;
    if (!hasBrandAccess(operator, brand._id)) return null;
    return toPublicBrand(brand);
  },
});

/**
 * Create a new brand. Admins + owners only.
 */
export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    primaryColor: v.optional(v.string()),
    welcomeMessage: v.optional(v.string()),
    position: v.optional(v.union(v.literal("br"), v.literal("bl"))),
  },
  returns: v.object({
    brandId: v.id("brands"),
    widgetId: v.string(),
  }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can create brands.");
    }

    const name = args.name.trim();
    if (!name) throw new Error("Brand name is required.");

    const slug = slugify(name);
    if (!slug) throw new Error("Brand name must contain letters or numbers.");

    const dupe = await ctx.db
      .query("brands")
      .withIndex("by_workspace_slug", (q) =>
        q.eq("workspaceId", workspaceId).eq("slug", slug),
      )
      .unique();
    if (dupe) throw new Error(`A brand named "${name}" already exists.`);

    const widgetId = generateWidgetId();
    const brandId = await ctx.db.insert("brands", {
      workspaceId,
      slug,
      name,
      widgetId,
      primaryColor: args.primaryColor ?? "#0F1A12",
      welcomeMessage:
        args.welcomeMessage ?? `Hi! How can the ${name} team help?`,
      position: args.position ?? "br",
      createdAt: Date.now(),
    });

    await pushActivity(ctx, {
      workspaceId,
      kind: "brand_created",
      severity: "info",
      title: `Brand created: ${name}`,
      body: `Widget id ${widgetId}`,
      link: "/app/brands",
    });

    return { brandId, widgetId };
  },
});

/**
 * Update a brand's metadata. Admins + owners only.
 */
export const update = mutation({
  args: {
    sessionToken: v.string(),
    brandId: v.id("brands"),
    name: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    welcomeMessage: v.optional(v.string()),
    position: v.optional(v.union(v.literal("br"), v.literal("bl"))),
    avatarUrl: v.optional(v.string()),
    bubbleIcon: v.optional(v.union(v.literal("logo"), v.literal("glyph"))),
    launcherSize: v.optional(v.number()),
    businessHours: v.optional(v.string()),
    waMePhone: v.optional(v.string()),
    waMePrefilledMessage: v.optional(v.string()),
    askIdentityInChat: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can edit brands.");
    }

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.workspaceId !== workspaceId) {
      throw new Error("Brand not found.");
    }

    const patch: Partial<Doc<"brands">> = {};
    if (args.name !== undefined) {
      const name = args.name.trim();
      if (!name) throw new Error("Brand name cannot be empty.");
      patch.name = name;
      patch.slug = slugify(name) || brand.slug;
    }
    if (args.primaryColor !== undefined) patch.primaryColor = args.primaryColor;
    if (args.welcomeMessage !== undefined)
      patch.welcomeMessage = args.welcomeMessage;
    if (args.position !== undefined) patch.position = args.position;
    if (args.avatarUrl !== undefined) {
      // Empty string clears the logo (patch with undefined removes).
      const trimmed = args.avatarUrl.trim();
      patch.avatarUrl = trimmed.length === 0 ? undefined : trimmed;
    }
    if (args.bubbleIcon !== undefined) patch.bubbleIcon = args.bubbleIcon;
    if (args.launcherSize !== undefined) {
      // Clamp to a safe range so a bad slider value can't break the
      // widget layout. Round to the nearest even px to match the slider.
      const n = Math.round(args.launcherSize / 2) * 2;
      patch.launcherSize = Math.max(
        LAUNCHER_SIZE_MIN,
        Math.min(LAUNCHER_SIZE_MAX, n),
      );
    }
    if (args.businessHours !== undefined)
      patch.businessHours = args.businessHours;
    if (args.waMePhone !== undefined) {
      // Strip non-digits and leading '+'. Empty string clears.
      const digits = args.waMePhone.replace(/[^\d]/g, "");
      patch.waMePhone = digits.length === 0 ? undefined : digits;
    }
    if (args.waMePrefilledMessage !== undefined) {
      const trimmed = args.waMePrefilledMessage.trim();
      patch.waMePrefilledMessage = trimmed.length === 0 ? undefined : trimmed;
    }
    if (args.askIdentityInChat !== undefined) {
      patch.askIdentityInChat = args.askIdentityInChat;
    }

    await ctx.db.patch(args.brandId, patch);
    return null;
  },
});

/**
 * Delete a brand. Owner-only. Refuses if the brand still has conversations
 * or visitors attached — a workspace admin must migrate them first or
 * resolve them.
 */
export const remove = mutation({
  args: { sessionToken: v.string(), brandId: v.id("brands") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role !== "owner") {
      throw new Error("Only the workspace owner can delete a brand.");
    }

    const brand = await ctx.db.get(args.brandId);
    if (!brand || brand.workspaceId !== workspaceId) {
      throw new Error("Brand not found.");
    }

    const inUse = await ctx.db
      .query("conversations")
      .withIndex("by_brand_status_lastmsg", (q) =>
        q.eq("brandId", args.brandId),
      )
      .first();
    if (inUse) {
      throw new Error(
        "Brand has conversations attached. Resolve or reassign them before deleting.",
      );
    }

    await ctx.db.delete(args.brandId);
    return null;
  },
});

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Returns the workspace's "default" brand — the oldest one, which is
 * the seed brand created at workspace setup. Used by channel
 * integrations (email/voice/whatsapp) that aren't yet wired to a
 * specific brand and need to stamp brandId on visitors/conversations
 * to satisfy the schema.
 *
 * Throws if the workspace has zero brands — that should be impossible
 * (workspace setup always seeds one).
 */
export async function getDefaultBrandId(
  ctx: { db: { query: any } },
  workspaceId: Id<"workspaces">,
): Promise<Id<"brands">> {
  const oldest = await ctx.db
    .query("brands")
    .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspaceId))
    .order("asc")
    .first();
  if (!oldest) {
    throw new Error(
      `Workspace ${workspaceId} has no brands — setup never completed?`,
    );
  }
  return oldest._id;
}

export function hasBrandAccess(
  operator: Doc<"operators">,
  brandId: Id<"brands">,
): boolean {
  // Default during Phase 1: no access list set means full access
  // (the migration backfills "all" for every existing operator).
  if (!operator.brandAccess || operator.brandAccess === "all") return true;
  return operator.brandAccess.includes(brandId);
}

function filterByAccess(
  brands: Doc<"brands">[],
  operator: Doc<"operators">,
): Doc<"brands">[] {
  if (!operator.brandAccess || operator.brandAccess === "all") return brands;
  const accessSet = new Set(operator.brandAccess);
  return brands.filter((b) => accessSet.has(b._id));
}

function toPublicBrand(b: Doc<"brands">) {
  return {
    _id: b._id,
    slug: b.slug,
    name: b.name,
    widgetId: b.widgetId,
    primaryColor: b.primaryColor,
    welcomeMessage: b.welcomeMessage,
    position: b.position,
    avatarUrl: b.avatarUrl,
    bubbleIcon: b.bubbleIcon,
    launcherSize: b.launcherSize,
    businessHours: b.businessHours,
    waMePhone: b.waMePhone,
    waMePrefilledMessage: b.waMePrefilledMessage,
    askIdentityInChat: b.askIdentityInChat,
    createdAt: b.createdAt,
  };
}

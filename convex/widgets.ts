import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Public — called from the embeddable widget to fetch its display config.
 * Lookup is keyed on the public widgetId, no session token required.
 *
 * The widgetId resolves to a single brand. During the Phase 1 migration,
 * brand widgetIds reuse the legacy workspace.widgetId so existing snippets
 * keep working without a code change on customer sites.
 */
export const getConfigByWidgetId = query({
  args: { widgetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      brandId: v.id("brands"),
      brandName: v.string(),
      primaryColor: v.string(),
      welcomeMessage: v.string(),
      position: v.union(v.literal("br"), v.literal("bl")),
      avatarUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { widgetId }) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", widgetId))
      .unique();
    if (!brand) return null;

    return {
      workspaceId: brand.workspaceId,
      brandId: brand._id,
      brandName: brand.name,
      primaryColor: brand.primaryColor,
      welcomeMessage: brand.welcomeMessage,
      position: brand.position,
      avatarUrl: brand.avatarUrl,
    };
  },
});

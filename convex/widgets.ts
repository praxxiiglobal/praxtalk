import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Public — called from the embeddable widget to fetch its display config.
 * Lookup is keyed on the public widgetId, no session token required.
 */
export const getConfigByWidgetId = query({
  args: { widgetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      workspaceName: v.string(),
      primaryColor: v.string(),
      welcomeMessage: v.string(),
      position: v.union(v.literal("br"), v.literal("bl")),
      avatarUrl: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, { widgetId }) => {
    const workspace = await ctx.db
      .query("workspaces")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", widgetId))
      .unique();
    if (!workspace) return null;

    const config = await ctx.db
      .query("widgetConfigs")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspace._id))
      .unique();
    if (!config) return null;

    return {
      workspaceId: workspace._id,
      workspaceName: workspace.name,
      primaryColor: config.primaryColor,
      welcomeMessage: config.welcomeMessage,
      position: config.position,
      avatarUrl: config.avatarUrl,
    };
  },
});

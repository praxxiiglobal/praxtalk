import { v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { requireOperator } from "./auth";

export const PLAN_LIMITS = {
  spark: 100,
  team: 1000,
  scale: 10000,
  enterprise: 100000,
} as const;

/**
 * Internal: same calc as currentMonth but workspace-scoped, no session
 * gate. Used by atlas.evaluate to check the quota before generating.
 */
export const _quotaForWorkspace = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  returns: v.object({
    aiAutoReplied: v.number(),
    planLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    const workspace = await ctx.db.get(args.workspaceId);
    if (!workspace) throw new Error("Workspace not found.");
    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const runs = await ctx.db
      .query("atlasRuns")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId).gte("createdAt", monthStart),
      )
      .collect();
    return {
      aiAutoReplied: runs.filter((r) => r.status === "auto_replied").length,
      planLimit: PLAN_LIMITS[workspace.plan],
    };
  },
});

export const currentMonth = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    monthStart: v.number(),
    monthEnd: v.number(),
    aiAutoReplied: v.number(),
    planLimit: v.number(),
  }),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const workspace = await ctx.db.get(workspaceId);
    if (!workspace) throw new Error("Workspace not found.");

    const now = new Date();
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);

    const runs = await ctx.db
      .query("atlasRuns")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId).gte("createdAt", monthStart),
      )
      .collect();

    const aiAutoReplied = runs.filter((r) => r.status === "auto_replied").length;

    return {
      monthStart,
      monthEnd,
      aiAutoReplied,
      planLimit: PLAN_LIMITS[workspace.plan],
    };
  },
});

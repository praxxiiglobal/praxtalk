import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { loadSession } from "./auth";
import { isPlatformAdmin } from "./lib/platformAdmin";

/**
 * Cross-tenant queries for the /admin page. Auth gate is the
 * caller's email being in PLATFORM_ADMIN_EMAILS. We reuse the
 * existing operator session cookie (same login flow), but skip
 * the per-tenant requireOperator path because /admin is supposed
 * to span every tenant.
 */
async function requirePlatformAdmin(
  ctx: QueryCtx,
  sessionToken: string,
): Promise<void> {
  const session = await loadSession(ctx, sessionToken);
  if (!session) throw new ConvexError("Not authenticated.");
  const operator = await ctx.db.get(session.operatorId);
  if (!operator) throw new ConvexError("Operator not found.");
  if (!isPlatformAdmin(operator.email)) {
    throw new ConvexError("Not a platform admin.");
  }
}

/**
 * Every workspace on the platform with per-workspace counts. Cheap
 * for ~hundreds of workspaces; switch to denormalised counters on
 * the workspace doc once we cross ~1k tenants.
 */
export const listWorkspaces = query({
  args: { sessionToken: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("workspaces"),
      slug: v.string(),
      name: v.string(),
      plan: v.union(
        v.literal("spark"),
        v.literal("team"),
        v.literal("scale"),
        v.literal("enterprise"),
      ),
      subscriptionStatus: v.union(
        v.literal("active"),
        v.literal("past_due"),
        v.literal("cancelled"),
        v.literal("paused"),
        v.null(),
      ),
      subscriptionProvider: v.union(
        v.literal("paypal"),
        v.literal("razorpay"),
        v.null(),
      ),
      createdAt: v.number(),
      operatorCount: v.number(),
      brandCount: v.number(),
      conversationCount: v.number(),
      atlasRunsThisMonth: v.number(),
      lastActivityAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);

    const workspaces = await ctx.db.query("workspaces").collect();
    const monthStart = startOfMonth(Date.now());

    return await Promise.all(
      workspaces.map(async (ws) => {
        const operators = await ctx.db
          .query("operators")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", ws._id),
          )
          .collect();
        const brands = await ctx.db
          .query("brands")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id))
          .collect();
        // Conversations + last activity together — order by lastMessageAt
        // desc, take 1 + count separately. For workspaces with many
        // conversations, .collect() can be expensive; bound at 5k for
        // counting.
        const convos = await ctx.db
          .query("conversations")
          .withIndex("by_workspace_lastmsg", (q) =>
            q.eq("workspaceId", ws._id),
          )
          .order("desc")
          .take(5_000);
        const atlasRuns = await ctx.db
          .query("atlasRuns")
          .withIndex("by_workspace_created", (q) =>
            q.eq("workspaceId", ws._id),
          )
          .collect();
        const atlasThisMonth = atlasRuns.filter(
          (r) => r.createdAt >= monthStart,
        ).length;
        return {
          _id: ws._id,
          slug: ws.slug,
          name: ws.name,
          plan: ws.plan,
          subscriptionStatus: ws.subscriptionStatus ?? null,
          subscriptionProvider: ws.subscriptionProvider ?? null,
          createdAt: ws.createdAt,
          operatorCount: operators.length,
          brandCount: brands.length,
          conversationCount: convos.length,
          atlasRunsThisMonth: atlasThisMonth,
          lastActivityAt: convos[0]?.lastMessageAt ?? null,
        };
      }),
    );
  },
});

/**
 * Per-workspace drill-down. Returns the workspace doc + operator
 * roster + recent conversations. Same auth gate.
 */
export const getWorkspace = query({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    const ws = await ctx.db.get(args.workspaceId);
    if (!ws) return null;
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_workspace_email", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();
    const brands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const recentConvos = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_lastmsg", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(20);
    return {
      workspace: {
        _id: ws._id,
        slug: ws.slug,
        name: ws.name,
        plan: ws.plan,
        subscriptionStatus: ws.subscriptionStatus ?? null,
        subscriptionProvider: ws.subscriptionProvider ?? null,
        createdAt: ws.createdAt,
      },
      operators: operators.map((o) => ({
        _id: o._id,
        email: o.email,
        name: o.name,
        role: o.role,
        createdAt: o.createdAt,
      })),
      brands: brands.map((b) => ({
        _id: b._id,
        slug: b.slug,
        name: b.name,
        widgetId: b.widgetId,
      })),
      recentConvos: recentConvos.map((c) => ({
        _id: c._id,
        status: c.status,
        channel: c.channel,
        lastMessageAt: c.lastMessageAt,
      })),
    };
  },
});

/**
 * Authn check the Next.js /admin layout calls before rendering —
 * lets us redirect to /login (with a "platform admin only" message)
 * without the page ever flashing.
 */
export const checkPlatformAdmin = query({
  args: { sessionToken: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    if (!args.sessionToken) {
      return { ok: false, reason: "no-session" };
    }
    const session = await loadSession(ctx, args.sessionToken);
    if (!session) return { ok: false, reason: "expired" };
    const operator = await ctx.db.get(session.operatorId);
    if (!operator) return { ok: false, reason: "unknown-operator" };
    if (!isPlatformAdmin(operator.email)) {
      return { ok: false, reason: "not-platform-admin" };
    }
    return { ok: true, reason: "ok" };
  },
});

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

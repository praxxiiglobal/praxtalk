import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";

/**
 * Notifications surface for the dashboard topbar.
 *
 * "Unread" = open conversation whose `lastMessageAt > lastOperatorReadAt`
 * (or where lastOperatorReadAt is unset and the conversation has any
 * visitor messages). It's workspace-level — when any operator opens a
 * conversation, it counts as read for everyone. Per-operator read
 * state lives behind a feature flag (deferred until a customer asks).
 *
 * Reactive: the dashboard topbar subscribes to `summary`, so a new
 * visitor message triggers a re-render in <500ms via Convex websockets.
 * The browser-Notification fan-out is the React side's job.
 */

export const summary = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    unreadCount: v.number(),
    recent: v.array(
      v.object({
        conversationId: v.id("conversations"),
        brandId: v.union(v.null(), v.id("brands")),
        brandName: v.union(v.null(), v.string()),
        brandColor: v.union(v.null(), v.string()),
        visitorName: v.string(),
        lastMessageAt: v.number(),
        channel: v.union(
          v.literal("web_chat"),
          v.literal("email"),
          v.literal("whatsapp"),
          v.literal("voice"),
        ),
      }),
    ),
  }),
  handler: async (ctx, { sessionToken }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);

    // Pull the brand index so we can both gate access AND hydrate the
    // notification rows with brand name + color.
    const allBrands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const brandIndex = new Map(
      allBrands.map((b) => [String(b._id), b]),
    );
    const accessibleBrandIds = new Set(
      allBrands
        .filter((b) => hasBrandAccess(operator, b._id))
        .map((b) => String(b._id)),
    );

    // Open conversations only — resolved/snoozed/closed don't ping.
    const open = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_status_lastmsg", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "open"),
      )
      .order("desc")
      .take(100);

    // Filter by brand access. Email-channel conversations have no brand
    // and are workspace-scoped, so they pass through.
    const visible = open.filter(
      (c) => !c.brandId || accessibleBrandIds.has(String(c.brandId)),
    );

    const unread = visible.filter(isUnread);

    // Pull the freshest 5 to show in the dropdown — but only those that
    // are actually unread, so the bell never lies.
    const top = unread.slice(0, 5);
    const hydrated = await Promise.all(
      top.map(async (c) => {
        const visitor = await ctx.db.get(c.visitorId);
        const brand = c.brandId
          ? brandIndex.get(String(c.brandId)) ?? null
          : null;
        return {
          conversationId: c._id,
          brandId: brand ? brand._id : null,
          brandName: brand ? brand.name : null,
          brandColor: brand ? brand.primaryColor : null,
          visitorName:
            visitor?.name ?? visitor?.email ?? "Anonymous visitor",
          lastMessageAt: c.lastMessageAt,
          channel: c.channel,
        };
      }),
    );

    return { unreadCount: unread.length, recent: hydrated };
  },
});

/**
 * Mark a single conversation read. Called automatically when the
 * operator selects it in the inbox.
 */
export const markRead = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return null;
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) return null;
    await ctx.db.patch(args.conversationId, {
      lastOperatorReadAt: Date.now(),
    });
    return null;
  },
});

/**
 * "Mark all read" — convenience for the bell-icon dropdown footer.
 */
export const markAllRead = mutation({
  args: { sessionToken: v.string() },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const allBrands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const accessibleBrandIds = new Set(
      allBrands
        .filter((b) => hasBrandAccess(operator, b._id))
        .map((b) => String(b._id)),
    );

    const open = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_status_lastmsg", (q) =>
        q.eq("workspaceId", workspaceId).eq("status", "open"),
      )
      .collect();

    const now = Date.now();
    let updated = 0;
    for (const c of open) {
      if (c.brandId && !accessibleBrandIds.has(String(c.brandId))) continue;
      if (!isUnread(c)) continue;
      await ctx.db.patch(c._id, { lastOperatorReadAt: now });
      updated++;
    }
    return { updated };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

function isUnread(c: Doc<"conversations">): boolean {
  if (c.lastOperatorReadAt === undefined) return true;
  return c.lastMessageAt > c.lastOperatorReadAt;
}

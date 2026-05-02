import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";

/**
 * Unified notifications surface for the dashboard topbar and the
 * dedicated /app/notifications page.
 *
 * There are two sources of unread state:
 *   1. **Chat unreads** — derived from open conversations whose
 *      `lastMessageAt > lastOperatorReadAt`. Already implemented;
 *      handles real-time message delivery via Convex websockets.
 *   2. **Activity** — rows in the `notifications` table written by
 *      producers for events like lead created, webhook failed, etc.
 *
 * The summary query merges both into one chronologically-ordered feed
 * and exposes a single `unreadCount` for the bell badge.
 */

// ── Activity helpers (used by other Convex modules) ───────────────────

const NotificationKindValidator = v.union(
  v.literal("lead_created"),
  v.literal("conversation_assigned"),
  v.literal("webhook_failed"),
  v.literal("email_failed"),
  v.literal("atlas_error"),
  v.literal("brand_created"),
  v.literal("operator_added"),
  v.literal("api_key_created"),
  v.literal("human_requested"),
  v.literal("system"),
);

const SeverityValidator = v.union(
  v.literal("info"),
  v.literal("success"),
  v.literal("warn"),
  v.literal("error"),
);

/**
 * Internal-only: insert a notification row. Use the `pushActivity`
 * helper from other Convex mutations rather than calling this directly.
 */
export const insertActivity = mutation({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.optional(v.id("operators")),
    kind: NotificationKindValidator,
    severity: SeverityValidator,
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()),
  },
  returns: v.id("notifications"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("notifications", {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      kind: args.kind,
      severity: args.severity,
      title: args.title,
      body: args.body,
      link: args.link,
      createdAt: Date.now(),
    });
  },
});

/**
 * In-mutation helper for producers. Use from any Convex mutation:
 *   await pushActivity(ctx, { workspaceId, kind, severity, title, ... })
 *
 * Inlines the insert (no scheduler hop) so the activity row is visible
 * the moment the originating mutation commits.
 */
export async function pushActivity(
  ctx: { db: { insert: (table: "notifications", row: Doc<"notifications">) => Promise<Id<"notifications">> } },
  args: {
    workspaceId: Id<"workspaces">;
    operatorId?: Id<"operators">;
    kind: Doc<"notifications">["kind"];
    severity: Doc<"notifications">["severity"];
    title: string;
    body?: string;
    link?: string;
  },
): Promise<Id<"notifications">> {
  return await ctx.db.insert("notifications", {
    workspaceId: args.workspaceId,
    operatorId: args.operatorId,
    kind: args.kind,
    severity: args.severity,
    title: args.title,
    body: args.body,
    link: args.link,
    createdAt: Date.now(),
  } as unknown as Doc<"notifications">);
}

// ── Combined summary (used by the topbar bell) ────────────────────────

export const summary = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    unreadCount: v.number(),
    chatUnreadCount: v.number(),
    activityUnreadCount: v.number(),
    recent: v.array(
      v.object({
        id: v.string(),
        kind: v.string(), // "chat" or one of the activity kinds
        severity: v.union(
          v.literal("info"),
          v.literal("success"),
          v.literal("warn"),
          v.literal("error"),
        ),
        title: v.string(),
        body: v.union(v.null(), v.string()),
        link: v.union(v.null(), v.string()),
        createdAt: v.number(),
        readAt: v.union(v.null(), v.number()),
        // Chat-only:
        brandColor: v.union(v.null(), v.string()),
        brandName: v.union(v.null(), v.string()),
        channel: v.union(
          v.null(),
          v.literal("web_chat"),
          v.literal("email"),
          v.literal("whatsapp"),
          v.literal("voice"),
          v.literal("sms"),
        ),
      }),
    ),
  }),
  handler: async (ctx, { sessionToken }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);

    // ── Chat unreads ──
    const allBrands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const brandIndex = new Map(allBrands.map((b) => [String(b._id), b]));
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
      .order("desc")
      .take(100);

    const visibleChats = open.filter(
      (c) => !c.brandId || accessibleBrandIds.has(String(c.brandId)),
    );
    const unreadChats = visibleChats.filter(isChatUnread);

    const chatRows = await Promise.all(
      unreadChats.slice(0, 20).map(async (c) => {
        const visitor = await ctx.db.get(c.visitorId);
        const brand = c.brandId
          ? brandIndex.get(String(c.brandId)) ?? null
          : null;
        const visitorName =
          visitor?.name ?? visitor?.email ?? "Anonymous visitor";
        return {
          id: String(c._id),
          kind: "chat",
          severity: "info" as const,
          title: visitorName,
          body: brand?.name ?? null,
          link: "/app",
          createdAt: c.lastMessageAt,
          readAt: null,
          brandColor: brand?.primaryColor ?? null,
          brandName: brand?.name ?? null,
          channel: c.channel,
        };
      }),
    );

    // ── Activity rows ──
    const activity = await ctx.db
      .query("notifications")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(50);

    const visibleActivity = activity.filter(
      (n) => !n.operatorId || n.operatorId === operator._id,
    );

    const activityRows = visibleActivity.map((n) => ({
      id: String(n._id),
      kind: n.kind,
      severity: n.severity,
      title: n.title,
      body: n.body ?? null,
      link: n.link ?? null,
      createdAt: n.createdAt,
      readAt: n.readAt ?? null,
      brandColor: null,
      brandName: null,
      channel: null,
    }));

    const activityUnreadCount = activityRows.filter(
      (n) => n.readAt === null,
    ).length;

    // Merge + sort by createdAt descending, cap at 20.
    const recent = [...chatRows, ...activityRows]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 20);

    return {
      unreadCount: chatRows.length + activityUnreadCount,
      chatUnreadCount: chatRows.length,
      activityUnreadCount,
      recent,
    };
  },
});

// ── Per-conversation chat read state ──────────────────────────────────

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

export const markActivityRead = mutation({
  args: {
    sessionToken: v.string(),
    notificationId: v.id("notifications"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const n = await ctx.db.get(args.notificationId);
    if (!n || n.workspaceId !== workspaceId) return null;
    if (!n.readAt) {
      await ctx.db.patch(args.notificationId, { readAt: Date.now() });
    }
    return null;
  },
});

export const markAllRead = mutation({
  args: { sessionToken: v.string() },
  returns: v.object({ updated: v.number() }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );

    // Mark every accessible open conversation read.
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
      if (!isChatUnread(c)) continue;
      await ctx.db.patch(c._id, { lastOperatorReadAt: now });
      updated++;
    }

    // Mark every unread activity notification read.
    const activity = await ctx.db
      .query("notifications")
      .withIndex("by_workspace_unread", (q) =>
        q.eq("workspaceId", workspaceId).eq("readAt", undefined),
      )
      .collect();
    for (const n of activity) {
      await ctx.db.patch(n._id, { readAt: now });
      updated++;
    }

    return { updated };
  },
});

// ── Activity feed (full /app/notifications page) ──────────────────────

export const listActivity = query({
  args: {
    sessionToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const limit = Math.min(args.limit ?? 100, 500);
    const rows = await ctx.db
      .query("notifications")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(limit);
    return rows
      .filter((n) => !n.operatorId || n.operatorId === operator._id)
      .map((n) => ({
        _id: n._id,
        kind: n.kind,
        severity: n.severity,
        title: n.title,
        body: n.body,
        link: n.link,
        readAt: n.readAt,
        createdAt: n.createdAt,
      }));
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

function isChatUnread(c: Doc<"conversations">): boolean {
  if (c.lastOperatorReadAt === undefined) return true;
  return c.lastMessageAt > c.lastOperatorReadAt;
}

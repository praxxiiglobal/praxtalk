import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  type MutationCtx,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";

// ── Live visitor presence ("monitoring") ───────────────────────
// The widget pings `presence:ping` on every page load and then every
// ~20s while the tab is visible. One row per (brand, browser); a ping
// after a 30-minute silence starts a new session. GET /api/v1/presence
// (http.ts) serves the active slice to CRM integrations.

const SESSION_GAP_MS = 30 * 60 * 1000;
const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;

const clip = (s: string | undefined, n: number) =>
  s === undefined ? undefined : String(s).slice(0, n);

// Public, widget-callable — authenticated the same way as the other
// visitor mutations: a valid widgetId scopes everything to one brand,
// and the visitorKey is the browser's own random identity. No secrets
// involved; worst case an attacker inflates presence rows for a brand
// whose widgetId they saw in page source (same trust level tawk.to
// accepts for its monitoring).
export const ping = mutation({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    url: v.string(),
    title: v.optional(v.string()),
    referrer: v.optional(v.string()),
    landing: v.optional(v.string()),
    pageload: v.boolean(),
    ip: v.optional(v.string()),
    // String ("City, Region, Country") or the widget's structured geo
    // object — normalized to a string below. Accepting both keeps old
    // cached widget versions from failing validation silently.
    location: v.optional(v.any()),
    ua: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.visitorKey || args.visitorKey.length > 100) return null;
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) return null;

    const now = Date.now();
    const patch = {
      currentUrl: clip(args.url, 500) ?? "",
      pageTitle: clip(args.title, 200),
      referrer: clip(args.referrer, 500),
      landingUrl: clip(args.landing, 500),
      ...(args.ip ? { ip: clip(args.ip, 60) } : {}),
      ...(args.location
        ? {
            location: clip(
              typeof args.location === "string"
                ? args.location
                : [
                    (args.location as any)?.city,
                    (args.location as any)?.region,
                    (args.location as any)?.country,
                  ]
                    .filter(Boolean)
                    .join(", "),
              120,
            ),
          }
        : {}),
      ...(args.ua ? { userAgent: clip(args.ua, 300) } : {}),
      lastSeenAt: now,
    };

    const existing = await ctx.db
      .query("visitorPresence")
      .withIndex("by_brand_visitor", (q) =>
        q.eq("brandId", brand._id).eq("visitorKey", args.visitorKey),
      )
      .unique();

    if (!existing) {
      await ctx.db.insert("visitorPresence", {
        workspaceId: brand.workspaceId,
        brandId: brand._id,
        visitorKey: args.visitorKey,
        ...patch,
        sessionStartedAt: now,
        pageViews: 1,
        visitCount: 1,
      });
      return null;
    }

    const newSession = now - existing.lastSeenAt > SESSION_GAP_MS;
    await ctx.db.patch(existing._id, {
      ...patch,
      ...(newSession
        ? {
            sessionStartedAt: now,
            pageViews: 1,
            visitCount: existing.visitCount + 1,
          }
        : args.pageload
          ? { pageViews: existing.pageViews + 1 }
          : {}),
    });
    return null;
  },
});

// Active visitors for a workspace (optionally one brand), joined with
// their conversation state so the UI can chip "browsing / opened chat
// / in chat". Serves GET /api/v1/presence.
export const listActive = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    brandId: v.union(v.null(), v.id("brands")),
    activeWindowMs: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoff = Date.now() - args.activeWindowMs;
    const rows = await ctx.db
      .query("visitorPresence")
      .withIndex("by_workspace_lastseen", (q) =>
        q.eq("workspaceId", args.workspaceId).gte("lastSeenAt", cutoff),
      )
      .collect();
    const scoped = args.brandId
      ? rows.filter((r) => r.brandId === args.brandId)
      : rows;

    const brandNames = new Map<string, string>();
    const out = [];
    for (const r of scoped) {
      const bKey = String(r.brandId);
      if (!brandNames.has(bKey)) {
        const b = await ctx.db.get(r.brandId);
        brandNames.set(bKey, b?.name ?? "");
      }
      // Conversation state: does this browser have a conversation on
      // this brand, and has the visitor actually written in it?
      let chatState: "browsing" | "opened_chat" | "chatting" = "browsing";
      let conversationId: Id<"conversations"> | null = null;
      let visitorName: string | null = null;
      const visitor = await ctx.db
        .query("visitors")
        .withIndex("by_brand_visitor_key", (q) =>
          q.eq("brandId", r.brandId).eq("visitorKey", r.visitorKey),
        )
        .unique()
        .catch(() => null);
      if (visitor) {
        visitorName = visitor.name ?? null;
        const convos = await ctx.db
          .query("conversations")
          .withIndex("by_workspace_visitor", (q) =>
            q.eq("workspaceId", args.workspaceId).eq("visitorId", visitor._id),
          )
          .collect()
          .catch(() => [] as Doc<"conversations">[]);
        const latest = convos.sort(
          (a, b) => b.lastMessageAt - a.lastMessageAt,
        )[0];
        if (latest) {
          conversationId = latest._id;
          chatState =
            latest.firstVisitorMessageAt !== undefined
              ? "chatting"
              : "opened_chat";
        }
      }
      out.push({
        visitorKey: r.visitorKey,
        brandId: r.brandId,
        brandName: brandNames.get(bKey) ?? "",
        visitorName,
        currentUrl: r.currentUrl,
        pageTitle: r.pageTitle ?? null,
        referrer: r.referrer ?? null,
        landingUrl: r.landingUrl ?? null,
        ip: r.ip ?? null,
        location: r.location ?? null,
        userAgent: r.userAgent ?? null,
        sessionStartedAt: r.sessionStartedAt,
        lastSeenAt: r.lastSeenAt,
        pageViews: r.pageViews,
        visitCount: r.visitCount,
        chatState,
        conversationId,
      });
    }
    out.sort((a, b) => b.lastSeenAt - a.lastSeenAt);
    return out;
  },
});

// Hourly cron — drop rows idle for a week so the table tracks
// "recently seen browsers", not all of history.
export const _purgeStalePresence = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - PURGE_AFTER_MS;
    const stale = await ctx.db
      .query("visitorPresence")
      .withIndex("by_lastseen", (q) => q.lt("lastSeenAt", cutoff))
      .take(500);
    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    if (stale.length === 500) {
      await ctx.scheduler.runAfter(
        0,
        internal.presence._purgeStalePresence,
        {},
      );
    }
    return null;
  },
});

// ── firstVisitorMessageAt ──────────────────────────────────────

// Stamp the conversation the first time the VISITOR writes. Called
// from every visitor-role message insert path (widget, email,
// WhatsApp, voice). Idempotent.
export async function stampFirstVisitorMessage(
  ctx: MutationCtx,
  conversationId: Id<"conversations">,
): Promise<void> {
  const convo = await ctx.db.get(conversationId);
  if (convo && convo.firstVisitorMessageAt === undefined) {
    await ctx.db.patch(conversationId, { firstVisitorMessageAt: Date.now() });
  }
}

// One-time backfill: walk all conversations in creation order and
// stamp firstVisitorMessageAt from the earliest visitor-role message.
// Self-schedules until done. Trigger once with:
//   npx convex run presence:_backfillFirstVisitorMessageAt '{}' --prod
export const _backfillFirstVisitorMessageAt = internalMutation({
  args: { afterCreationTime: v.optional(v.number()) },
  handler: async (ctx, { afterCreationTime }) => {
    const batch = await ctx.db
      .query("conversations")
      .withIndex("by_creation_time", (q) =>
        q.gt("_creationTime", afterCreationTime ?? 0),
      )
      .order("asc")
      .take(100);
    for (const convo of batch) {
      if (convo.firstVisitorMessageAt !== undefined) continue;
      const msgs = await ctx.db
        .query("messages")
        .withIndex("by_conversation_created", (q) =>
          q.eq("conversationId", convo._id),
        )
        .collect();
      const firstVisitor = msgs
        .filter((m) => m.role === "visitor")
        .sort((a, b) => a.createdAt - b.createdAt)[0];
      if (firstVisitor) {
        await ctx.db.patch(convo._id, {
          firstVisitorMessageAt: firstVisitor.createdAt,
        });
      }
    }
    if (batch.length === 100) {
      await ctx.scheduler.runAfter(
        0,
        internal.presence._backfillFirstVisitorMessageAt,
        { afterCreationTime: batch[batch.length - 1]._creationTime },
      );
    }
    return null;
  },
});

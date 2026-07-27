import { v } from "convex/values";
import {
  mutation,
  query,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

// Typing indicators. Two parties can be typing on a conversation:
//   • the visitor  — signalled from the chat widget (this file's
//     visitor-authed mutation/query)
//   • the operator — signalled from the CRM over REST (the internal
//     mutation/query below, called by the /api/v1/typing http routes)
// Each write just stamps "now" on the party's field; readers decide
// whether that's recent enough to show dots (see TYPING_TTL_MS on the
// clients). Storage is a single upserted row per conversation.

async function stampTyping(
  ctx: MutationCtx,
  workspaceId: Id<"workspaces">,
  conversationId: Id<"conversations">,
  party: "visitor" | "operator",
): Promise<void> {
  const now = Date.now();
  const existing = await ctx.db
    .query("typingStates")
    .withIndex("by_conversation", (q) => q.eq("conversationId", conversationId))
    .unique();
  const patch =
    party === "visitor" ? { visitorTypingAt: now } : { operatorTypingAt: now };
  if (existing) {
    await ctx.db.patch(existing._id, patch);
  } else {
    await ctx.db.insert("typingStates", {
      workspaceId,
      conversationId,
      ...patch,
    });
  }
}

// ── Visitor side (widget) ─────────────────────────────────────────────

// The widget calls this (debounced) while the visitor is typing.
// Auth mirrors listMessagesForVisitor: widgetId → brand → conversation
// workspace/brand match → visitorKey match. Silently no-ops on any
// mismatch so a stale widget can't error-spam.
export const setVisitorTyping = mutation({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) return null;
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== brand.workspaceId) return null;
    if (convo.brandId && convo.brandId !== brand._id) return null;
    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor || visitor.visitorKey !== args.visitorKey) return null;
    await stampTyping(ctx, brand.workspaceId, args.conversationId, "visitor");
    return null;
  },
});

// The widget subscribes to this reactively; it only needs to know
// whether the OPERATOR is currently typing (to show "Agent is
// typing…"). Returns the raw timestamp; the widget applies the TTL.
export const getTypingForVisitor = query({
  args: {
    widgetId: v.string(),
    visitorKey: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args): Promise<{ operatorTypingAt: number | null }> => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", args.widgetId))
      .unique();
    if (!brand) return { operatorTypingAt: null };
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== brand.workspaceId)
      return { operatorTypingAt: null };
    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor || visitor.visitorKey !== args.visitorKey)
      return { operatorTypingAt: null };
    const row = await ctx.db
      .query("typingStates")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .unique();
    return { operatorTypingAt: row?.operatorTypingAt ?? null };
  },
});

// ── Operator side (CRM over REST) ─────────────────────────────────────
// Called by the /api/v1/typing http routes AFTER API-key auth has
// resolved the workspace, so these just verify the conversation is in
// that workspace and read/write the row.

export const setOperatorTyping = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== args.workspaceId) return null;
    await stampTyping(ctx, args.workspaceId, args.conversationId, "operator");
    return null;
  },
});

export const getTypingState = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    visitorTypingAt: number | null;
    operatorTypingAt: number | null;
  } | null> => {
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== args.workspaceId) return null;
    const row = await ctx.db
      .query("typingStates")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .unique();
    return {
      visitorTypingAt: row?.visitorTypingAt ?? null,
      operatorTypingAt: row?.operatorTypingAt ?? null,
    };
  },
});

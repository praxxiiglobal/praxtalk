import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";
import { fireEvent } from "./webhooks";

/**
 * List the inbox for the current operator.
 * Filtered by status (default: open) and optionally by a single brand.
 * If `brandId` is omitted, returns conversations across every brand the
 * operator has access to.
 *
 * Each row carries the visitor preview + brand badge so the inbox UI
 * can render brand-coloured rows without an N+1 fetch.
 */
export const listInbox = query({
  args: {
    sessionToken: v.string(),
    status: v.optional(
      v.union(
        v.literal("open"),
        v.literal("snoozed"),
        v.literal("resolved"),
        v.literal("closed"),
      ),
    ),
    channel: v.optional(
      v.union(
        v.literal("web_chat"),
        v.literal("email"),
        v.literal("whatsapp"),
        v.literal("voice"),
        v.literal("sms"),
      ),
    ),
    brandId: v.optional(v.id("brands")),
    assignee: v.optional(v.union(v.literal("me"), v.literal("unassigned"))),
    // For the dedicated emails view: filter by who-spoke-last instead of
    // status alone. "inbox" = customer's last message; "sent" = our
    // last message. Independent of the status tabs.
    folder: v.optional(
      v.union(v.literal("inbox"), v.literal("sent"), v.literal("all")),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const status = args.status ?? "open";
    const limit = Math.min(args.limit ?? 50, 200);
    const channelFilter = args.channel;
    const assigneeFilter = args.assignee;
    const folderFilter = args.folder;

    // Resolve which brands this operator can see.
    const allBrands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const accessibleBrands = allBrands.filter((b) =>
      hasBrandAccess(operator, b._id),
    );
    const brandIndex = new Map(accessibleBrands.map((b) => [b._id, b]));

    let conversations: Doc<"conversations">[];

    if (args.brandId) {
      // Specific brand requested — verify access.
      const brandId = args.brandId;
      if (!brandIndex.has(brandId)) return [];
      conversations = await ctx.db
        .query("conversations")
        .withIndex("by_brand_status_lastmsg", (q) =>
          q.eq("brandId", brandId).eq("status", status),
        )
        .order("desc")
        .take(limit);
    } else {
      // All accessible brands — fetch by workspace, filter to brand set.
      const all = await ctx.db
        .query("conversations")
        .withIndex("by_workspace_status_lastmsg", (q) =>
          q.eq("workspaceId", workspaceId).eq("status", status),
        )
        .order("desc")
        .take(limit);
      // Allow legacy conversations (no brandId yet) through; the
      // migration will stamp them shortly.
      conversations = all.filter(
        (c) => !c.brandId || brandIndex.has(c.brandId),
      );
    }

    if (channelFilter) {
      conversations = conversations.filter((c) => c.channel === channelFilter);
    }

    if (assigneeFilter === "me") {
      conversations = conversations.filter(
        (c) => c.assignedOperatorId === operator._id,
      );
    } else if (assigneeFilter === "unassigned") {
      conversations = conversations.filter((c) => !c.assignedOperatorId);
    }

    // Folder filter — only meaningful when channel is set. Look up the
    // most recent message per conversation to decide who spoke last.
    if (folderFilter && folderFilter !== "all") {
      const filtered: Doc<"conversations">[] = [];
      for (const c of conversations) {
        const lastMsg = await ctx.db
          .query("messages")
          .withIndex("by_conversation_created", (q) =>
            q.eq("conversationId", c._id),
          )
          .order("desc")
          .first();
        if (!lastMsg) continue;
        if (folderFilter === "inbox" && lastMsg.role === "visitor") {
          filtered.push(c);
        } else if (
          folderFilter === "sent" &&
          (lastMsg.role === "operator" || lastMsg.role === "atlas")
        ) {
          filtered.push(c);
        }
      }
      conversations = filtered;
    }

    // Hydrate with visitor + brand for the inbox row preview.
    return await Promise.all(
      conversations.map(async (c) => {
        const visitor = await ctx.db.get(c.visitorId);
        const brand = c.brandId ? brandIndex.get(c.brandId) ?? null : null;
        return {
          ...c,
          channel: c.channel ?? ("web_chat" as const),
          visitor: visitor
            ? {
                name: visitor.name,
                email: visitor.email,
                phone: visitor.phone,
                ip: visitor.ip,
                location: visitor.location,
              }
            : null,
          brand: brand
            ? {
                _id: brand._id,
                name: brand.name,
                primaryColor: brand.primaryColor,
              }
            : null,
        };
      }),
    );
  },
});

/**
 * Get a single conversation by id, scoped to the caller's workspace + brand.
 */
export const getById = query({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return null;
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) return null;

    const visitor = await ctx.db.get(convo.visitorId);
    const brand: Doc<"brands"> | null = convo.brandId
      ? await ctx.db.get(convo.brandId)
      : null;
    return {
      ...convo,
      visitor,
      brand: brand
        ? {
            _id: brand._id,
            name: brand.name,
            primaryColor: brand.primaryColor,
          }
        : null,
    };
  },
});

/**
 * Update conversation status (resolve / snooze / reopen / close).
 */
export const setStatus = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    status: v.union(
      v.literal("open"),
      v.literal("snoozed"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) {
      throw new Error("Conversation not found.");
    }
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) {
      throw new Error("No access to this brand.");
    }
    await ctx.db.patch(args.conversationId, {
      status: args.status,
      resolvedBy: args.status === "resolved" ? "operator" : undefined,
    });
    await fireEvent(ctx, workspaceId, "conversation.status_changed", {
      conversationId: args.conversationId,
      brandId: convo.brandId,
      previousStatus: convo.status,
      status: args.status,
    });
    return null;
  },
});

// Helper export for downstream type consumers.
export type ConversationWithBrand = Doc<"conversations"> & {
  brand: { _id: Id<"brands">; name: string; primaryColor: string } | null;
  visitor: {
    name?: string;
    email?: string;
    phone?: string;
    ip?: string;
    location?: Doc<"visitors">["location"];
  } | null;
};

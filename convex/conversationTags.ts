import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";

const MAX_TAG_LEN = 32;
const MAX_TAGS_PER_CONVERSATION = 12;
const TAG_REGEX = /^[a-z0-9][a-z0-9 _-]{0,30}[a-z0-9]$|^[a-z0-9]$/;

function normaliseTag(raw: string): string {
  return raw.trim().toLowerCase();
}

export const listForConversation = query({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return [];
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) return [];

    const rows = await ctx.db
      .query("conversationTags")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    return rows.map((r) => r.tag).sort();
  },
});

/**
 * Distinct tags in use across the whole workspace, sorted by recent-
 * use frequency. Drives the inbox tag-filter dropdown + the type-
 * ahead in the per-conversation tag picker.
 */
export const listForWorkspace = query({
  args: { sessionToken: v.string() },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const rows = await ctx.db
      .query("conversationTags")
      .withIndex("by_workspace_tag", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const counts = new Map<string, number>();
    for (const r of rows) {
      counts.set(r.tag, (counts.get(r.tag) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([tag]) => tag);
  },
});

export const addTag = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    tag: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const convo = await ctx.db.get(args.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) {
      throw new ConvexError("Conversation not found.");
    }
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) {
      throw new ConvexError("No access to this brand.");
    }

    const tag = normaliseTag(args.tag);
    if (!tag) throw new ConvexError("Tag is required.");
    if (tag.length > MAX_TAG_LEN) {
      throw new ConvexError(`Tag too long (max ${MAX_TAG_LEN} chars).`);
    }
    if (!TAG_REGEX.test(tag)) {
      throw new ConvexError(
        "Tag can only contain letters, numbers, spaces, dashes, and underscores.",
      );
    }

    // Cap to keep the per-conversation list browsable + prevent
    // accidental tag-bombing from a flaky integration loop.
    const existing = await ctx.db
      .query("conversationTags")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    if (existing.length >= MAX_TAGS_PER_CONVERSATION) {
      throw new ConvexError(
        `Conversation has too many tags (max ${MAX_TAGS_PER_CONVERSATION}).`,
      );
    }
    if (existing.some((r) => r.tag === tag)) return null; // idempotent

    await ctx.db.insert("conversationTags", {
      workspaceId,
      conversationId: args.conversationId,
      tag,
      createdBy: operator._id,
      createdAt: Date.now(),
    });
    return null;
  },
});

export const removeTag = mutation({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
    tag: v.string(),
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

    const tag = normaliseTag(args.tag);
    const row = await ctx.db
      .query("conversationTags")
      .withIndex("by_workspace_conversation_tag", (q) =>
        q
          .eq("workspaceId", workspaceId)
          .eq("conversationId", args.conversationId)
          .eq("tag", tag),
      )
      .first();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

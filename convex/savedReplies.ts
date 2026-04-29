import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";

/**
 * Saved replies — operator boilerplate, optionally brand-scoped. Visible
 * to anyone with access to the brand (or to every operator if global).
 */

export const list = query({
  args: {
    sessionToken: v.string(),
    brandId: v.optional(v.id("brands")),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const all = await ctx.db
      .query("savedReplies")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();

    return all
      .filter((r) => {
        if (!r.brandId) return true; // workspace-global → always visible
        if (!hasBrandAccess(operator, r.brandId)) return false;
        // If a specific brand is being asked for, scope to it + globals.
        if (args.brandId && r.brandId !== args.brandId) return false;
        return true;
      })
      .map((r) => ({
        _id: r._id,
        brandId: r.brandId ?? null,
        title: r.title,
        body: r.body,
        shortcut: r.shortcut ?? null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    title: v.string(),
    body: v.string(),
    shortcut: v.optional(v.string()),
    brandId: v.optional(v.id("brands")),
  },
  returns: v.id("savedReplies"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const title = args.title.trim();
    const body = args.body.trim();
    if (!title) throw new Error("Title is required.");
    if (!body) throw new Error("Body is required.");

    const shortcut = args.shortcut?.trim();
    if (shortcut && !/^[/]?[a-zA-Z0-9_-]{2,30}$/.test(shortcut)) {
      throw new Error(
        "Shortcut must be 2-30 chars (letters, numbers, dashes, underscores).",
      );
    }

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.workspaceId !== workspaceId) {
        throw new Error("Brand not found.");
      }
      if (!hasBrandAccess(operator, args.brandId)) {
        throw new Error("No access to this brand.");
      }
    }

    const now = Date.now();
    return await ctx.db.insert("savedReplies", {
      workspaceId,
      brandId: args.brandId,
      title,
      body,
      shortcut: shortcut ?? undefined,
      createdBy: operator._id,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: {
    sessionToken: v.string(),
    replyId: v.id("savedReplies"),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    shortcut: v.optional(v.string()),
    brandId: v.optional(v.union(v.id("brands"), v.null())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.workspaceId !== workspaceId) {
      throw new Error("Saved reply not found.");
    }
    if (reply.brandId && !hasBrandAccess(operator, reply.brandId)) {
      throw new Error("No access to this saved reply.");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.title !== undefined) {
      const t = args.title.trim();
      if (!t) throw new Error("Title cannot be empty.");
      patch.title = t;
    }
    if (args.body !== undefined) {
      const b = args.body.trim();
      if (!b) throw new Error("Body cannot be empty.");
      patch.body = b;
    }
    if (args.shortcut !== undefined) {
      const s = args.shortcut.trim();
      if (s && !/^[/]?[a-zA-Z0-9_-]{2,30}$/.test(s)) {
        throw new Error("Invalid shortcut format.");
      }
      patch.shortcut = s || undefined;
    }
    if (args.brandId !== undefined) {
      if (args.brandId === null) {
        patch.brandId = undefined;
      } else {
        const brand = await ctx.db.get(args.brandId);
        if (!brand || brand.workspaceId !== workspaceId) {
          throw new Error("Brand not found.");
        }
        if (!hasBrandAccess(operator, args.brandId)) {
          throw new Error("No access to that brand.");
        }
        patch.brandId = args.brandId;
      }
    }
    await ctx.db.patch(args.replyId, patch);
    return null;
  },
});

export const remove = mutation({
  args: { sessionToken: v.string(), replyId: v.id("savedReplies") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const reply = await ctx.db.get(args.replyId);
    if (!reply || reply.workspaceId !== workspaceId) return null;
    if (reply.brandId && !hasBrandAccess(operator, reply.brandId)) return null;
    await ctx.db.delete(args.replyId);
    return null;
  },
});

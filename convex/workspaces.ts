import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  generateSessionToken,
  generateWidgetId,
  hashPassword,
  hashToken,
  slugify,
} from "./lib/auth";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * Bootstrap: create the first workspace + its owner operator + a
 * default widget config, all in one mutation. Returns a fresh session
 * token to set as a cookie on the client.
 *
 * This is the only flow that creates a workspace today. Self-serve
 * signup will reuse the same primitives once the marketing CTA wires up.
 */
export const create = mutation({
  args: {
    workspaceName: v.string(),
    ownerName: v.string(),
    ownerEmail: v.string(),
    ownerPassword: v.string(),
  },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    sessionToken: v.string(),
    widgetId: v.string(),
  }),
  handler: async (ctx, args) => {
    const slug = slugify(args.workspaceName);
    if (!slug) throw new Error("Workspace name must contain letters or numbers.");

    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error(`Workspace "${slug}" already exists.`);

    const email = args.ownerEmail.trim().toLowerCase();
    const emailTaken = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (emailTaken) throw new Error("That email already has an account.");

    const widgetId = generateWidgetId();
    const now = Date.now();

    const workspaceId = await ctx.db.insert("workspaces", {
      slug,
      name: args.workspaceName.trim(),
      plan: "spark",
      widgetId,
      createdAt: now,
    });

    await ctx.db.insert("widgetConfigs", {
      workspaceId,
      primaryColor: "#0F1A12",
      welcomeMessage: `Hi! How can the ${args.workspaceName.trim()} team help?`,
      position: "br",
    });

    const operatorId = await ctx.db.insert("operators", {
      workspaceId,
      email,
      name: args.ownerName.trim(),
      role: "owner",
      passwordHash: await hashPassword(args.ownerPassword),
      createdAt: now,
    });

    const sessionToken = generateSessionToken();
    await ctx.db.insert("sessions", {
      operatorId,
      workspaceId,
      tokenHash: await hashToken(sessionToken),
      expiresAt: now + SESSION_TTL_MS,
    });

    return { workspaceId, operatorId, sessionToken, widgetId };
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("workspaces"),
      _creationTime: v.number(),
      slug: v.string(),
      name: v.string(),
      plan: v.union(
        v.literal("spark"),
        v.literal("team"),
        v.literal("scale"),
        v.literal("enterprise"),
      ),
      widgetId: v.string(),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});

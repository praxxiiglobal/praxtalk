import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";
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
    const workspaceName = args.workspaceName.trim();

    const workspaceId = await ctx.db.insert("workspaces", {
      slug,
      name: workspaceName,
      plan: "spark",
      createdAt: now,
    });

    // Seed a default "main" brand. New workspaces get a single brand
    // out of the gate; admins can add more from /app/brands.
    await ctx.db.insert("brands", {
      workspaceId,
      slug: "main",
      name: workspaceName,
      widgetId,
      primaryColor: "#0F1A12",
      welcomeMessage: `Hi! How can the ${workspaceName} team help?`,
      position: "br",
      createdAt: now,
    });

    const operatorId = await ctx.db.insert("operators", {
      workspaceId,
      email,
      name: args.ownerName.trim(),
      role: "owner",
      brandAccess: "all",
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

/**
 * The dashboard accent color the current operator's workspace sees.
 * Hex string or null when unset (UI falls back to default).
 */
export const getDashboardAccent = query({
  args: { sessionToken: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const { workspaceId } = await requireOperator(ctx, args.sessionToken);
      const ws = await ctx.db.get(workspaceId);
      return ws?.dashboardAccent ?? null;
    } catch {
      return null;
    }
  },
});

/**
 * Owner / admin sets the workspace's dashboard accent. Pass null to
 * reset to default.
 */
export const setDashboardAccent = mutation({
  args: {
    sessionToken: v.string(),
    accent: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can change the dashboard color.");
    }
    if (args.accent && !/^#[0-9a-fA-F]{6}$/.test(args.accent)) {
      throw new Error("Color must be a 6-digit hex like #0F1A12.");
    }
    await ctx.db.patch(workspaceId, {
      dashboardAccent: args.accent ?? undefined,
    });
    return null;
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

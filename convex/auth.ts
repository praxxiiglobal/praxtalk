import { v } from "convex/values";
import { mutation, query, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  generateSessionToken,
  hashToken,
  verifyPassword,
} from "./lib/auth";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const login = mutation({
  args: { email: v.string(), password: v.string() },
  returns: v.object({
    operatorId: v.id("operators"),
    workspaceId: v.id("workspaces"),
    sessionToken: v.string(),
  }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();

    const operator = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();

    // Same error for missing email and bad password — no account enumeration.
    const ok =
      operator !== null &&
      (await verifyPassword(args.password, operator.passwordHash));
    if (!ok || !operator) throw new Error("Invalid email or password.");

    const sessionToken = generateSessionToken();
    await ctx.db.insert("sessions", {
      operatorId: operator._id,
      workspaceId: operator.workspaceId,
      tokenHash: await hashToken(sessionToken),
      expiresAt: Date.now() + SESSION_TTL_MS,
    });

    return {
      operatorId: operator._id,
      workspaceId: operator.workspaceId,
      sessionToken,
    };
  },
});

export const logout = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, { sessionToken }) => {
    const tokenHash = await hashToken(sessionToken);
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
      .first();
    if (session) await ctx.db.delete(session._id);
    return null;
  },
});

/**
 * Resolve a session token to its operator + workspace. Returns null
 * if the token is missing, unknown, or expired. Use this from the
 * Next.js server before calling any tenant-scoped query/mutation.
 */
export const me = query({
  args: { sessionToken: v.optional(v.string()) },
  returns: v.union(
    v.null(),
    v.object({
      operator: v.object({
        _id: v.id("operators"),
        email: v.string(),
        name: v.string(),
        role: v.union(
          v.literal("owner"),
          v.literal("admin"),
          v.literal("agent"),
        ),
      }),
      workspace: v.object({
        _id: v.id("workspaces"),
        slug: v.string(),
        name: v.string(),
        plan: v.union(
          v.literal("spark"),
          v.literal("team"),
          v.literal("scale"),
          v.literal("enterprise"),
        ),
      }),
    }),
  ),
  handler: async (ctx, { sessionToken }) => {
    if (!sessionToken) return null;
    const session = await loadSession(ctx, sessionToken);
    if (!session) return null;

    const operator = await ctx.db.get(session.operatorId);
    const workspace = await ctx.db.get(session.workspaceId);
    if (!operator || !workspace) return null;

    return {
      operator: {
        _id: operator._id,
        email: operator.email,
        name: operator.name,
        role: operator.role,
      },
      workspace: {
        _id: workspace._id,
        slug: workspace.slug,
        name: workspace.name,
        plan: workspace.plan,
      },
    };
  },
});

// ── Internal helpers used by other Convex functions ─────────────────

export async function loadSession(
  ctx: QueryCtx,
  sessionToken: string,
): Promise<Doc<"sessions"> | null> {
  const tokenHash = await hashToken(sessionToken);
  const session = await ctx.db
    .query("sessions")
    .withIndex("by_token_hash", (q) => q.eq("tokenHash", tokenHash))
    .first();
  if (!session) return null;
  if (session.expiresAt < Date.now()) return null;
  return session;
}

/**
 * Throws if the session is missing/invalid. Returns the operator + the
 * workspace they belong to. Every tenant-scoped mutation should call this.
 */
export async function requireOperator(
  ctx: QueryCtx,
  sessionToken: string | undefined,
): Promise<{ operator: Doc<"operators">; workspaceId: Id<"workspaces"> }> {
  if (!sessionToken) throw new Error("Not authenticated.");
  const session = await loadSession(ctx, sessionToken);
  if (!session) throw new Error("Session expired. Sign in again.");
  const operator = await ctx.db.get(session.operatorId);
  if (!operator) throw new Error("Operator not found.");
  return { operator, workspaceId: session.workspaceId };
}

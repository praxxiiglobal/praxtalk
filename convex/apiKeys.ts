import { v } from "convex/values";
import {
  internalQuery,
  mutation,
  query,
  type QueryCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { generateApiKey, hashToken } from "./lib/auth";

/**
 * List API keys for the caller's workspace. Returns prefix + name + scope —
 * never the secret itself (we don't store it).
 */
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return keys
      .filter((k) => !k.revokedAt)
      .map((k) => ({
        _id: k._id,
        name: k.name,
        prefix: k.prefix,
        scope: k.scope,
        brandId: k.brandId ?? null,
        createdAt: k.createdAt,
        lastUsedAt: k.lastUsedAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Mint a new API key. Returns the raw key string ONCE — it can never be
 * retrieved again, only revoked + replaced.
 */
export const create = mutation({
  args: {
    sessionToken: v.string(),
    name: v.string(),
    scope: v.union(v.literal("read"), v.literal("write")),
    brandId: v.optional(v.id("brands")),
  },
  returns: v.object({
    keyId: v.id("apiKeys"),
    secret: v.string(),
  }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can mint API keys.");
    }
    const name = args.name.trim();
    if (!name) throw new Error("API key name is required.");

    if (args.brandId) {
      const brand = await ctx.db.get(args.brandId);
      if (!brand || brand.workspaceId !== workspaceId) {
        throw new Error("Brand not found in this workspace.");
      }
    }

    const secret = generateApiKey();
    const prefix = secret.slice(0, 16); // "ptk_live_xxxxxxx"
    const keyHash = await hashToken(secret);

    const keyId = await ctx.db.insert("apiKeys", {
      workspaceId,
      name,
      prefix,
      keyHash,
      scope: args.scope,
      brandId: args.brandId,
      createdBy: operator._id,
      createdAt: Date.now(),
    });
    return { keyId, secret };
  },
});

/**
 * Revoke an API key. Subsequent requests with that secret will fail.
 */
export const revoke = mutation({
  args: { sessionToken: v.string(), keyId: v.id("apiKeys") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can revoke API keys.");
    }
    const key = await ctx.db.get(args.keyId);
    if (!key || key.workspaceId !== workspaceId) {
      throw new Error("API key not found.");
    }
    if (!key.revokedAt) {
      await ctx.db.patch(args.keyId, { revokedAt: Date.now() });
    }
    return null;
  },
});

// ── Server-side verification helpers (used by HTTP actions) ───────────

/**
 * Look up an API key by its full secret string. Used inside `httpAction`
 * to authenticate incoming `Authorization: Bearer ptk_live_…` requests.
 *
 * `internalQuery` so it's not exposed to public clients — only callable
 * from inside HTTP actions / other Convex functions.
 */
export const verifyKey = internalQuery({
  args: { secret: v.string() },
  handler: async (ctx, { secret }) => {
    if (!secret.startsWith("ptk_live_")) return null;
    const keyHash = await hashToken(secret);
    const found = await ctx.db
      .query("apiKeys")
      .withIndex("by_prefix", (q) => q.eq("prefix", secret.slice(0, 16)))
      .collect();
    const match = found.find((k) => k.keyHash === keyHash && !k.revokedAt);
    if (!match) return null;
    return {
      _id: match._id,
      workspaceId: match.workspaceId,
      scope: match.scope,
      brandId: match.brandId ?? null,
    };
  },
});

/**
 * Direct in-process lookup of an API key. Same job as `verifyKey` but for
 * use from a normal queryCtx (not an action). Returns the workspace +
 * scope or null. Doesn't update lastUsedAt — that's a mutation, do it
 * separately if you care.
 */
export async function loadApiKey(
  ctx: QueryCtx,
  secret: string,
): Promise<{
  doc: Doc<"apiKeys">;
  workspaceId: Id<"workspaces">;
} | null> {
  if (!secret.startsWith("ptk_live_")) return null;
  const prefix = secret.slice(0, 16);
  const keyHash = await hashToken(secret);
  const found = await ctx.db
    .query("apiKeys")
    .withIndex("by_prefix", (q) => q.eq("prefix", prefix))
    .collect();
  const match = found.find((k) => k.keyHash === keyHash && !k.revokedAt);
  if (!match) return null;
  return { doc: match, workspaceId: match.workspaceId };
}

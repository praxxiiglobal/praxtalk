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
import { pushActivity } from "./notifications";

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

    await pushActivity(ctx, {
      workspaceId,
      kind: "api_key_created",
      severity: "info",
      title: `API key minted: ${name}`,
      body: `${args.scope} scope${args.brandId ? " · brand-scoped" : " · workspace-scoped"}`,
      link: "/app/integrations",
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
    // Constant-time match — `=== keyHash` was leaking timing.
    let match: (typeof found)[number] | undefined;
    for (const k of found) {
      if (!k.revokedAt && timingSafeEqualHex(k.keyHash, keyHash)) {
        match = k;
        break;
      }
    }
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
  let match: (typeof found)[number] | undefined;
  for (const k of found) {
    if (!k.revokedAt && timingSafeEqualHex(k.keyHash, keyHash)) {
      match = k;
      break;
    }
  }
  if (!match) return null;
  return { doc: match, workspaceId: match.workspaceId };
}

/**
 * Constant-time equality on two equal-length hex strings. We don't
 * use `crypto.timingSafeEqual` because Convex's runtime exposes
 * Web Crypto only — XOR-accumulate over the chars is the simple
 * portable equivalent. Both keyHash columns are SHA-256 hex (64
 * chars) so this is fixed-length per call.
 */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

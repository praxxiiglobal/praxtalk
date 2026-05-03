import { v } from "convex/values";
import { ConvexError } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";

const integrationTypeValidator = v.union(
  v.literal("voice"),
  v.literal("email"),
  v.literal("whatsapp"),
);

const scopeValidator = v.union(v.literal("read"), v.literal("write"));

/**
 * Shared helper used by the per-integration modules to check whether
 * the caller may operate on `targetOperatorId`'s integration of the
 * given type. Order of checks:
 *   1. Caller is the owner → always allowed.
 *   2. Caller is admin/owner → always allowed.
 *   3. There's a grant row from owner → caller for this type with
 *      adequate scope.
 *   4. Otherwise → not allowed.
 *
 * Returns true / false; the caller throws or no-ops as appropriate.
 */
export async function canAccessIntegration(
  ctx: QueryCtx,
  caller: { _id: Id<"operators">; role: "owner" | "admin" | "agent" },
  targetOperatorId: Id<"operators">,
  type: "voice" | "email" | "whatsapp",
  requiredScope: "read" | "write",
): Promise<boolean> {
  if (caller._id === targetOperatorId) return true;
  if (caller.role === "owner" || caller.role === "admin") return true;
  const grant = await ctx.db
    .query("integrationGrants")
    .withIndex("by_owner_grantee_type", (q) =>
      q
        .eq("integrationOwnerOperatorId", targetOperatorId)
        .eq("grantedToOperatorId", caller._id)
        .eq("integrationType", type),
    )
    .first();
  if (!grant) return false;
  if (requiredScope === "write" && grant.scope === "read") return false;
  return true;
}

// ── Public CRUD ───────────────────────────────────────────────────────

/**
 * Grants the calling operator's integration to another operator.
 * Caller must own the integration (the owner is implicit — always
 * the caller). Admin granting other people's integrations isn't
 * supported here on purpose; admins already have implicit access.
 */
export const grant = mutation({
  args: {
    sessionToken: v.string(),
    integrationType: integrationTypeValidator,
    grantedToOperatorId: v.id("operators"),
    scope: scopeValidator,
  },
  returns: v.id("integrationGrants"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (args.grantedToOperatorId === operator._id) {
      throw new ConvexError("You already own this integration.");
    }
    const grantee = await ctx.db.get(args.grantedToOperatorId);
    if (!grantee || grantee.workspaceId !== workspaceId) {
      throw new ConvexError("Operator not found in this workspace.");
    }
    const existing = await ctx.db
      .query("integrationGrants")
      .withIndex("by_owner_grantee_type", (q) =>
        q
          .eq("integrationOwnerOperatorId", operator._id)
          .eq("grantedToOperatorId", args.grantedToOperatorId)
          .eq("integrationType", args.integrationType),
      )
      .first();
    if (existing) {
      // Re-granting just updates the scope.
      await ctx.db.patch(existing._id, { scope: args.scope });
      return existing._id;
    }
    return await ctx.db.insert("integrationGrants", {
      workspaceId,
      integrationType: args.integrationType,
      integrationOwnerOperatorId: operator._id,
      grantedToOperatorId: args.grantedToOperatorId,
      scope: args.scope,
      grantedByOperatorId: operator._id,
      grantedAt: Date.now(),
    });
  },
});

export const revoke = mutation({
  args: {
    sessionToken: v.string(),
    grantId: v.id("integrationGrants"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const g = await ctx.db.get(args.grantId);
    if (!g) return null;
    // Owner of the integration OR admin/owner can revoke.
    const isAdmin =
      operator.role === "owner" || operator.role === "admin";
    if (g.integrationOwnerOperatorId !== operator._id && !isAdmin) {
      throw new ConvexError(
        "Only the integration owner or an admin can revoke this grant.",
      );
    }
    await ctx.db.delete(args.grantId);
    return null;
  },
});

/**
 * Grants the caller has issued for one integration type. Used by the
 * "Sharing" panel of each PersonalXSection.
 */
export const listForOwner = query({
  args: {
    sessionToken: v.string(),
    integrationType: integrationTypeValidator,
  },
  returns: v.array(
    v.object({
      _id: v.id("integrationGrants"),
      grantedToOperatorId: v.id("operators"),
      grantedToOperatorName: v.string(),
      grantedToOperatorEmail: v.string(),
      scope: scopeValidator,
      grantedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const grants = await ctx.db
      .query("integrationGrants")
      .withIndex("by_owner_type", (q) =>
        q
          .eq("integrationOwnerOperatorId", operator._id)
          .eq("integrationType", args.integrationType),
      )
      .collect();
    return await Promise.all(
      grants.map(async (g) => {
        const grantee = await ctx.db.get(g.grantedToOperatorId);
        return {
          _id: g._id,
          grantedToOperatorId: g.grantedToOperatorId,
          grantedToOperatorName: grantee?.name ?? "Unknown",
          grantedToOperatorEmail: grantee?.email ?? "",
          scope: g.scope,
          grantedAt: g.grantedAt,
        };
      }),
    );
  },
});

/**
 * Integrations the caller has been granted access to (across all
 * types). Used to populate the "Manage on behalf of" picker for
 * non-admin operators who've been granted access.
 */
export const listForGrantee = query({
  args: { sessionToken: v.string() },
  returns: v.array(
    v.object({
      ownerOperatorId: v.id("operators"),
      ownerName: v.string(),
      integrationType: integrationTypeValidator,
      scope: scopeValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    // Three index lookups — one per type — keep it fast.
    const out: Array<{
      ownerOperatorId: Id<"operators">;
      ownerName: string;
      integrationType: "voice" | "email" | "whatsapp";
      scope: "read" | "write";
    }> = [];
    for (const type of ["voice", "email", "whatsapp"] as const) {
      const grants = await ctx.db
        .query("integrationGrants")
        .withIndex("by_grantee_type", (q) =>
          q
            .eq("grantedToOperatorId", operator._id)
            .eq("integrationType", type),
        )
        .collect();
      for (const g of grants) {
        const owner = await ctx.db.get(g.integrationOwnerOperatorId);
        out.push({
          ownerOperatorId: g.integrationOwnerOperatorId,
          ownerName: owner?.name ?? "Unknown",
          integrationType: type,
          scope: g.scope,
        });
      }
    }
    return out;
  },
});

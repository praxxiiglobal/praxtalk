import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";
import { generateSessionToken, hashPassword, hashToken } from "./lib/auth";
import { pushActivity } from "./notifications";

const roleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("agent"),
);

const brandAccessValidator = v.union(
  v.literal("all"),
  v.array(v.id("brands")),
);

/**
 * List operators in the caller's workspace. Available to everyone
 * (so agents can see their teammates), but the brand access matrix
 * is only editable by owners + admins.
 */
export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_workspace_email", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return operators
      .map((op) => ({
        _id: op._id,
        email: op.email,
        name: op.name,
        role: op.role,
        brandAccess: op.brandAccess ?? ("all" as const),
        createdAt: op.createdAt,
      }))
      .sort((a, b) => {
        const order = { owner: 0, admin: 1, agent: 2 } as const;
        if (order[a.role] !== order[b.role]) {
          return order[a.role] - order[b.role];
        }
        return a.createdAt - b.createdAt;
      });
  },
});

/**
 * Set the brand access list for an operator. "all" means access to every
 * brand (current + future). An array means scoped access — the operator
 * can only see those specific brands' inboxes and conversations.
 *
 * Owners and admins can call this. Owners can't be downgraded (their
 * access is always "all"). The caller can't change their own access
 * (avoid self-locking out).
 */
export const setBrandAccess = mutation({
  args: {
    sessionToken: v.string(),
    operatorId: v.id("operators"),
    brandAccess: brandAccessValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator: caller, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (caller.role === "agent") {
      throw new Error("Only admins and owners can manage brand access.");
    }
    if (caller._id === args.operatorId) {
      throw new Error("You can't change your own brand access.");
    }

    const target = await ctx.db.get(args.operatorId);
    if (!target || target.workspaceId !== workspaceId) {
      throw new Error("Operator not found.");
    }
    if (target.role === "owner") {
      throw new Error(
        "Owners always have access to every brand. Change their role first.",
      );
    }

    // Validate that every requested brandId belongs to this workspace.
    if (Array.isArray(args.brandAccess)) {
      const ids = new Set(args.brandAccess.map(String));
      const brands = await ctx.db
        .query("brands")
        .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
        .collect();
      const validIds = new Set(brands.map((b) => String(b._id)));
      for (const id of ids) {
        if (!validIds.has(id)) {
          throw new Error("One or more brands don't belong to this workspace.");
        }
      }
    }

    await ctx.db.patch(args.operatorId, {
      brandAccess: args.brandAccess,
    });
    return null;
  },
});

/**
 * Change an operator's role. Owners can promote/demote anyone except
 * themselves; admins can manage agents only. Owner role is reserved —
 * only an existing owner can grant it.
 */
export const setRole = mutation({
  args: {
    sessionToken: v.string(),
    operatorId: v.id("operators"),
    role: roleValidator,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator: caller, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (caller.role === "agent") {
      throw new Error("Only admins and owners can change roles.");
    }
    if (caller._id === args.operatorId) {
      throw new Error("You can't change your own role.");
    }

    const target = await ctx.db.get(args.operatorId);
    if (!target || target.workspaceId !== workspaceId) {
      throw new Error("Operator not found.");
    }
    if (target.role === "owner") {
      throw new Error("The workspace owner's role can't be changed.");
    }
    if (args.role === "owner" && caller.role !== "owner") {
      throw new Error("Only the owner can grant owner role.");
    }

    await ctx.db.patch(args.operatorId, { role: args.role });
    return null;
  },
});

/**
 * Create a new operator directly (admin-set password).
 *
 * For the open beta we don't have email delivery yet, so the admin sets
 * a temporary password here and shares it with the new operator out-of-band.
 * Once email is wired up, this becomes a proper invite link flow.
 */
export const create = mutation({
  args: {
    sessionToken: v.string(),
    email: v.string(),
    name: v.string(),
    role: v.union(v.literal("admin"), v.literal("agent")),
    temporaryPassword: v.string(),
    brandAccess: v.optional(brandAccessValidator),
  },
  returns: v.object({ operatorId: v.id("operators") }),
  handler: async (ctx, args) => {
    const { operator: caller, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (caller.role === "agent") {
      throw new Error("Only admins and owners can add operators.");
    }
    const email = args.email.trim().toLowerCase();
    if (!email) throw new Error("Email is required.");
    if (!args.name.trim()) throw new Error("Name is required.");
    if (args.temporaryPassword.length < 8) {
      throw new Error("Temporary password must be at least 8 characters.");
    }

    const dupe = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (dupe) throw new Error("An operator with that email already exists.");

    const now = Date.now();
    const operatorId = await ctx.db.insert("operators", {
      workspaceId,
      email,
      name: args.name.trim(),
      role: args.role,
      brandAccess: args.brandAccess ?? "all",
      passwordHash: await hashPassword(args.temporaryPassword),
      createdAt: now,
    });

    await pushActivity(ctx, {
      workspaceId,
      kind: "operator_added",
      severity: "info",
      title: `Operator added: ${args.name.trim()}`,
      body: `${args.role} · ${email}`,
      link: "/app/team",
    });

    return { operatorId };
  },
});

/**
 * Remove an operator from the workspace. Owner/admin only. Owners cannot
 * be removed via this mutation.
 */
export const remove = mutation({
  args: {
    sessionToken: v.string(),
    operatorId: v.id("operators"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator: caller, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (caller.role === "agent") {
      throw new Error("Only admins and owners can remove operators.");
    }
    if (caller._id === args.operatorId) {
      throw new Error("You can't remove yourself.");
    }
    const target = await ctx.db.get(args.operatorId);
    if (!target || target.workspaceId !== workspaceId) {
      throw new Error("Operator not found.");
    }
    if (target.role === "owner") {
      throw new Error("The workspace owner can't be removed.");
    }

    // Wipe their active sessions before deleting.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_operator", (q) => q.eq("operatorId", args.operatorId))
      .collect();
    for (const s of sessions) {
      await ctx.db.delete(s._id);
    }
    await ctx.db.delete(args.operatorId);
    return null;
  },
});

// Quiet unused-imports lint for tools that won't appear until invite-email
// flow lands.
void generateSessionToken;
void hashToken;

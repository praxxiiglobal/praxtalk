import { v } from "convex/values";
import { mutation, query, type MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { generateSessionToken, hashPassword, hashToken } from "./lib/auth";
import { pushActivity } from "./notifications";

/**
 * Append a row to auditLogs for a privileged action. Used for
 * forensics — never throws, never blocks the calling mutation, but
 * does run synchronously inside the mutation's transaction so the
 * audit row is committed iff the action succeeded.
 */
async function writeAuditLog(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    performedByOperatorId: Id<"operators">;
    action: string;
    targetOperatorId?: Id<"operators">;
    summary: string;
    payload?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    workspaceId: args.workspaceId,
    performedByOperatorId: args.performedByOperatorId,
    action: args.action,
    targetOperatorId: args.targetOperatorId,
    summary: args.summary,
    payload: args.payload ? JSON.stringify(args.payload) : undefined,
    createdAt: Date.now(),
  });
}

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
    await writeAuditLog(ctx, {
      workspaceId,
      performedByOperatorId: caller._id,
      action: "operator.brand_access_changed",
      targetOperatorId: args.operatorId,
      summary: `${caller.name ?? caller.email} changed ${target.name ?? target.email}'s brand access`,
      payload: {
        from: target.brandAccess ?? "all",
        to: args.brandAccess,
      },
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
    await writeAuditLog(ctx, {
      workspaceId,
      performedByOperatorId: caller._id,
      action: "operator.role_changed",
      targetOperatorId: args.operatorId,
      summary: `${caller.name ?? caller.email} changed ${target.name ?? target.email}'s role`,
      payload: { from: target.role, to: args.role },
    });
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
    await writeAuditLog(ctx, {
      workspaceId,
      performedByOperatorId: caller._id,
      action: "operator.created",
      targetOperatorId: operatorId,
      summary: `${caller.name ?? caller.email} added operator ${args.name.trim()} (${email}, ${args.role})`,
      payload: { email, role: args.role, brandAccess: args.brandAccess ?? "all" },
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
    // Audit log AFTER the delete so a query for this operator's id
    // still resolves the audit row's targetOperatorId — the row is
    // intentional crash debris and survives the operator's removal.
    await writeAuditLog(ctx, {
      workspaceId,
      performedByOperatorId: caller._id,
      action: "operator.removed",
      targetOperatorId: args.operatorId,
      summary: `${caller.name ?? caller.email} removed operator ${target.name ?? target.email}`,
      payload: { email: target.email, role: target.role },
    });
    return null;
  },
});

/**
 * Recent audit-log entries for the workspace. Owner / admin only —
 * agents have no read access. Powers the "Recent admin activity"
 * panel on /app/team.
 */
export const listAuditLogs = query({
  args: {
    sessionToken: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") return [];
    const limit = Math.min(Math.max(1, args.limit ?? 50), 200);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(limit);
    // Resolve performer names so the UI can render
    // "Sarah changed Bob's role" without a per-row roundtrip.
    const performerCache = new Map<string, string | null>();
    return await Promise.all(
      rows.map(async (r) => {
        const key = String(r.performedByOperatorId);
        let name = performerCache.get(key);
        if (name === undefined) {
          const op = await ctx.db.get(r.performedByOperatorId);
          name = op?.name ?? op?.email ?? null;
          performerCache.set(key, name);
        }
        return {
          _id: r._id,
          action: r.action,
          summary: r.summary,
          performerName: name,
          createdAt: r.createdAt,
        };
      }),
    );
  },
});

// Quiet unused-imports lint for tools that won't appear until invite-email
// flow lands.
void generateSessionToken;
void hashToken;

import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { loadSession } from "./auth";
import { isPlatformAdmin } from "./lib/platformAdmin";
import * as paypal from "./lib/paypal";
import * as razorpay from "./lib/razorpay";

/**
 * Cross-tenant queries for the /admin page. Auth gate is the
 * caller's email being in PLATFORM_ADMIN_EMAILS. We reuse the
 * existing operator session cookie (same login flow), but skip
 * the per-tenant requireOperator path because /admin is supposed
 * to span every tenant.
 */
async function requirePlatformAdmin(
  ctx: QueryCtx,
  sessionToken: string,
): Promise<{ operatorId: Id<"operators">; operatorEmail: string }> {
  const session = await loadSession(ctx, sessionToken);
  if (!session) throw new ConvexError("Not authenticated.");
  const operator = await ctx.db.get(session.operatorId);
  if (!operator) throw new ConvexError("Operator not found.");
  if (!isPlatformAdmin(operator.email)) {
    throw new ConvexError("Not a platform admin.");
  }
  return { operatorId: operator._id, operatorEmail: operator.email };
}

/**
 * Every workspace on the platform with per-workspace counts. Cheap
 * for ~hundreds of workspaces; switch to denormalised counters on
 * the workspace doc once we cross ~1k tenants.
 */
export const listWorkspaces = query({
  args: { sessionToken: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("workspaces"),
      slug: v.string(),
      name: v.string(),
      plan: v.union(
        v.literal("spark"),
        v.literal("team"),
        v.literal("scale"),
        v.literal("enterprise"),
      ),
      subscriptionStatus: v.union(
        v.literal("active"),
        v.literal("past_due"),
        v.literal("cancelled"),
        v.literal("paused"),
        v.null(),
      ),
      subscriptionProvider: v.union(
        v.literal("paypal"),
        v.literal("razorpay"),
        v.null(),
      ),
      platformStatus: v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("pending_review"),
        v.literal("flagged"),
      ),
      createdAt: v.number(),
      operatorCount: v.number(),
      brandCount: v.number(),
      conversationCount: v.number(),
      atlasRunsThisMonth: v.number(),
      lastActivityAt: v.union(v.number(), v.null()),
      ownerName: v.union(v.string(), v.null()),
      ownerEmail: v.union(v.string(), v.null()),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);

    const workspaces = await ctx.db.query("workspaces").collect();
    const monthStart = startOfMonth(Date.now());

    return await Promise.all(
      workspaces.map(async (ws) => {
        const operators = await ctx.db
          .query("operators")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", ws._id),
          )
          .collect();
        const brands = await ctx.db
          .query("brands")
          .withIndex("by_workspace", (q) => q.eq("workspaceId", ws._id))
          .collect();
        // Conversations + last activity together — order by lastMessageAt
        // desc, take 1 + count separately. For workspaces with many
        // conversations, .collect() can be expensive; bound at 5k for
        // counting.
        const convos = await ctx.db
          .query("conversations")
          .withIndex("by_workspace_lastmsg", (q) =>
            q.eq("workspaceId", ws._id),
          )
          .order("desc")
          .take(5_000);
        const atlasRuns = await ctx.db
          .query("atlasRuns")
          .withIndex("by_workspace_created", (q) =>
            q.eq("workspaceId", ws._id),
          )
          .collect();
        const atlasThisMonth = atlasRuns.filter(
          (r) => r.createdAt >= monthStart,
        ).length;
        // Owner is the first operator with role="owner" (workspaces
        // are seeded with exactly one). Fall back to the oldest
        // operator if a legacy workspace lacks an owner role for
        // any reason.
        const owner =
          operators.find((o) => o.role === "owner") ??
          operators.sort((a, b) => a.createdAt - b.createdAt)[0] ??
          null;
        return {
          _id: ws._id,
          slug: ws.slug,
          name: ws.name,
          plan: ws.plan,
          subscriptionStatus: ws.subscriptionStatus ?? null,
          subscriptionProvider: ws.subscriptionProvider ?? null,
          platformStatus: ws.platformStatus ?? ("active" as const),
          createdAt: ws.createdAt,
          operatorCount: operators.length,
          brandCount: brands.length,
          conversationCount: convos.length,
          atlasRunsThisMonth: atlasThisMonth,
          lastActivityAt: convos[0]?.lastMessageAt ?? null,
          ownerName: owner?.name ?? null,
          ownerEmail: owner?.email ?? null,
        };
      }),
    );
  },
});

/**
 * Per-workspace drill-down. Returns the workspace doc + operator
 * roster + recent conversations. Same auth gate.
 */
export const getWorkspace = query({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    const ws = await ctx.db.get(args.workspaceId);
    if (!ws) return null;
    const operators = await ctx.db
      .query("operators")
      .withIndex("by_workspace_email", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .collect();
    const brands = await ctx.db
      .query("brands")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
      .collect();
    const recentConvos = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_lastmsg", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(20);
    return {
      workspace: {
        _id: ws._id,
        slug: ws.slug,
        name: ws.name,
        plan: ws.plan,
        subscriptionStatus: ws.subscriptionStatus ?? null,
        subscriptionProvider: ws.subscriptionProvider ?? null,
        platformStatus: ws.platformStatus ?? "active",
        platformStatusReason: ws.platformStatusReason ?? null,
        platformStatusAt: ws.platformStatusAt ?? null,
        paypalSubscriptionId: ws.paypalSubscriptionId ?? null,
        razorpaySubscriptionId: ws.razorpaySubscriptionId ?? null,
        currentPeriodEnd: ws.currentPeriodEnd ?? null,
        createdAt: ws.createdAt,
      },
      operators: operators.map((o) => ({
        _id: o._id,
        email: o.email,
        name: o.name,
        role: o.role,
        createdAt: o.createdAt,
      })),
      brands: brands.map((b) => ({
        _id: b._id,
        slug: b.slug,
        name: b.name,
        widgetId: b.widgetId,
      })),
      recentConvos: recentConvos.map((c) => ({
        _id: c._id,
        status: c.status,
        channel: c.channel,
        lastMessageAt: c.lastMessageAt,
      })),
    };
  },
});

/**
 * Authn check the Next.js /admin layout calls before rendering —
 * lets us redirect to /login (with a "platform admin only" message)
 * without the page ever flashing.
 */
export const checkPlatformAdmin = query({
  args: { sessionToken: v.optional(v.string()) },
  returns: v.object({ ok: v.boolean(), reason: v.string() }),
  handler: async (ctx, args) => {
    if (!args.sessionToken) {
      return { ok: false, reason: "no-session" };
    }
    const session = await loadSession(ctx, args.sessionToken);
    if (!session) return { ok: false, reason: "expired" };
    const operator = await ctx.db.get(session.operatorId);
    if (!operator) return { ok: false, reason: "unknown-operator" };
    if (!isPlatformAdmin(operator.email)) {
      return { ok: false, reason: "not-platform-admin" };
    }
    return { ok: true, reason: "ok" };
  },
});

function startOfMonth(ts: number): number {
  const d = new Date(ts);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

// ── Mutations (platform-admin only) ───────────────────────────────────

const PLAN_VALIDATOR = v.union(
  v.literal("spark"),
  v.literal("team"),
  v.literal("scale"),
  v.literal("enterprise"),
);

const PLATFORM_STATUS_VALIDATOR = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("pending_review"),
  v.literal("flagged"),
);

const SUB_STATUS_VALIDATOR = v.union(
  v.literal("active"),
  v.literal("past_due"),
  v.literal("cancelled"),
  v.literal("paused"),
);

/**
 * Override the workspace's plan tier. Display + entitlement only —
 * does NOT touch PayPal / Razorpay billing. Use this for goodwill
 * upgrades, comp tiers, fix-after-webhook-misfire, or downgrades
 * after manual cancel. Logged in auditLogs.
 */
export const setPlan = mutation({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    plan: PLAN_VALIDATOR,
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operatorId, operatorEmail } = await requirePlatformAdmin(
      ctx,
      args.sessionToken,
    );
    const ws = await ctx.db.get(args.workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    if (ws.plan === args.plan) return null; // no-op
    const before = ws.plan;
    await ctx.db.patch(args.workspaceId, { plan: args.plan });
    await writePlatformAuditLog(ctx, {
      workspaceId: args.workspaceId,
      performedByOperatorId: operatorId,
      performedByEmail: operatorEmail,
      action: "platform.plan_changed",
      summary: `${operatorEmail} changed plan: ${before} → ${args.plan}`,
      payload: { before, after: args.plan, reason: args.reason },
    });
    return null;
  },
});

/**
 * Suspend / re-activate / flag a workspace at the platform layer.
 * "suspended" is hard — requireOperator + login refuse, every
 * existing session is invalidated. "pending_review" / "flagged"
 * are soft markers (visible in /admin, no enforcement) for staff
 * to triage without locking the customer out.
 */
export const setPlatformStatus = mutation({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    status: PLATFORM_STATUS_VALIDATOR,
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operatorId, operatorEmail } = await requirePlatformAdmin(
      ctx,
      args.sessionToken,
    );
    const ws = await ctx.db.get(args.workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    const before = ws.platformStatus ?? "active";
    if (before === args.status) return null;
    await ctx.db.patch(args.workspaceId, {
      platformStatus: args.status,
      platformStatusReason: args.reason,
      platformStatusAt: Date.now(),
    });
    // Hard-suspend wipes every active session for the workspace so
    // the lock kicks in immediately, not on next session expiry.
    // The sessions index is keyed by operatorId, so we walk the
    // workspace's operators + delete each one's sessions.
    if (args.status === "suspended") {
      const operators = await ctx.db
        .query("operators")
        .withIndex("by_workspace_email", (q) =>
          q.eq("workspaceId", args.workspaceId),
        )
        .collect();
      for (const op of operators) {
        const opSessions = await ctx.db
          .query("sessions")
          .withIndex("by_operator", (q) => q.eq("operatorId", op._id))
          .collect();
        for (const s of opSessions) await ctx.db.delete(s._id);
      }
    }
    await writePlatformAuditLog(ctx, {
      workspaceId: args.workspaceId,
      performedByOperatorId: operatorId,
      performedByEmail: operatorEmail,
      action: "platform.status_changed",
      summary: `${operatorEmail} set platform status: ${before} → ${args.status}${
        args.reason ? ` (${args.reason})` : ""
      }`,
      payload: { before, after: args.status, reason: args.reason },
    });
    return null;
  },
});

/**
 * Same as setPlatformStatus but for many workspaces in one call.
 * Caps at 100 IDs per request to keep the transaction bounded.
 * No-op (already-at-target) workspaces are counted in `skipped`,
 * not `updated`. Audit log entries are written per-workspace so the
 * per-workspace history stays grep-able. If `status === "suspended"`,
 * each workspace's active sessions are wiped immediately, same as
 * the single-workspace path.
 */
export const bulkSetPlatformStatus = mutation({
  args: {
    sessionToken: v.string(),
    workspaceIds: v.array(v.id("workspaces")),
    status: PLATFORM_STATUS_VALIDATOR,
    reason: v.optional(v.string()),
  },
  returns: v.object({
    updated: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, args) => {
    const { operatorId, operatorEmail } = await requirePlatformAdmin(
      ctx,
      args.sessionToken,
    );
    if (args.workspaceIds.length === 0) {
      return { updated: 0, skipped: 0 };
    }
    if (args.workspaceIds.length > 100) {
      throw new ConvexError(
        "Bulk action capped at 100 workspaces per call.",
      );
    }
    const now = Date.now();
    let updated = 0;
    let skipped = 0;
    for (const workspaceId of args.workspaceIds) {
      const ws = await ctx.db.get(workspaceId);
      if (!ws) {
        skipped++;
        continue;
      }
      const before = ws.platformStatus ?? "active";
      if (before === args.status) {
        skipped++;
        continue;
      }
      await ctx.db.patch(workspaceId, {
        platformStatus: args.status,
        platformStatusReason: args.reason,
        platformStatusAt: now,
      });
      if (args.status === "suspended") {
        const operators = await ctx.db
          .query("operators")
          .withIndex("by_workspace_email", (q) =>
            q.eq("workspaceId", workspaceId),
          )
          .collect();
        for (const op of operators) {
          const opSessions = await ctx.db
            .query("sessions")
            .withIndex("by_operator", (q) => q.eq("operatorId", op._id))
            .collect();
          for (const s of opSessions) await ctx.db.delete(s._id);
        }
      }
      await writePlatformAuditLog(ctx, {
        workspaceId,
        performedByOperatorId: operatorId,
        performedByEmail: operatorEmail,
        action: "platform.status_changed",
        summary: `${operatorEmail} set platform status (bulk): ${before} → ${args.status}${
          args.reason ? ` (${args.reason})` : ""
        }`,
        payload: {
          before,
          after: args.status,
          reason: args.reason,
          bulk: true,
        },
      });
      updated++;
    }
    return { updated, skipped };
  },
});

/**
 * Manual override of subscriptionStatus + plan in one call. Used
 * when a webhook never fired (provider outage), or when staff
 * wants to manually flip a workspace's billing state without
 * touching PayPal / Razorpay. Doesn't cancel the upstream
 * subscription — call cancelSubscriptionUpstream for that.
 */
export const overrideSubscription = mutation({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    subscriptionStatus: v.union(SUB_STATUS_VALIDATOR, v.null()),
    plan: v.optional(PLAN_VALIDATOR),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operatorId, operatorEmail } = await requirePlatformAdmin(
      ctx,
      args.sessionToken,
    );
    const ws = await ctx.db.get(args.workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    const patch: Record<string, unknown> = {
      subscriptionStatus: args.subscriptionStatus ?? undefined,
    };
    if (args.plan !== undefined) patch.plan = args.plan;
    await ctx.db.patch(args.workspaceId, patch);
    await writePlatformAuditLog(ctx, {
      workspaceId: args.workspaceId,
      performedByOperatorId: operatorId,
      performedByEmail: operatorEmail,
      action: "platform.subscription_overridden",
      summary: `${operatorEmail} overrode subscription: ${
        ws.subscriptionStatus ?? "(none)"
      } → ${args.subscriptionStatus ?? "(none)"}${
        args.plan ? ` · plan=${args.plan}` : ""
      }${args.reason ? ` (${args.reason})` : ""}`,
      payload: {
        beforeStatus: ws.subscriptionStatus ?? null,
        afterStatus: args.subscriptionStatus,
        beforePlan: ws.plan,
        afterPlan: args.plan ?? ws.plan,
        reason: args.reason,
      },
    });
    return null;
  },
});

/**
 * Cancel the workspace's subscription on the upstream provider
 * (PayPal or Razorpay). Wraps the existing provider clients;
 * the regular billing webhook will then converge our local
 * state on the next event. Action (not mutation) because the
 * provider call is a network round-trip.
 */
export const cancelSubscriptionUpstream = action({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    reason: v.optional(v.string()),
  },
  returns: v.object({ ok: v.boolean(), provider: v.string() }),
  handler: async (ctx, args): Promise<{ ok: boolean; provider: string }> => {
    const ws: {
      paypalSubscriptionId: string | null;
      razorpaySubscriptionId: string | null;
      subscriptionProvider: "paypal" | "razorpay" | null;
    } = await ctx.runQuery(internal._admin._loadSubscription, {
      sessionToken: args.sessionToken,
      workspaceId: args.workspaceId,
    });
    if (ws.subscriptionProvider === "paypal" && ws.paypalSubscriptionId) {
      await paypal.cancelSubscription({
        subscriptionId: ws.paypalSubscriptionId,
      });
      await ctx.runMutation(internal._admin._auditCancelUpstream, {
        sessionToken: args.sessionToken,
        workspaceId: args.workspaceId,
        provider: "paypal",
        subscriptionId: ws.paypalSubscriptionId,
        reason: args.reason,
      });
      return { ok: true, provider: "paypal" };
    }
    if (
      ws.subscriptionProvider === "razorpay" &&
      ws.razorpaySubscriptionId
    ) {
      await razorpay.cancelSubscription({
        subscriptionId: ws.razorpaySubscriptionId,
      });
      await ctx.runMutation(internal._admin._auditCancelUpstream, {
        sessionToken: args.sessionToken,
        workspaceId: args.workspaceId,
        provider: "razorpay",
        subscriptionId: ws.razorpaySubscriptionId,
        reason: args.reason,
      });
      return { ok: true, provider: "razorpay" };
    }
    return { ok: false, provider: "none" };
  },
});

export const _loadSubscription = internalQuery({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
  },
  returns: v.object({
    paypalSubscriptionId: v.union(v.string(), v.null()),
    razorpaySubscriptionId: v.union(v.string(), v.null()),
    subscriptionProvider: v.union(
      v.literal("paypal"),
      v.literal("razorpay"),
      v.null(),
    ),
  }),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    const ws = await ctx.db.get(args.workspaceId);
    if (!ws) throw new ConvexError("Workspace not found.");
    return {
      paypalSubscriptionId: ws.paypalSubscriptionId ?? null,
      razorpaySubscriptionId: ws.razorpaySubscriptionId ?? null,
      subscriptionProvider: ws.subscriptionProvider ?? null,
    };
  },
});

export const _auditCancelUpstream = internalMutation({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    provider: v.string(),
    subscriptionId: v.string(),
    reason: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operatorId, operatorEmail } = await requirePlatformAdmin(
      ctx,
      args.sessionToken,
    );
    await writePlatformAuditLog(ctx, {
      workspaceId: args.workspaceId,
      performedByOperatorId: operatorId,
      performedByEmail: operatorEmail,
      action: "platform.subscription_cancelled_upstream",
      summary: `${operatorEmail} cancelled ${args.provider} subscription ${args.subscriptionId}${
        args.reason ? ` (${args.reason})` : ""
      }`,
      payload: {
        provider: args.provider,
        subscriptionId: args.subscriptionId,
        reason: args.reason,
      },
    });
    return null;
  },
});

/**
 * Recent platform-admin audit log entries for a workspace. Powers
 * the "What admins have done" panel on the drill-down.
 */
export const listAuditForWorkspace = query({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("auditLogs"),
      action: v.string(),
      summary: v.string(),
      payload: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    const limit = Math.min(Math.max(1, args.limit ?? 30), 200);
    const rows = await ctx.db
      .query("auditLogs")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .order("desc")
      .take(limit);
    return rows
      .filter((r) => r.action.startsWith("platform."))
      .map((r) => ({
        _id: r._id,
        action: r.action,
        summary: r.summary,
        payload: r.payload ?? null,
        createdAt: r.createdAt,
      }));
  },
});

async function writePlatformAuditLog(
  ctx: MutationCtx,
  args: {
    workspaceId: Id<"workspaces">;
    performedByOperatorId: Id<"operators">;
    performedByEmail: string;
    action: string;
    summary: string;
    payload?: unknown;
  },
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    workspaceId: args.workspaceId,
    performedByOperatorId: args.performedByOperatorId,
    action: args.action,
    summary: args.summary,
    payload: args.payload ? JSON.stringify(args.payload) : undefined,
    createdAt: Date.now(),
  });
  void args.performedByEmail; // already in summary
}

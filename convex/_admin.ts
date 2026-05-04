import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { loadSession } from "./auth";
import { isPlatformAdmin } from "./lib/platformAdmin";
import * as paypal from "./lib/paypal";
import * as razorpay from "./lib/razorpay";
import {
  buildMessagesPage,
  buildWorkspaceCoreExport,
} from "./lib/workspaceExport";
import { resolveFeatures } from "./lib/features";

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
        features: resolveFeatures(ws.features),
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

// ── Workspace export (platform-admin path) ─────────────────────────────
//
// Staff-only entry points behind /admin/workspaces. Everything heavy is
// in convex/lib/workspaceExport.ts so the customer-facing self-serve
// export in convex/workspaces.ts can reuse it byte-for-byte.

export const exportWorkspaceCore = query({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
  },
  // Returns plain JSON — no v.object validator because the shape is
  // huge + evolves with the schema. The route handler is the only
  // consumer and treats it as opaque bytes.
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    return await buildWorkspaceCoreExport(
      ctx,
      args.workspaceId,
      "platform_admin",
    );
  },
});

/**
 * Paginated message dump. The route handler loops, advancing `cursor`
 * by the last message's _creationTime until `done: true`. Page size
 * is generous (5k) since messages are small docs but caps below the
 * Convex single-response cap.
 */
export const exportWorkspaceMessagesPage = query({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    cursor: v.union(v.number(), v.null()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    return await buildMessagesPage(
      ctx,
      args.workspaceId,
      args.cursor,
      args.pageSize ?? 5000,
    );
  },
});

/**
 * Cross-workspace summary roll-up. One JSON-serialisable row per
 * workspace, same schema for every row — perfect for piping into a
 * single CSV. Used by the route handler at
 * /admin/workspaces/export.csv.
 *
 * Reuses the listWorkspaces logic but returns extra fields the
 * dashboard table doesn't surface (createdAt formatted, status
 * timestamps, billing IDs etc) so the CSV is a complete picture.
 */
export const exportAllWorkspacesSummary = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    const workspaces = await ctx.db.query("workspaces").collect();

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
        const convoCount = (
          await ctx.db
            .query("conversations")
            .withIndex("by_workspace_lastmsg", (q) =>
              q.eq("workspaceId", ws._id),
            )
            .order("desc")
            .take(5_000)
        ).length;
        const lastConvo = (
          await ctx.db
            .query("conversations")
            .withIndex("by_workspace_lastmsg", (q) =>
              q.eq("workspaceId", ws._id),
            )
            .order("desc")
            .take(1)
        )[0];
        const atlasRuns = await ctx.db
          .query("atlasRuns")
          .withIndex("by_workspace_created", (q) =>
            q.eq("workspaceId", ws._id),
          )
          .collect();
        const monthStart = startOfMonth(Date.now());
        const atlasThisMonth = atlasRuns.filter(
          (r) => r.createdAt >= monthStart,
        ).length;
        const owner =
          operators.find((o) => o.role === "owner") ??
          operators.sort((a, b) => a.createdAt - b.createdAt)[0] ??
          null;

        return {
          workspaceId: ws._id,
          workspaceSlug: ws.slug,
          workspaceName: ws.name,
          plan: ws.plan,
          platformStatus: ws.platformStatus ?? "active",
          platformStatusReason: ws.platformStatusReason ?? "",
          subscriptionStatus: ws.subscriptionStatus ?? "",
          subscriptionProvider: ws.subscriptionProvider ?? "",
          paypalSubscriptionId: ws.paypalSubscriptionId ?? "",
          razorpaySubscriptionId: ws.razorpaySubscriptionId ?? "",
          currentPeriodEnd: ws.currentPeriodEnd
            ? new Date(ws.currentPeriodEnd).toISOString()
            : "",
          createdAt: new Date(ws.createdAt).toISOString(),
          ownerName: owner?.name ?? "",
          ownerEmail: owner?.email ?? "",
          ownerCreatedAt: owner ? new Date(owner.createdAt).toISOString() : "",
          operatorCount: operators.length,
          brandCount: brands.length,
          conversationCount: convoCount,
          atlasRunsTotal: atlasRuns.length,
          atlasRunsThisMonth: atlasThisMonth,
          lastActivityAt: lastConvo
            ? new Date(lastConvo.lastMessageAt).toISOString()
            : "",
        };
      }),
    );
  },
});

// ── Cross-workspace leads ──────────────────────────────────────────────
//
// Single roll-up of every lead across every workspace, used by the
// /admin/leads page and its CSV export. Same auth gate as the rest of
// /admin (platform-admin email allowlist).

export const listAllLeads = query({
  args: {
    sessionToken: v.string(),
    // Optional filters; the page ships with these wired to the URL
    // so staff can deep-link to "every new lead this week" etc.
    status: v.optional(
      v.union(
        v.literal("new"),
        v.literal("contacted"),
        v.literal("qualified"),
        v.literal("won"),
        v.literal("lost"),
      ),
    ),
    workspaceId: v.optional(v.id("workspaces")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requirePlatformAdmin(ctx, args.sessionToken);
    const limit = Math.min(Math.max(args.limit ?? 1000, 1), 5000);

    let leadsQuery = ctx.db.query("leads");
    if (args.status) {
      const status = args.status;
      leadsQuery = leadsQuery.filter((q) =>
        q.eq(q.field("status"), status),
      );
    }
    if (args.workspaceId) {
      const wid = args.workspaceId;
      leadsQuery = leadsQuery.filter((q) =>
        q.eq(q.field("workspaceId"), wid),
      );
    }
    const leads = await leadsQuery.order("desc").take(limit);

    // Hydrate workspace + brand + operator names for the table.
    // Caching workspaces/brands/operators in Maps means we hit each
    // row once.
    const wsCache = new Map<string, Doc<"workspaces"> | null>();
    const brandCache = new Map<string, Doc<"brands"> | null>();
    const opCache = new Map<string, Doc<"operators"> | null>();
    const getOp = async (id: Id<"operators">) => {
      const key = id as unknown as string;
      if (!opCache.has(key)) opCache.set(key, await ctx.db.get(id));
      return opCache.get(key) ?? null;
    };

    const rows = await Promise.all(
      leads.map(async (lead) => {
        const wsKey = lead.workspaceId as unknown as string;
        if (!wsCache.has(wsKey))
          wsCache.set(wsKey, await ctx.db.get(lead.workspaceId));
        const brandKey = lead.brandId as unknown as string;
        if (!brandCache.has(brandKey))
          brandCache.set(brandKey, await ctx.db.get(lead.brandId));

        const ws = wsCache.get(wsKey);
        const brand = brandCache.get(brandKey);
        const creator = await getOp(lead.createdBy);
        const assignee = lead.assignedToOperatorId
          ? await getOp(lead.assignedToOperatorId)
          : null;

        // Remarks thread for this lead — collated into one human-
        // readable block in the CSV. Legacy `lead.notes` (the old
        // single-string field) is included as the first line so we
        // don't drop pre-thread data.
        const remarks = await ctx.db
          .query("leadRemarks")
          .withIndex("by_lead_created", (q) => q.eq("leadId", lead._id))
          .order("asc")
          .collect();
        const remarkLines: string[] = [];
        if (lead.notes && lead.notes.trim()) {
          remarkLines.push(`[legacy note] ${lead.notes.trim()}`);
        }
        for (const r of remarks) {
          const author = await getOp(r.operatorId);
          const when = new Date(r.createdAt).toISOString();
          const who = author?.name ?? "(deleted)";
          remarkLines.push(`[${when} · ${who}] ${r.body}`);
        }
        const remarksCollated = remarkLines.join("\n\n");

        return {
          _id: lead._id,
          workspaceId: lead.workspaceId,
          workspaceSlug: ws?.slug ?? "",
          workspaceName: ws?.name ?? "",
          brandId: lead.brandId,
          brandName: brand?.name ?? "",
          name: lead.name,
          email: lead.email ?? null,
          phone: lead.phone ?? null,
          status: lead.status,
          country: lead.location?.country ?? null,
          city: lead.location?.city ?? null,
          ip: lead.ip ?? null,
          // Newest remark only for the on-screen table (keeps the row
          // height sane); the full thread lives in `remarks` below
          // for the CSV.
          notes: remarks.length > 0 ? remarks[remarks.length - 1].body : (lead.notes ?? null),
          remarksCount: remarks.length + (lead.notes && lead.notes.trim() ? 1 : 0),
          remarks: remarksCollated || null,
          assignedToName: assignee?.name ?? null,
          assignedToEmail: assignee?.email ?? null,
          assignedAt: lead.assignedAt ?? null,
          createdByName: creator?.name ?? "",
          createdByEmail: creator?.email ?? "",
          createdAt: lead.createdAt,
          updatedAt: lead.updatedAt,
          conversationId: lead.conversationId ?? null,
        };
      }),
    );
    return rows;
  },
});

// ── Per-workspace feature gates ────────────────────────────────────────

export const setFeatures = mutation({
  args: {
    sessionToken: v.string(),
    workspaceId: v.id("workspaces"),
    features: v.object({
      channels: v.object({
        chat: v.boolean(),
        email: v.boolean(),
        whatsapp: v.boolean(),
        voice: v.boolean(),
        sms: v.boolean(),
      }),
      atlasAi: v.boolean(),
      leads: v.boolean(),
      bookingPages: v.boolean(),
      multiBrand: v.boolean(),
      analytics: v.boolean(),
    }),
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
    await ctx.db.patch(args.workspaceId, { features: args.features });
    await writePlatformAuditLog(ctx, {
      workspaceId: args.workspaceId,
      performedByOperatorId: operatorId,
      performedByEmail: operatorEmail,
      action: "platform.features_changed",
      summary: `${operatorEmail} updated feature gates${
        args.reason ? ` (${args.reason})` : ""
      }`,
      payload: { features: args.features, reason: args.reason },
    });
    return null;
  },
});

import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

/**
 * Channel migration — Phase 1 → Phase 2 backfill.
 *
 * Stamps `channel = "web_chat"` on every existing conversation + message
 * that's missing the field. Safe to re-run.
 */
export const backfillChannel = internalMutation({
  args: {},
  returns: v.object({
    conversationsBackfilled: v.number(),
    messagesBackfilled: v.number(),
  }),
  handler: async (ctx) => {
    let conversationsBackfilled = 0;
    let messagesBackfilled = 0;

    const workspaces = await ctx.db.query("workspaces").collect();
    for (const w of workspaces) {
      const statuses = ["open", "snoozed", "resolved", "closed"] as const;
      for (const status of statuses) {
        const convos = await ctx.db
          .query("conversations")
          .withIndex("by_workspace_status_lastmsg", (q) =>
            q.eq("workspaceId", w._id).eq("status", status),
          )
          .collect();
        for (const c of convos) {
          if (!c.channel) {
            await ctx.db.patch(c._id, { channel: "web_chat" });
            conversationsBackfilled++;
          }
          const messages = await ctx.db
            .query("messages")
            .withIndex("by_conversation_created", (q) =>
              q.eq("conversationId", c._id),
            )
            .collect();
          for (const m of messages) {
            if (!m.channel) {
              await ctx.db.patch(m._id, { channel: "web_chat" });
              messagesBackfilled++;
            }
          }
        }
      }
    }

    return { conversationsBackfilled, messagesBackfilled };
  },
});

/**
 * Phase-3 cleanup — strip the deprecated `widgetId` field from every
 * `workspaces` row so the schema can drop it. Idempotent; rerunnable.
 *
 * Run: `npx convex run migrations:stripLegacyWorkspaceFields`
 */
export const stripLegacyWorkspaceFields = internalMutation({
  args: {},
  returns: v.object({ workspacesStripped: v.number() }),
  handler: async (ctx) => {
    let stripped = 0;
    const workspaces = await ctx.db.query("workspaces").collect();
    for (const w of workspaces) {
      // db.replace rewrites the row to exactly the new shape; this
      // drops any field not in the args, including `widgetId`.
      await ctx.db.replace(w._id, {
        slug: w.slug,
        name: w.name,
        plan: w.plan,
        createdAt: w.createdAt,
      });
      stripped++;
    }
    return { workspacesStripped: stripped };
  },
});

/**
 * Multi-brand migration — kept as a no-op for historical reference.
 *
 * The original Phase 1 → Phase 2 implementation backfilled brands and
 * brandIds across the dev deployment on 2026-04-29. The Phase 3 narrow
 * dropped `widgetConfigs` and `workspaces.widgetId`, so the original
 * code (which read from those) no longer typechecks. The function stays
 * here so anyone running `npx convex run migrations:migrateToMultiBrand`
 * gets a clear "already done" response rather than a 404.
 */
export const migrateToMultiBrand = internalMutation({
  args: {},
  returns: v.object({
    workspacesProcessed: v.number(),
    brandsCreated: v.number(),
    operatorsBackfilled: v.number(),
    visitorsBackfilled: v.number(),
    conversationsBackfilled: v.number(),
    messagesBackfilled: v.number(),
  }),
  handler: async () => {
    return {
      workspacesProcessed: 0,
      brandsCreated: 0,
      operatorsBackfilled: 0,
      visitorsBackfilled: 0,
      conversationsBackfilled: 0,
      messagesBackfilled: 0,
    };
  },
});

/* Phase 1 implementation removed after 2026-04-29 narrow.

      // 5. Backfill brandId on messages.
      // ... (full backfill implementation; see git history)
    }
*/

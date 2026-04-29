import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";

/**
 * Dashboard analytics — straightforward in-memory aggregation over the
 * last 14 days of conversations + messages. Fine for the open-beta data
 * size (single-digit thousands of rows). When usage grows past ~50k
 * conversations we'll precompute these into a daily rollup table.
 *
 * All queries respect the operator's brand access. Pass `brandId` to
 * scope to a single brand; omit to aggregate across every brand the
 * caller can see.
 */

const DAY = 24 * 60 * 60 * 1000;

const channelLiteral = v.union(
  v.literal("web_chat"),
  v.literal("email"),
  v.literal("whatsapp"),
  v.literal("voice"),
);

export const overview = query({
  args: {
    sessionToken: v.string(),
    brandId: v.optional(v.id("brands")),
    days: v.optional(v.number()), // window size, default 14
  },
  returns: v.object({
    range: v.object({ start: v.number(), end: v.number(), days: v.number() }),
    totals: v.object({
      conversations: v.number(),
      conversationsPrev: v.number(),
      atlasAutoReplied: v.number(),
      operatorReplied: v.number(),
      atlasResolutionRate: v.number(), // 0..1
      medianFirstResponseSeconds: v.union(v.number(), v.null()),
    }),
    volumePerDay: v.array(
      v.object({ day: v.number(), conversations: v.number() }),
    ),
    channelMix: v.array(
      v.object({ channel: channelLiteral, count: v.number(), pct: v.number() }),
    ),
    atlasBreakdown: v.object({
      autoReplied: v.number(),
      drafted: v.number(),
      skippedNoConfig: v.number(),
      failed: v.number(),
    }),
  }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const days = Math.min(Math.max(1, args.days ?? 14), 90);
    const end = Date.now();
    const start = end - days * DAY;
    const prevStart = start - days * DAY;

    // Brand access gate.
    if (args.brandId && !hasBrandAccess(operator, args.brandId)) {
      return emptyOverview(start, end, days);
    }

    // Pull conversations created in [prevStart, end] so we can compute
    // both the current window and the previous-window comparison in one
    // pass. This is bounded — a workspace creating >5k conversations
    // every two weeks should be on the precomputed-rollup path.
    const allConversations = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_status_lastmsg", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();

    const accessibleBrandIds = await accessibleBrandIdSet(
      ctx,
      operator,
      workspaceId,
    );

    const inScope = allConversations.filter((c) => {
      if (c.createdAt < prevStart) return false;
      if (args.brandId) return c.brandId === args.brandId;
      // No specific brand requested → only include rows whose brand the
      // operator can see. Email-channel conversations have no brandId
      // and are scoped only by workspace, so they pass through.
      if (!c.brandId) return true;
      return accessibleBrandIds.has(c.brandId);
    });

    const inWindow = inScope.filter((c) => c.createdAt >= start);
    const inPrevWindow = inScope.filter(
      (c) => c.createdAt >= prevStart && c.createdAt < start,
    );

    // Volume per day buckets (oldest → newest).
    const volume: { day: number; conversations: number }[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const dayStart = end - (i + 1) * DAY;
      volume.push({ day: dayStart, conversations: 0 });
    }
    for (const c of inWindow) {
      const idx = Math.min(
        days - 1,
        Math.max(0, Math.floor((c.createdAt - start) / DAY)),
      );
      volume[idx].conversations++;
    }

    // Channel mix.
    const channelCounts: Record<string, number> = {
      web_chat: 0,
      email: 0,
      whatsapp: 0,
      voice: 0,
    };
    for (const c of inWindow) {
      channelCounts[c.channel] = (channelCounts[c.channel] ?? 0) + 1;
    }
    const channelTotal = inWindow.length;
    const channelMix = (
      ["web_chat", "email", "whatsapp", "voice"] as const
    ).map((ch) => ({
      channel: ch,
      count: channelCounts[ch] ?? 0,
      pct: channelTotal === 0 ? 0 : (channelCounts[ch] ?? 0) / channelTotal,
    }));

    // Atlas + first-response calculations need messages. Pull them
    // scoped to the conversations we already filtered in.
    let atlasAutoReplied = 0;
    let operatorReplied = 0;
    const firstResponseSeconds: number[] = [];

    for (const c of inWindow) {
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_conversation_created", (q) =>
          q.eq("conversationId", c._id),
        )
        .order("asc")
        .take(200);

      const firstVisitor = messages.find((m) => m.role === "visitor");
      const firstReply = messages.find(
        (m) => m.role === "operator" || m.role === "atlas",
      );
      if (firstVisitor && firstReply && firstReply.createdAt >= firstVisitor.createdAt) {
        firstResponseSeconds.push(
          Math.round((firstReply.createdAt - firstVisitor.createdAt) / 1000),
        );
      }

      const repliers = new Set(messages.map((m) => m.role));
      if (repliers.has("operator")) operatorReplied++;
      else if (repliers.has("atlas")) atlasAutoReplied++;
    }

    const totalReplies = atlasAutoReplied + operatorReplied;
    const atlasResolutionRate =
      totalReplies === 0 ? 0 : atlasAutoReplied / totalReplies;
    const medianFirstResponseSeconds =
      firstResponseSeconds.length === 0
        ? null
        : median(firstResponseSeconds);

    // Atlas runs breakdown — easier: query atlasRuns directly.
    const atlasRuns = await ctx.db
      .query("atlasRuns")
      .withIndex("by_workspace_created", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .filter((q) => q.gte(q.field("createdAt"), start))
      .collect();

    const atlasBreakdown = {
      autoReplied: atlasRuns.filter((r) => r.status === "auto_replied").length,
      drafted: atlasRuns.filter((r) => r.status === "drafted").length,
      skippedNoConfig: atlasRuns.filter(
        (r) => r.status === "skipped_no_config",
      ).length,
      failed: atlasRuns.filter((r) => r.status === "failed").length,
    };

    return {
      range: { start, end, days },
      totals: {
        conversations: inWindow.length,
        conversationsPrev: inPrevWindow.length,
        atlasAutoReplied,
        operatorReplied,
        atlasResolutionRate,
        medianFirstResponseSeconds,
      },
      volumePerDay: volume,
      channelMix,
      atlasBreakdown,
    };
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

async function accessibleBrandIdSet(
  ctx: { db: { query: any } },
  operator: Doc<"operators">,
  workspaceId: Id<"workspaces">,
): Promise<Set<Id<"brands">>> {
  const brands = await ctx.db
    .query("brands")
    .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspaceId))
    .collect();
  const visible = brands.filter((b: Doc<"brands">) =>
    hasBrandAccess(operator, b._id),
  );
  return new Set(visible.map((b: Doc<"brands">) => b._id));
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function emptyOverview(start: number, end: number, days: number) {
  return {
    range: { start, end, days },
    totals: {
      conversations: 0,
      conversationsPrev: 0,
      atlasAutoReplied: 0,
      operatorReplied: 0,
      atlasResolutionRate: 0,
      medianFirstResponseSeconds: null,
    },
    volumePerDay: [] as { day: number; conversations: number }[],
    channelMix: (["web_chat", "email", "whatsapp", "voice"] as const).map(
      (ch) => ({ channel: ch, count: 0, pct: 0 }),
    ),
    atlasBreakdown: {
      autoReplied: 0,
      drafted: 0,
      skippedNoConfig: 0,
      failed: 0,
    },
  };
}

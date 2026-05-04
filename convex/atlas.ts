import { v, ConvexError } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import { hasBrandAccess } from "./brands";
import { pushActivity } from "./notifications";
import { fireEvent } from "./webhooks";

const DEFAULT_MODEL = "claude-haiku-4-5-20251001";
const DEFAULT_MAX_TOKENS = 512;
const DEFAULT_THRESHOLD = 0.8;
const DEFAULT_SYSTEM_PROMPT = `You are Atlas, the AI agent for the brand. Reply directly, briefly, and warmly — like a senior teammate who knows the product. If you genuinely don't know, say so and indicate the conversation should go to a human. Never invent product details, prices, policies, or commitments. Keep replies under 4 sentences unless the customer's question requires more.`;

// ── Dashboard CRUD ────────────────────────────────────────────────────

export const getConfig = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const config = await loadConfig(ctx, workspaceId);
    if (!config) return null;
    // Count chunks for the current KB version so the dashboard can
    // render the RAG status (e.g. "12 chunks indexed").
    const knowledgeBaseVersion = config.knowledgeBaseVersion ?? 0;
    let chunkCount = 0;
    if (config.voyageApiKey && knowledgeBaseVersion > 0) {
      const chunks = await ctx.db
        .query("atlasKnowledgeChunks")
        .withIndex("by_workspace_version", (q) =>
          q
            .eq("workspaceId", workspaceId)
            .eq("sourceVersion", knowledgeBaseVersion),
        )
        .collect();
      chunkCount = chunks.length;
    }
    return {
      _id: config._id,
      enabled: config.enabled,
      provider: config.provider,
      hasApiKey: Boolean(config.apiKey),
      model: config.model,
      systemPrompt: config.systemPrompt,
      knowledgeBase: config.knowledgeBase,
      hasVoyageKey: Boolean(config.voyageApiKey),
      voyageKeyPreview: config.voyageApiKey
        ? config.voyageApiKey.slice(0, 6) + "…"
        : null,
      knowledgeBaseVersion,
      chunkCount,
      autoReplyThreshold: config.autoReplyThreshold,
      maxTokens: config.maxTokens,
      updatedAt: config.updatedAt,
      kbSourceUrl: config.kbSourceUrl ?? null,
      kbIngestStatus: config.kbIngestStatus ?? null,
      kbIngestStartedAt: config.kbIngestStartedAt ?? null,
      kbIngestCompletedAt: config.kbIngestCompletedAt ?? null,
      kbIngestPagesFetched: config.kbIngestPagesFetched ?? null,
      kbIngestError: config.kbIngestError ?? null,
    };
  },
});

export const upsertConfig = mutation({
  args: {
    sessionToken: v.string(),
    enabled: v.boolean(),
    apiKey: v.optional(v.string()),
    model: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
    knowledgeBase: v.optional(v.string()),
    voyageApiKey: v.optional(v.string()),
    autoReplyThreshold: v.optional(v.number()),
    maxTokens: v.optional(v.number()),
  },
  returns: v.id("atlasConfigs"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can configure Atlas.");
    }

    const now = Date.now();
    const existing = await loadConfig(ctx, workspaceId);

    // Track whether the KB or voyage key changed; if so, schedule a
    // re-embed so retrieval stays in sync.
    let scheduleReembed = false;

    if (existing) {
      const patch: Record<string, unknown> = {
        enabled: args.enabled,
        updatedAt: now,
      };
      if (args.apiKey && args.apiKey.trim()) patch.apiKey = args.apiKey.trim();
      if (args.model) patch.model = args.model;
      if (args.systemPrompt !== undefined) patch.systemPrompt = args.systemPrompt;
      if (
        args.knowledgeBase !== undefined &&
        args.knowledgeBase !== existing.knowledgeBase
      ) {
        patch.knowledgeBase = args.knowledgeBase;
        scheduleReembed = true;
      }
      if (args.voyageApiKey && args.voyageApiKey.trim()) {
        patch.voyageApiKey = args.voyageApiKey.trim();
        scheduleReembed = true;
      }
      if (args.autoReplyThreshold !== undefined)
        patch.autoReplyThreshold = clampThreshold(args.autoReplyThreshold);
      if (args.maxTokens !== undefined) patch.maxTokens = args.maxTokens;
      if (scheduleReembed) {
        patch.knowledgeBaseVersion = (existing.knowledgeBaseVersion ?? 0) + 1;
      }
      await ctx.db.patch(existing._id, patch);
      if (scheduleReembed) {
        await ctx.scheduler.runAfter(0, internal.atlas.reembedKnowledgeBase, {
          workspaceId,
        });
      }
      return existing._id;
    }

    const id = await ctx.db.insert("atlasConfigs", {
      workspaceId,
      enabled: args.enabled,
      provider: "anthropic",
      apiKey: args.apiKey?.trim() ?? "",
      model: args.model ?? DEFAULT_MODEL,
      systemPrompt: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      knowledgeBase: args.knowledgeBase,
      voyageApiKey: args.voyageApiKey?.trim() || undefined,
      knowledgeBaseVersion: args.knowledgeBase && args.voyageApiKey ? 1 : 0,
      autoReplyThreshold: clampThreshold(
        args.autoReplyThreshold ?? DEFAULT_THRESHOLD,
      ),
      maxTokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
      createdBy: operator._id,
      createdAt: now,
      updatedAt: now,
    });
    if (args.knowledgeBase && args.voyageApiKey) {
      await ctx.scheduler.runAfter(0, internal.atlas.reembedKnowledgeBase, {
        workspaceId,
      });
    }
    return id;
  },
});

/**
 * Latest run for a conversation. Used by the inbox to show the most
 * recent Atlas suggestion / auto-reply / "no config" notice.
 */
export const latestRun = query({
  args: {
    sessionToken: v.string(),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, { sessionToken, conversationId }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);
    const convo = await ctx.db.get(conversationId);
    if (!convo || convo.workspaceId !== workspaceId) return null;
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) return null;
    const run = await ctx.db
      .query("atlasRuns")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", conversationId),
      )
      .order("desc")
      .first();
    return run;
  },
});

/**
 * Operator clicks "Use this reply" on an Atlas suggestion. We send the
 * stored draft as an operator-authored message and mark the run resolved.
 */
export const acceptSuggestion = mutation({
  args: {
    sessionToken: v.string(),
    runId: v.id("atlasRuns"),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== workspaceId) {
      throw new Error("Suggestion not found.");
    }
    const convo = await ctx.db.get(run.conversationId);
    if (!convo || convo.workspaceId !== workspaceId) {
      throw new Error("Conversation not found.");
    }
    if (convo.brandId && !hasBrandAccess(operator, convo.brandId)) {
      throw new Error("No access to this brand.");
    }
    if (!run.reply || run.status !== "drafted") {
      throw new Error("This suggestion has no draft to send.");
    }

    const channel = convo.channel ?? "web_chat";
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: run.conversationId,
      workspaceId,
      brandId: convo.brandId,
      channel,
      role: "operator",
      senderOperatorId: operator._id,
      body: run.reply,
      createdAt: now,
    });
    await ctx.db.patch(run.conversationId, {
      lastMessageAt: now,
      assignedOperatorId: convo.assignedOperatorId ?? operator._id,
      status: convo.status === "snoozed" ? "open" : convo.status,
    });
    await ctx.db.patch(args.runId, {
      status: "auto_replied",
      autoReplyMessageId: messageId,
      completedAt: now,
    });
    await fireEvent(ctx, workspaceId, "message.created", {
      messageId,
      conversationId: run.conversationId,
      brandId: convo.brandId,
      channel,
      role: "operator",
      via: "atlas_suggestion",
      body: run.reply,
      createdAt: now,
    });

    if (channel === "email") {
      await ctx.scheduler.runAfter(
        0,
        internal.emailIntegrations.sendOperatorReply,
        { messageId },
      );
    }
    return messageId;
  },
});

export const dismissSuggestion = mutation({
  args: { sessionToken: v.string(), runId: v.id("atlasRuns") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const run = await ctx.db.get(args.runId);
    if (!run || run.workspaceId !== workspaceId) return null;
    const convo = await ctx.db.get(run.conversationId);
    if (convo?.brandId && !hasBrandAccess(operator, convo.brandId)) return null;
    await ctx.db.delete(args.runId);
    return null;
  },
});

// ── Internal: triggered by every visitor message ──────────────────────

export const evaluate = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    triggerMessageId: v.id("messages"),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const ctxData = await ctx.runQuery(internal.atlas.loadEvaluationContext, {
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
    });
    if (!ctxData) return null;
    const { config, conversation, brand, history } = ctxData;

    // Visitor explicitly asked for a human — don't reply. We don't
    // even log a skipped run here; the operator's job from this point.
    if (conversation.atlasPaused) return null;

    // No config yet — record a "skipped" run so the dashboard can
    // surface "Atlas isn't configured" without polling settings.
    if (!config || !config.enabled || !config.apiKey) {
      await ctx.runMutation(internal.atlas.recordRun, {
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        triggerMessageId: args.triggerMessageId,
        status: "skipped_no_config",
        completedAt: Date.now(),
      });
      return null;
    }

    // Plan-limit gate. Once the workspace hits its monthly auto-reply
    // quota, Atlas stops generating until the next billing cycle (or an
    // upgrade). We log a `skipped_quota_exceeded` run so the dashboard
    // can surface the upgrade prompt; the conversation goes silent on
    // the visitor side until an operator picks it up from the inbox.
    const quota: { aiAutoReplied: number; planLimit: number } =
      await ctx.runQuery(internal.usage._quotaForWorkspace, {
        workspaceId: args.workspaceId,
      });
    if (quota.aiAutoReplied >= quota.planLimit) {
      await ctx.runMutation(internal.atlas.recordRun, {
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
        triggerMessageId: args.triggerMessageId,
        status: "skipped_quota_exceeded",
        completedAt: Date.now(),
      });
      return null;
    }

    const startId = await ctx.runMutation(internal.atlas.startRun, {
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      triggerMessageId: args.triggerMessageId,
      model: config.model,
    });

    try {
      // RAG: when Voyage is configured, embed the latest visitor message
      // and pull top-K relevant KB chunks. Inject only those into the
      // prompt instead of the full KB. When Voyage isn't set we fall
      // back to plain-text injection of the whole knowledge base.
      let kbForPrompt = config.knowledgeBase;
      if (config.voyageApiKey && (config.knowledgeBaseVersion ?? 0) > 0) {
        const lastVisitor = [...history]
          .reverse()
          .find((m) => m.role === "visitor");
        if (lastVisitor) {
          try {
            const chunks = await retrieveRelevantChunks({
              voyageApiKey: config.voyageApiKey,
              query: lastVisitor.body,
              workspaceId: args.workspaceId,
              version: config.knowledgeBaseVersion ?? 0,
              ctx,
              k: 4,
            });
            if (chunks.length > 0) {
              kbForPrompt = chunks
                .map((c, i) => `[#${i + 1}] ${c}`)
                .join("\n\n");
            }
          } catch (err) {
            // Retrieval failure is non-fatal — fall back to plain KB.
            console.warn("[atlas] retrieval failed", err);
          }
        }
      }

      const result = await callAnthropic({
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        systemPrompt: buildSystemPrompt(config.systemPrompt, brand, kbForPrompt),
        history: history.map((m) => ({
          role: m.role === "visitor" ? "user" : "assistant",
          content: m.body,
        })),
      });

      const shouldAutoReply =
        result.confidence >= config.autoReplyThreshold;

      if (shouldAutoReply) {
        await ctx.runMutation(internal.atlas.completeRunAndAutoReply, {
          runId: startId,
          conversationId: args.conversationId,
          workspaceId: args.workspaceId,
          brandId: conversation.brandId,
          channel: conversation.channel ?? "web_chat",
          reply: result.reply,
          confidence: result.confidence,
          reasoning: result.reasoning,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
        // Atlas tool calls — only fire on auto-reply (high confidence).
        // Drafts wait for operator review; if the operator accepts the
        // draft, they can schedule reminders manually.
        if (result.actions.length > 0) {
          await ctx.runMutation(internal.atlas._scheduleAtlasReminders, {
            workspaceId: args.workspaceId,
            brandId: conversation.brandId,
            conversationId: args.conversationId,
            visitorId: conversation.visitorId,
            actions: result.actions,
          });
        }
      } else {
        await ctx.runMutation(internal.atlas.completeRunAsDraft, {
          runId: startId,
          reply: result.reply,
          confidence: result.confidence,
          reasoning: result.reasoning,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
        });
      }
    } catch (err) {
      await ctx.runMutation(internal.atlas.failRun, {
        runId: startId,
        error: err instanceof Error ? err.message : "Atlas call failed.",
      });
    }
    return null;
  },
});

export const loadEvaluationContext = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const conversation = await ctx.db.get(args.conversationId);
    if (!conversation || conversation.workspaceId !== args.workspaceId) {
      return null;
    }
    const config = await loadConfig(ctx, args.workspaceId);
    const brand = await ctx.db.get(conversation.brandId);
    const history = await ctx.db
      .query("messages")
      .withIndex("by_conversation_created", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .order("asc")
      .take(40);
    return {
      conversation,
      config,
      brand,
      history: history.map((m) => ({ role: m.role, body: m.body })),
    };
  },
});

export const startRun = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    triggerMessageId: v.id("messages"),
    model: v.string(),
  },
  returns: v.id("atlasRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("atlasRuns", {
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      triggerMessageId: args.triggerMessageId,
      status: "pending",
      model: args.model,
      createdAt: Date.now(),
    });
  },
});

export const recordRun = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    triggerMessageId: v.id("messages"),
    status: v.union(
      v.literal("skipped_no_config"),
      v.literal("skipped_quota_exceeded"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  returns: v.id("atlasRuns"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("atlasRuns", {
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      triggerMessageId: args.triggerMessageId,
      status: args.status,
      error: args.error,
      createdAt: Date.now(),
      completedAt: args.completedAt,
    });
  },
});

export const completeRunAsDraft = internalMutation({
  args: {
    runId: v.id("atlasRuns"),
    reply: v.string(),
    confidence: v.number(),
    reasoning: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.runId, {
      status: "drafted",
      reply: args.reply,
      confidence: args.confidence,
      reasoning: args.reasoning,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      completedAt: Date.now(),
    });
    return null;
  },
});

export const completeRunAndAutoReply = internalMutation({
  args: {
    runId: v.id("atlasRuns"),
    conversationId: v.id("conversations"),
    workspaceId: v.id("workspaces"),
    brandId: v.id("brands"),
    channel: v.union(
      v.literal("web_chat"),
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("voice"),
      v.literal("sms"),
    ),
    reply: v.string(),
    confidence: v.number(),
    reasoning: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    const messageId = await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      workspaceId: args.workspaceId,
      brandId: args.brandId,
      channel: args.channel,
      role: "atlas",
      body: args.reply,
      createdAt: now,
    });
    await ctx.db.patch(args.conversationId, {
      lastMessageAt: now,
    });
    await ctx.db.patch(args.runId, {
      status: "auto_replied",
      reply: args.reply,
      confidence: args.confidence,
      reasoning: args.reasoning,
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      autoReplyMessageId: messageId,
      completedAt: now,
    });
    await fireEvent(ctx, args.workspaceId, "message.created", {
      messageId,
      conversationId: args.conversationId,
      brandId: args.brandId,
      channel: args.channel,
      role: "atlas",
      via: "atlas_auto_reply",
      body: args.reply,
      createdAt: now,
    });

    if (args.channel === "email") {
      await ctx.scheduler.runAfter(
        0,
        internal.emailIntegrations.sendOperatorReply,
        { messageId },
      );
    }
    return null;
  },
});

/**
 * Persist Atlas-scheduled reminders directly into the reminders
 * table. Channel is locked to "chat" — Atlas can't autonomously fire
 * email/SMS/WhatsApp/voice reminders without operator approval since
 * those would surprise visitors more.
 */
export const _scheduleAtlasReminders = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    brandId: v.id("brands"),
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
    actions: v.array(
      v.object({
        type: v.literal("schedule_reminder"),
        in_minutes: v.number(),
        body: v.string(),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const a of args.actions) {
      const sendAt = now + a.in_minutes * 60_000;
      await ctx.db.insert("reminders", {
        workspaceId: args.workspaceId,
        brandId: args.brandId,
        conversationId: args.conversationId,
        visitorId: args.visitorId,
        channel: "chat",
        sendAt,
        body: a.body,
        status: "pending",
        scheduledByOperatorId: undefined, // null = Atlas
        scheduledAt: now,
      });
    }
    return null;
  },
});

export const failRun = internalMutation({
  args: { runId: v.id("atlasRuns"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    await ctx.db.patch(args.runId, {
      status: "failed",
      error: args.error,
      completedAt: Date.now(),
    });
    if (run) {
      await pushActivity(ctx, {
        workspaceId: run.workspaceId,
        kind: "atlas_error",
        severity: "warn",
        title: "Atlas evaluation failed",
        body: args.error,
        link: "/app/atlas",
      });
    }
    return null;
  },
});

// ── Helpers ───────────────────────────────────────────────────────────

async function loadConfig(
  ctx: { db: { query: any } },
  workspaceId: string,
): Promise<Doc<"atlasConfigs"> | null> {
  return await ctx.db
    .query("atlasConfigs")
    .withIndex("by_workspace", (q: any) => q.eq("workspaceId", workspaceId))
    .first();
}

function clampThreshold(n: number): number {
  if (Number.isNaN(n)) return DEFAULT_THRESHOLD;
  return Math.max(0, Math.min(1, n));
}

function buildSystemPrompt(
  base: string,
  brand: Doc<"brands"> | null,
  knowledgeBase: string | undefined,
): string {
  const parts: string[] = [base];
  if (brand) {
    parts.push(
      `\n\nBrand: ${brand.name}. Welcome message in widget: "${brand.welcomeMessage}".`,
    );
  }
  if (knowledgeBase && knowledgeBase.trim()) {
    parts.push(
      `\n\nKnowledge base (only cite facts from here; never invent):\n${knowledgeBase.trim()}`,
    );
  }
  parts.push(
    `\n\nReturn JSON ONLY (no markdown), with the shape:
{
  "reply": string,
  "confidence": number between 0 and 1,
  "reasoning": short string,
  "actions": optional array of action objects
}

Confidence reflects how sure you are the reply is correct + on-policy. If confidence < ${DEFAULT_THRESHOLD}, the reply is held as a draft for a human operator to review. Be honest about uncertainty.

Available actions (only emit when genuinely useful — over-scheduling annoys visitors):

  { "type": "schedule_reminder", "in_minutes": number, "body": string }
    Schedules a chat-channel follow-up reminder for this conversation.
    Use sparingly — e.g. "follow up tomorrow if no response" after the
    visitor goes quiet on a real task. Don't schedule for trivial chats.
    Body should be a short friendly message addressed to the visitor
    (e.g. "Just checking in — did the docs help?"). Max +14 days out.
    Actions only fire when you also auto-reply (high confidence). On
    drafts (held for operator review), actions are ignored.`,
  );
  return parts.join("");
}

export type AtlasAction = {
  type: "schedule_reminder";
  in_minutes: number;
  body: string;
};

async function callAnthropic(args: {
  apiKey: string;
  model: string;
  maxTokens: number;
  systemPrompt: string;
  history: { role: "user" | "assistant"; content: string }[];
}): Promise<{
  reply: string;
  confidence: number;
  reasoning: string;
  actions: AtlasAction[];
  inputTokens?: number;
  outputTokens?: number;
}> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: args.maxTokens,
      system: args.systemPrompt,
      messages: args.history.length
        ? args.history
        : [{ role: "user", content: "Hello" }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Anthropic API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content?: { type: string; text?: string }[];
    usage?: { input_tokens?: number; output_tokens?: number };
  };
  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  // The model is asked to return JSON; tolerate code-fenced output.
  const clean = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  let parsed: {
    reply?: unknown;
    confidence?: unknown;
    reasoning?: unknown;
    actions?: unknown;
  };
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Fall back to treating the entire body as the reply with mid confidence.
    return {
      reply: text.trim() || "Let me get a teammate to help you with that.",
      confidence: 0.4,
      reasoning: "Model returned non-JSON output; downgraded to draft.",
      actions: [],
      inputTokens: data.usage?.input_tokens,
      outputTokens: data.usage?.output_tokens,
    };
  }
  const reply = typeof parsed.reply === "string" ? parsed.reply : "";
  const confidence =
    typeof parsed.confidence === "number"
      ? Math.max(0, Math.min(1, parsed.confidence))
      : 0.4;
  const reasoning =
    typeof parsed.reasoning === "string" ? parsed.reasoning : "";
  const actions = parseActions(parsed.actions);
  return {
    reply: reply || "Let me get a teammate to help you with that.",
    confidence,
    reasoning,
    actions,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}

function parseActions(raw: unknown): AtlasAction[] {
  if (!Array.isArray(raw)) return [];
  const out: AtlasAction[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (a.type === "schedule_reminder") {
      const inMinutes =
        typeof a.in_minutes === "number" ? Math.round(a.in_minutes) : 0;
      const body = typeof a.body === "string" ? a.body.trim() : "";
      // Sanity bounds: between +1 minute and +14 days. Skip junk.
      if (inMinutes < 1 || inMinutes > 14 * 24 * 60) continue;
      if (!body) continue;
      out.push({ type: "schedule_reminder", in_minutes: inMinutes, body });
    }
    // Future action types slot in here; unknown types are dropped.
  }
  return out.slice(0, 3); // hard cap — model can't queue dozens
}

// ── RAG: chunking + Voyage embeddings + retrieval ─────────────────────

const CHUNK_SIZE = 600;
const CHUNK_OVERLAP = 100;
const VOYAGE_EMBED_MODEL = "voyage-3-lite";
const VOYAGE_RERANK_MODEL = "rerank-2";

/**
 * Naive sliding-window chunker. We split on paragraph boundaries when
 * possible, then enforce CHUNK_SIZE as a hard cap with CHUNK_OVERLAP
 * between adjacent chunks. Good enough for FAQ / docs up to ~500KB.
 */
function chunkText(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.length <= CHUNK_SIZE) return [trimmed];

  const chunks: string[] = [];
  let pos = 0;
  while (pos < trimmed.length) {
    const end = Math.min(pos + CHUNK_SIZE, trimmed.length);
    // Prefer to break on the last paragraph or sentence boundary
    // within the window so chunks aren't sliced mid-sentence.
    let cutPoint = end;
    if (end < trimmed.length) {
      const slice = trimmed.slice(pos, end);
      const para = slice.lastIndexOf("\n\n");
      const sentence = slice.lastIndexOf(". ");
      const breakAt = Math.max(para, sentence);
      if (breakAt > CHUNK_SIZE * 0.5) {
        cutPoint = pos + breakAt + 1;
      }
    }
    chunks.push(trimmed.slice(pos, cutPoint).trim());
    if (cutPoint >= trimmed.length) break;
    pos = Math.max(0, cutPoint - CHUNK_OVERLAP);
  }
  return chunks.filter((c) => c.length > 0);
}

async function voyageEmbed(args: {
  apiKey: string;
  inputs: string[];
  inputType: "document" | "query";
}): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: VOYAGE_EMBED_MODEL,
      input: args.inputs,
      input_type: args.inputType,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return data.data.map((d) => d.embedding);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Internal action — re-embeds the workspace's KB. Called by upsertConfig
 * whenever the KB or voyageApiKey changes. Drops chunks from prior
 * versions; the version field on atlasConfigs is bumped before this
 * fires, so chunks tagged with stale versions are obvious.
 */
export const reembedKnowledgeBase = internalAction({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const config = await ctx.runQuery(internal.atlas.loadConfigForReembed, {
      workspaceId: args.workspaceId,
    });
    if (!config || !config.voyageApiKey) return null;
    const version = config.knowledgeBaseVersion ?? 0;
    if (version === 0) return null;

    // Drop any existing chunks for this workspace (any version) so the
    // table doesn't accumulate stale rows.
    await ctx.runMutation(internal.atlas.dropAllChunksForWorkspace, {
      workspaceId: args.workspaceId,
    });

    const kb = (config.knowledgeBase ?? "").trim();
    if (!kb) return null;
    const pieces = chunkText(kb);
    if (pieces.length === 0) return null;

    let embeddings: number[][];
    try {
      embeddings = await voyageEmbed({
        apiKey: config.voyageApiKey,
        inputs: pieces,
        inputType: "document",
      });
    } catch (err) {
      await ctx.runMutation(internal.atlas.recordReembedFailure, {
        workspaceId: args.workspaceId,
        error: err instanceof Error ? err.message : "Voyage embed failed",
      });
      return null;
    }

    await ctx.runMutation(internal.atlas.insertChunks, {
      workspaceId: args.workspaceId,
      version,
      chunks: pieces.map((text, idx) => ({
        chunkIndex: idx,
        chunkText: text,
        embedding: embeddings[idx],
      })),
    });
    return null;
  },
});

export const loadConfigForReembed = internalQuery({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, { workspaceId }) => {
    const config = await loadConfig(ctx, workspaceId);
    if (!config) return null;
    return {
      voyageApiKey: config.voyageApiKey,
      knowledgeBase: config.knowledgeBase,
      knowledgeBaseVersion: config.knowledgeBaseVersion,
    };
  },
});

export const dropAllChunksForWorkspace = internalMutation({
  args: { workspaceId: v.id("workspaces") },
  returns: v.null(),
  handler: async (ctx, { workspaceId }) => {
    const all = await ctx.db
      .query("atlasKnowledgeChunks")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    for (const c of all) await ctx.db.delete(c._id);
    return null;
  },
});

export const insertChunks = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    version: v.number(),
    chunks: v.array(
      v.object({
        chunkIndex: v.number(),
        chunkText: v.string(),
        embedding: v.array(v.number()),
      }),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    for (const c of args.chunks) {
      await ctx.db.insert("atlasKnowledgeChunks", {
        workspaceId: args.workspaceId,
        sourceVersion: args.version,
        chunkIndex: c.chunkIndex,
        chunkText: c.chunkText,
        embedding: c.embedding,
        createdAt: now,
      });
    }
    return null;
  },
});

export const recordReembedFailure = internalMutation({
  args: { workspaceId: v.id("workspaces"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pushActivity(ctx, {
      workspaceId: args.workspaceId,
      kind: "atlas_error",
      severity: "error",
      title: "Atlas re-embed failed",
      body: args.error,
      link: "/app/atlas",
    });
    return null;
  },
});

export const loadChunksForWorkspace = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    version: v.number(),
  },
  handler: async (ctx, args) => {
    const chunks = await ctx.db
      .query("atlasKnowledgeChunks")
      .withIndex("by_workspace_version", (q) =>
        q
          .eq("workspaceId", args.workspaceId)
          .eq("sourceVersion", args.version),
      )
      .collect();
    return chunks.map((c) => ({
      chunkText: c.chunkText,
      embedding: c.embedding,
    }));
  },
});

/**
 * Two-stage retrieval:
 *   1. Embed the query with voyage-3-lite, cosine-rank the stored
 *      chunks, take the top RERANK_CANDIDATES (e.g. 20).
 *   2. Pass those candidates through Voyage's rerank-2 model to
 *      get a query-conditioned relevance score, then take the
 *      top K (e.g. 4) for the prompt.
 *
 * Rerank materially improves quality — the embedding model is fast
 * but coarse; rerank reads query+chunk together and orders by
 * actual semantic relevance. If the rerank call fails we fall
 * back gracefully to the embedding-only ordering.
 */
const RERANK_CANDIDATES = 20;

async function retrieveRelevantChunks(args: {
  voyageApiKey: string;
  query: string;
  workspaceId: import("./_generated/dataModel").Id<"workspaces">;
  version: number;
  ctx: import("convex/server").GenericActionCtx<
    import("./_generated/dataModel").DataModel
  >;
  k: number;
}): Promise<string[]> {
  const chunks: Array<{ chunkText: string; embedding: number[] }> =
    await args.ctx.runQuery(internal.atlas.loadChunksForWorkspace, {
      workspaceId: args.workspaceId,
      version: args.version,
    });
  if (chunks.length === 0) return [];

  const [queryVec] = await voyageEmbed({
    apiKey: args.voyageApiKey,
    inputs: [args.query],
    inputType: "query",
  });

  const scored = chunks.map((c) => ({
    text: c.chunkText,
    score: cosineSimilarity(queryVec, c.embedding),
  }));
  scored.sort((a, b) => b.score - a.score);
  const candidates = scored.slice(0, RERANK_CANDIDATES);
  if (candidates.length <= args.k) {
    // Fewer candidates than the prompt cap — rerank wouldn't change
    // the result, skip the network call.
    return candidates.map((c) => c.text);
  }

  try {
    const reranked = await voyageRerank({
      apiKey: args.voyageApiKey,
      query: args.query,
      documents: candidates.map((c) => c.text),
      topK: args.k,
    });
    return reranked;
  } catch (err) {
    console.warn("[atlas] rerank failed, falling back to embedding-only", err);
    return candidates.slice(0, args.k).map((c) => c.text);
  }
}

/**
 * Voyage rerank-2 — query-conditioned relevance scoring on a list
 * of candidate documents. Returns the top-K original document
 * strings in the rerank's preferred order.
 */
async function voyageRerank(args: {
  apiKey: string;
  query: string;
  documents: string[];
  topK: number;
}): Promise<string[]> {
  const res = await fetch("https://api.voyageai.com/v1/rerank", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: VOYAGE_RERANK_MODEL,
      query: args.query,
      documents: args.documents,
      top_k: args.topK,
      return_documents: false,
    }),
  });
  if (!res.ok) {
    throw new Error(`Voyage rerank ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    data: Array<{ index: number; relevance_score: number }>;
  };
  return data.data
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .map((r) => args.documents[r.index])
    .filter((s): s is string => typeof s === "string");
}

// ── Website-crawl knowledge-base ingest ───────────────────────────────
//
// Customer pastes their website URL; we fetch the sitemap (or crawl
// from the homepage), extract page text, concatenate into the KB
// field, and trigger the existing Voyage re-embed path. Cap at
// MAX_PAGES so a giant docs site doesn't blow out the KB.

const MAX_PAGES = 60;
const MAX_CRAWL_DEPTH = 3;
const FETCH_TIMEOUT_MS = 8_000;
const SKIP_EXTENSIONS = [
  ".pdf",
  ".zip",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".svg",
  ".webp",
  ".mp4",
  ".mov",
  ".css",
  ".js",
  ".ico",
  ".xml",
  ".json",
];

/**
 * Public mutation. Admin pastes a URL; we stash the URL + flip status
 * to "pending" and schedule the crawl action. The action does the
 * fetching and writes the assembled KB.
 */
export const startKbWebsiteIngest = mutation({
  args: {
    sessionToken: v.string(),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Wrap the whole body so unexpected errors (schema validation,
    // missing scheduled function ref, transient infra hiccup) surface
    // to the client with a real message instead of Convex's generic
    // "Server Error" mask. ConvexErrors pass through unchanged.
    // Marker "DIAG-V3" lets us tell from the client-side error alone
    // whether this build is live on prod. If you see "Server Error"
    // without the DIAG-V3 string, prod is on an older function.
    console.log("[startKbWebsiteIngest] DIAG-V3 handler entered", {
      hasUrl: typeof args.url === "string" && args.url.length > 0,
    });
    try {
      const { operator, workspaceId } = await requireOperator(
        ctx,
        args.sessionToken,
      );
      if (operator.role === "agent") {
        throw new ConvexError(
          "Only admins and owners can ingest website KBs.",
        );
      }
      const normalised = normaliseUrl(args.url);
      if (!normalised) {
        throw new ConvexError(
          "Couldn't parse that URL — needs http:// or https://, and a public hostname.",
        );
      }
      const config = await loadConfig(ctx, workspaceId);
      if (!config) {
        throw new ConvexError(
          "Atlas isn't configured for this workspace yet. Open Atlas settings and add an Anthropic API key first.",
        );
      }
      if (config.kbIngestStatus === "running") {
        throw new ConvexError(
          "An ingest is already running — wait for it to finish.",
        );
      }
      await ctx.db.patch(config._id, {
        kbSourceUrl: normalised,
        kbIngestStatus: "pending",
        kbIngestStartedAt: Date.now(),
        kbIngestCompletedAt: undefined,
        kbIngestPagesFetched: undefined,
        kbIngestError: undefined,
      });
      await ctx.scheduler.runAfter(0, internal.atlas._runWebsiteIngest, {
        workspaceId,
        url: normalised,
      });
      return null;
    } catch (err) {
      if (err instanceof ConvexError) throw err;
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown error scheduling the website crawl.";
      // Logged server-side so we can grep `convex logs` later.
      console.error("[startKbWebsiteIngest] DIAG-V3 non-ConvexError:", err);
      throw new ConvexError(`DIAG-V3 Couldn't start the crawl: ${message}`);
    }
  },
});

export const _setKbIngestStatus = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    error: v.optional(v.string()),
    pagesFetched: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await loadConfig(ctx, args.workspaceId);
    if (!config) return null;
    const patch: Record<string, unknown> = { kbIngestStatus: args.status };
    if (args.error !== undefined) patch.kbIngestError = args.error;
    if (args.pagesFetched !== undefined)
      patch.kbIngestPagesFetched = args.pagesFetched;
    if (args.status === "completed" || args.status === "failed") {
      patch.kbIngestCompletedAt = Date.now();
    }
    await ctx.db.patch(config._id, patch);
    return null;
  },
});

/**
 * Write the assembled KB text into the config + bump the version. We
 * intentionally don't go through upsertConfig because we already have
 * the resolved values + want to skip the role check (the action runs
 * after the original admin's call already passed it).
 */
export const _writeIngestedKb = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    knowledgeBase: v.string(),
    pagesFetched: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const config = await loadConfig(ctx, args.workspaceId);
    if (!config) return null;
    const nextVersion = (config.knowledgeBaseVersion ?? 0) + 1;
    await ctx.db.patch(config._id, {
      knowledgeBase: args.knowledgeBase,
      knowledgeBaseVersion: nextVersion,
      kbIngestStatus: "completed",
      kbIngestCompletedAt: Date.now(),
      kbIngestPagesFetched: args.pagesFetched,
      kbIngestError: undefined,
      updatedAt: Date.now(),
    });
    if (config.voyageApiKey) {
      await ctx.scheduler.runAfter(0, internal.atlas.reembedKnowledgeBase, {
        workspaceId: args.workspaceId,
      });
    }
    return null;
  },
});

export const _runWebsiteIngest = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    url: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await ctx.runMutation(internal.atlas._setKbIngestStatus, {
      workspaceId: args.workspaceId,
      status: "running",
    });

    try {
      const origin = new URL(args.url).origin;
      // Respect robots.txt up front so we don't waste fetches on
      // routes the site explicitly opts out of indexing.
      const disallow = await fetchRobotsDisallow(origin);
      const urls = await discoverUrls(args.url, disallow);
      if (urls.length === 0) {
        throw new Error(
          `No reachable pages from ${args.url}. Check the URL is publicly accessible.`,
        );
      }

      const pages: ExtractedPage[] = [];
      const canonicalSeen = new Set<string>();
      let jsRenderedSkipped = 0;
      let fetchedButTooShort = 0;
      let fetchFailed = 0;
      for (const u of urls) {
        if (pages.length >= MAX_PAGES) break;
        const page = await fetchAndExtract(u);
        if (!page) {
          fetchFailed++;
          continue;
        }
        if (page.jsRendered) {
          jsRenderedSkipped++;
          continue;
        }
        // Canonical-URL dedup: two URLs (e.g. /docs/foo and /docs/foo?ref=…)
        // can canonicalise to the same page; keep just the first.
        const dedupeKey = page.canonicalUrl ?? page.url;
        if (canonicalSeen.has(dedupeKey)) continue;
        canonicalSeen.add(dedupeKey);
        // Threshold lowered from 80 → 30 chars: even a thin marketing
        // landing ("Welcome to Acme — premium doodads") clears 30 and
        // is genuinely useful in a KB.
        if (page.text.length > 30) {
          pages.push(page);
        } else {
          fetchedButTooShort++;
        }
      }

      if (pages.length === 0) {
        let msg: string;
        if (jsRenderedSkipped > 0) {
          msg = `Crawled the site but every page (${jsRenderedSkipped}) appears to be JS-rendered — Atlas can only read server-rendered HTML. Try linking your sitemap.xml of static-rendered pages directly, or pre-render the routes you want indexed.`;
        } else if (fetchedButTooShort > 0) {
          msg = `Crawled ${urls.length} URL(s) — ${fetchedButTooShort} returned HTML but each had under 30 chars of extractable text after stripping nav/scripts. Your pages may be image-heavy, behind auth, or use unusual markup.`;
        } else if (fetchFailed > 0) {
          msg = `Crawled ${urls.length} URL(s) but every fetch failed (${fetchFailed} non-200 / non-HTML responses). Check that the URL is publicly reachable and serves text/html.`;
        } else {
          msg = `Crawled ${urls.length} URL(s) but didn't find any text content. The site may be empty, gated, or render entirely client-side.`;
        }
        throw new Error(msg);
      }

      const assembled = pages.map(formatPageForKb).join("\n");
      // Clamp to a sane size — Voyage chunking + Anthropic context will
      // cope, but a 5MB KB just means we wasted bandwidth.
      const KB_MAX_CHARS = 500_000;
      const finalKb =
        assembled.length > KB_MAX_CHARS
          ? assembled.slice(0, KB_MAX_CHARS) +
            "\n\n[truncated — KB exceeded 500KB cap]"
          : assembled;

      await ctx.runMutation(internal.atlas._writeIngestedKb, {
        workspaceId: args.workspaceId,
        knowledgeBase: finalKb,
        pagesFetched: pages.length,
      });
      // jsRenderedSkipped count is informational — surfaced via
      // pagesFetched + the next ingest's banner if all were skipped.
      void jsRenderedSkipped;
    } catch (err) {
      await ctx.runMutation(internal.atlas._setKbIngestStatus, {
        workspaceId: args.workspaceId,
        status: "failed",
        error: err instanceof Error ? err.message : "Crawl failed.",
      });
    }
    return null;
  },
});

type ExtractedPage = {
  url: string;
  title: string;
  description: string | null;
  h1: string | null;
  canonicalUrl: string | null;
  text: string;
  jsRendered: boolean;
};

function formatPageForKb(p: ExtractedPage): string {
  const headerLines: string[] = [`# ${p.title || p.url}`];
  if (p.h1 && p.h1 !== p.title) headerLines.push(`## ${p.h1}`);
  headerLines.push(`URL: ${p.canonicalUrl ?? p.url}`);
  if (p.description) headerLines.push(`Description: ${p.description}`);
  return `${headerLines.join("\n")}\n\n${p.text}\n\n---\n`;
}

function normaliseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = "https://" + candidate;
  }
  try {
    const u = new URL(candidate);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || !u.hostname.includes(".")) return null;
    if (isPrivateHost(u.hostname)) return null;
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

/**
 * Best-effort SSRF guard. Convex's V8 fetch doesn't expose a
 * pre-request DNS hook, so we can only reject hostnames that *parse*
 * as private IP literals or well-known cloud-metadata hostnames. A
 * malicious DNS record pointing a public name at a private IP would
 * still get through — for that, the right defence is to deploy
 * outbound network egress rules at the platform layer. This blocks
 * the easy attacks (paste-a-private-IP, paste-the-metadata-host) and
 * is a reasonable default while we don't run our own resolver.
 */
function isPrivateHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (h === "metadata.google.internal") return true;
  if (h === "metadata.azure.com") return true;
  // IPv4 literal? Block private ranges + link-local + loopback + null.
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local incl. AWS/GCP metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    return false;
  }
  // IPv6: refuse loopback, link-local, ULA. Easy literal forms only.
  if (h.startsWith("[")) {
    const inner = h.slice(1, h.lastIndexOf("]"));
    if (inner === "::1") return true;
    if (inner.startsWith("fe80:")) return true;
    if (inner.startsWith("fc") || inner.startsWith("fd")) return true;
  }
  return false;
}

function shouldSkipUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return SKIP_EXTENSIONS.some((ext) => {
    const i = lower.indexOf(ext);
    if (i < 0) return false;
    // Must end the path or be followed by a query/fragment.
    const next = lower[i + ext.length] ?? "";
    return next === "" || next === "?" || next === "#";
  });
}

async function fetchWithTimeout(url: string): Promise<Response | null> {
  // SSRF guard at fetch time too, not just at URL-parse time. Catches
  // BFS-discovered links that point at private hosts even if the
  // operator's seed URL passed the original check. Two layers:
  //   1. Hostname literal check (cheap, synchronous) — IP literals
  //      and metadata host names.
  //   2. DoH resolution — catch DNS-rebinding attacks where a public
  //      hostname resolves to a private IP. Costs one extra fetch
  //      per host but is gated by a per-host cache so we don't pay
  //      it for every page during a 60-page crawl.
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (isPrivateHost(parsed.hostname)) return null;
  const dohSafe = await isDohSafe(parsed.hostname);
  if (!dohSafe) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    // redirect: "manual" + manual chase so each hop is re-validated
    // against isPrivateHost before we follow. fetch's "follow" mode
    // would silently redirect a public URL to an internal one.
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: {
          "user-agent":
            "PraxTalkAtlasBot/1.0 (+https://www.praxtalk.com — knowledge base ingest)",
          accept: "text/html,application/xhtml+xml,application/xml,text/plain",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location");
        if (!loc) return res;
        const next = new URL(loc, current).toString();
        const nextHost = new URL(next).hostname;
        if (isPrivateHost(nextHost)) return null;
        if (!(await isDohSafe(nextHost))) return null;
        current = next;
        continue;
      }
      return res;
    }
    return null; // too many redirects
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Per-host DoH resolution cache. Crawls hit dozens of URLs against
 * the same host; resolving once per crawl is plenty. Map lives for
 * the action's lifetime, no need for a TTL — each crawl gets a
 * fresh action invocation.
 */
const dohCache = new Map<string, boolean>();

/**
 * Resolve `hostname` via Cloudflare DNS-over-HTTPS (1.1.1.1 JSON
 * API) and refuse if any A/AAAA record points at a private range.
 * This is the second leg of SSRF defence — isPrivateHost catches
 * literals, this catches DNS-rebinding (a public name pointed at a
 * private IP). Failures are logged and DEFAULT TO FALSE so a
 * resolver outage doesn't accidentally allow unsafe fetches.
 */
async function isDohSafe(hostname: string): Promise<boolean> {
  // IP literals are already filtered by isPrivateHost; skip DoH for
  // those (Cloudflare DoH refuses non-name queries anyway).
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true;
  if (hostname.startsWith("[")) return true;
  const cached = dohCache.get(hostname);
  if (cached !== undefined) return cached;
  try {
    // Query A + AAAA in parallel.
    const [a, aaaa] = await Promise.all([
      fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(2_500),
        },
      ).then((r) => (r.ok ? r.json() : { Answer: [] })),
      fetch(
        `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=AAAA`,
        {
          headers: { accept: "application/dns-json" },
          signal: AbortSignal.timeout(2_500),
        },
      ).then((r) => (r.ok ? r.json() : { Answer: [] })),
    ]);
    type DnsAnswer = { type?: number; data?: string };
    const ips: string[] = [];
    for (const ans of [...((a as { Answer?: DnsAnswer[] }).Answer ?? []),
                       ...((aaaa as { Answer?: DnsAnswer[] }).Answer ?? [])]) {
      if (typeof ans.data === "string") ips.push(ans.data);
    }
    if (ips.length === 0) {
      // No A/AAAA records — host doesn't actually resolve. Refuse.
      dohCache.set(hostname, false);
      return false;
    }
    for (const ip of ips) {
      if (isPrivateHost(ip) || isPrivateHost(`[${ip}]`)) {
        console.warn("[atlas-ssrf] refused", hostname, "→", ip);
        dohCache.set(hostname, false);
        return false;
      }
    }
    dohCache.set(hostname, true);
    return true;
  } catch (err) {
    // Resolver failure: fail closed. Better to drop a few legitimate
    // pages than to let a rebinding attack through.
    console.warn("[atlas-ssrf] DoH query failed for", hostname, err);
    dohCache.set(hostname, false);
    return false;
  }
}

/**
 * Try the site's sitemap.xml first; fall back to a same-origin BFS
 * from the supplied URL. Returns a unique, deduplicated list of URLs
 * to fetch (caller still applies MAX_PAGES). The root URL is always
 * included first. Skips paths matching the robots.txt Disallow rules.
 */
async function discoverUrls(
  rootUrl: string,
  disallow: string[],
): Promise<string[]> {
  const root = new URL(rootUrl);
  const origin = root.origin;
  const seen = new Set<string>([rootUrl]);
  const ordered: string[] = [rootUrl];
  const isAllowed = (url: string) => !isDisallowed(url, disallow);

  // 1) sitemap.xml — single fetch, parses fast, gives us the
  // canonical page list when the site exposes one.
  const sitemapUrls = await fetchSitemap(origin);
  for (const u of sitemapUrls) {
    if (seen.size >= MAX_PAGES * 2) break;
    if (!u.startsWith(origin)) continue;
    if (shouldSkipUrl(u)) continue;
    if (!isAllowed(u)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    ordered.push(u);
  }
  if (ordered.length >= MAX_PAGES) return ordered;

  // 2) BFS from the root URL up to MAX_CRAWL_DEPTH.
  type QueueItem = { url: string; depth: number };
  const queue: QueueItem[] = [{ url: rootUrl, depth: 0 }];
  while (queue.length > 0 && ordered.length < MAX_PAGES) {
    const next = queue.shift();
    if (!next) break;
    if (next.depth >= MAX_CRAWL_DEPTH) continue;
    const links = await extractLinksFrom(next.url, origin);
    for (const link of links) {
      if (ordered.length >= MAX_PAGES) break;
      if (seen.has(link)) continue;
      if (shouldSkipUrl(link)) continue;
      if (!isAllowed(link)) continue;
      seen.add(link);
      ordered.push(link);
      queue.push({ url: link, depth: next.depth + 1 });
    }
  }
  return ordered;
}

/**
 * Fetch /robots.txt and collect Disallow patterns that apply to our
 * crawler. We only honour the wildcard `User-agent: *` block — sites
 * specifically targeting our user-agent is vanishingly rare for a
 * brand-new product. Returns prefix paths to refuse.
 */
async function fetchRobotsDisallow(origin: string): Promise<string[]> {
  const res = await fetchWithTimeout(`${origin}/robots.txt`);
  if (!res || !res.ok) return [];
  const text = await res.text();
  const out: string[] = [];
  let inWildcardBlock = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const m = line.match(/^(user-agent|disallow|allow):\s*(.*)$/i);
    if (!m) continue;
    const directive = m[1].toLowerCase();
    const value = m[2].trim();
    if (directive === "user-agent") {
      inWildcardBlock = value === "*";
    } else if (directive === "disallow" && inWildcardBlock && value) {
      // Skip `Disallow:` (empty) which means "allow everything".
      out.push(value);
    }
  }
  return out;
}

function isDisallowed(url: string, disallow: string[]): boolean {
  if (disallow.length === 0) return false;
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return false;
  }
  return disallow.some((rule) => {
    if (rule === "/") return true;
    return path.startsWith(rule);
  });
}

async function fetchSitemap(origin: string): Promise<string[]> {
  const res = await fetchWithTimeout(`${origin}/sitemap.xml`);
  if (!res || !res.ok) return [];
  const text = await res.text();
  const out: string[] = [];
  // Parse <loc>…</loc> entries — handles both sitemap and sitemap-index
  // formats since both use <loc>.
  const matches = text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi);
  for (const m of matches) {
    const url = m[1];
    if (!url) continue;
    // Sitemap-index: nested sitemaps end in .xml — fetch one more level.
    if (url.endsWith(".xml") && url.startsWith(origin)) {
      const nestedRes = await fetchWithTimeout(url);
      if (!nestedRes || !nestedRes.ok) continue;
      const nestedText = await nestedRes.text();
      const nestedMatches = nestedText.matchAll(
        /<loc>\s*([^<\s]+)\s*<\/loc>/gi,
      );
      for (const nm of nestedMatches) out.push(nm[1]);
    } else {
      out.push(url);
    }
    if (out.length >= MAX_PAGES * 2) break;
  }
  return out;
}

async function extractLinksFrom(
  url: string,
  origin: string,
): Promise<string[]> {
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return [];
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("text/html")) return [];
  const html = await res.text();
  const out: string[] = [];
  // Two link patterns: standard <a href="…">, and <link rel="next">
  // for paginated docs. The latter routinely matters for blogs and
  // archive pages (rel="next" / rel="prev" are part of HTML5).
  const hrefMatches = html.matchAll(/href\s*=\s*["']([^"'#]+)["']/gi);
  for (const m of hrefMatches) {
    try {
      const resolved = new URL(m[1], url).toString();
      if (!resolved.startsWith(origin)) continue;
      const cleaned = resolved.split("#")[0];
      out.push(cleaned);
    } catch {
      // Bad href — skip.
    }
  }
  const nextMatches = html.matchAll(
    /<link[^>]+rel\s*=\s*["']next["'][^>]+href\s*=\s*["']([^"'#]+)["']/gi,
  );
  for (const m of nextMatches) {
    try {
      const resolved = new URL(m[1], url).toString();
      if (!resolved.startsWith(origin)) continue;
      out.push(resolved.split("#")[0]);
    } catch {
      // Skip.
    }
  }
  return out;
}

async function fetchAndExtract(
  url: string,
): Promise<ExtractedPage | null> {
  const res = await fetchWithTimeout(url);
  if (!res || !res.ok) return null;
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("text/html")) return null;
  const html = await res.text();
  const meta = extractMeta(html, url);
  const text = htmlToText(html);
  // Heuristic JS-render detection: very-short body + significant
  // <noscript> content suggests a SPA shell where Atlas can't see
  // the real content. Threshold tuned so static pages without much
  // copy (e.g. a thin landing page) still pass.
  const hasNoscriptShell =
    /<noscript[\s\S]{0,5000}?<\/noscript>/i.test(html) &&
    /please\s+enable\s+javascript|requires\s+javascript|you\s+need\s+to\s+enable\s+javascript/i.test(
      html,
    );
  const jsRendered = text.length < 120 && hasNoscriptShell;
  return {
    url,
    title: meta.title || meta.ogTitle || "",
    description: meta.description || meta.ogDescription || null,
    h1: meta.h1,
    canonicalUrl: meta.canonicalUrl,
    text,
    jsRendered,
  };
}

function extractMeta(
  html: string,
  pageUrl: string,
): {
  title: string;
  description: string | null;
  ogTitle: string;
  ogDescription: string | null;
  h1: string | null;
  canonicalUrl: string | null;
} {
  const grabAttr = (re: RegExp): string | null => {
    const m = html.match(re);
    return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : null;
  };
  const title =
    grabAttr(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? "";
  const description = grabAttr(
    /<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']*)["']/i,
  );
  const ogTitle =
    grabAttr(
      /<meta[^>]+property\s*=\s*["']og:title["'][^>]+content\s*=\s*["']([^"']*)["']/i,
    ) ?? "";
  const ogDescription = grabAttr(
    /<meta[^>]+property\s*=\s*["']og:description["'][^>]+content\s*=\s*["']([^"']*)["']/i,
  );
  const h1 = grabAttr(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  // Canonical href can be absolute or relative — resolve against the page URL.
  const canonicalRaw = grabAttr(
    /<link[^>]+rel\s*=\s*["']canonical["'][^>]+href\s*=\s*["']([^"']*)["']/i,
  );
  let canonicalUrl: string | null = null;
  if (canonicalRaw) {
    try {
      canonicalUrl = new URL(canonicalRaw, pageUrl).toString();
    } catch {
      canonicalUrl = null;
    }
  }
  return {
    title,
    description,
    ogTitle,
    ogDescription,
    h1: h1 ? stripInlineTags(h1) : null,
    canonicalUrl,
  };
}

function stripInlineTags(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strip HTML to plain text. Drops <script>, <style>, <noscript>, <nav>,
 * <header>, <footer>, <aside>, <form>, then collapses whitespace.
 * Good enough for content extraction; not as smart as Mozilla's
 * Readability but ships in V8 with no deps.
 */
function htmlToText(html: string): string {
  let s = html;
  // Strip blocks that genuinely contain no useful KB text. Note we
  // do NOT strip <header>, <footer>, <aside> here — Next.js + many
  // modern frameworks wrap hero copy and main marketing content in
  // <header>, so removing the whole element nukes the page.
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, " ");
  s = s.replace(/<form[\s\S]*?<\/form>/gi, " ");
  s = s.replace(/<svg[\s\S]*?<\/svg>/gi, " ");
  // Convert block-level closers to newlines so paragraphs survive.
  s = s.replace(
    /<\/(p|div|li|h\d|tr|br|section|article|header|footer|aside)\s*>/gi,
    "\n",
  );
  s = s.replace(/<br\s*\/?\s*>/gi, "\n");
  // Drop everything else.
  s = s.replace(/<[^>]+>/g, " ");
  s = decodeEntities(s);
  // Collapse whitespace, keep paragraph breaks.
  s = s.replace(/[ \t\r\f\v]+/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");
  return s.trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}


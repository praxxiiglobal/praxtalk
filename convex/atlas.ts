import { v } from "convex/values";
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
    return {
      _id: config._id,
      enabled: config.enabled,
      provider: config.provider,
      hasApiKey: Boolean(config.apiKey),
      model: config.model,
      systemPrompt: config.systemPrompt,
      knowledgeBase: config.knowledgeBase,
      autoReplyThreshold: config.autoReplyThreshold,
      maxTokens: config.maxTokens,
      updatedAt: config.updatedAt,
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

    if (existing) {
      const patch: Record<string, unknown> = {
        enabled: args.enabled,
        updatedAt: now,
      };
      if (args.apiKey && args.apiKey.trim()) patch.apiKey = args.apiKey.trim();
      if (args.model) patch.model = args.model;
      if (args.systemPrompt !== undefined) patch.systemPrompt = args.systemPrompt;
      if (args.knowledgeBase !== undefined)
        patch.knowledgeBase = args.knowledgeBase;
      if (args.autoReplyThreshold !== undefined)
        patch.autoReplyThreshold = clampThreshold(args.autoReplyThreshold);
      if (args.maxTokens !== undefined) patch.maxTokens = args.maxTokens;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    return await ctx.db.insert("atlasConfigs", {
      workspaceId,
      enabled: args.enabled,
      provider: "anthropic",
      apiKey: args.apiKey?.trim() ?? "",
      model: args.model ?? DEFAULT_MODEL,
      systemPrompt: args.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      knowledgeBase: args.knowledgeBase,
      autoReplyThreshold: clampThreshold(
        args.autoReplyThreshold ?? DEFAULT_THRESHOLD,
      ),
      maxTokens: args.maxTokens ?? DEFAULT_MAX_TOKENS,
      createdBy: operator._id,
      createdAt: now,
      updatedAt: now,
    });
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

    const startId = await ctx.runMutation(internal.atlas.startRun, {
      workspaceId: args.workspaceId,
      conversationId: args.conversationId,
      triggerMessageId: args.triggerMessageId,
      model: config.model,
    });

    try {
      const result = await callAnthropic({
        apiKey: config.apiKey,
        model: config.model,
        maxTokens: config.maxTokens,
        systemPrompt: buildSystemPrompt(config.systemPrompt, brand, config.knowledgeBase),
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
    const brand = conversation.brandId
      ? await ctx.db.get(conversation.brandId)
      : null;
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
    brandId: v.optional(v.id("brands")),
    channel: v.union(
      v.literal("web_chat"),
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("voice"),
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
    `\n\nReturn JSON ONLY (no markdown), with the shape:\n{ "reply": string, "confidence": number between 0 and 1, "reasoning": short string }\nConfidence reflects how sure you are the reply is correct + on-policy. If confidence < ${DEFAULT_THRESHOLD}, the reply is held as a draft for a human operator to review. Be honest about uncertainty.`,
  );
  return parts.join("");
}

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
  let parsed: { reply?: unknown; confidence?: unknown; reasoning?: unknown };
  try {
    parsed = JSON.parse(clean);
  } catch {
    // Fall back to treating the entire body as the reply with mid confidence.
    return {
      reply: text.trim() || "Let me get a teammate to help you with that.",
      confidence: 0.4,
      reasoning: "Model returned non-JSON output; downgraded to draft.",
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
  return {
    reply: reply || "Let me get a teammate to help you with that.",
    confidence,
    reasoning,
    inputTokens: data.usage?.input_tokens,
    outputTokens: data.usage?.output_tokens,
  };
}

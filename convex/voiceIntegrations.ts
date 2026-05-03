import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { getDefaultBrandId } from "./brands";
import { canAccessIntegration } from "./integrationGrants";
import { generateWebhookSecret } from "./lib/auth";
import { pushActivity } from "./notifications";

const providerValidator = v.union(
  v.literal("callhippo"),
  v.literal("telecmi"),
  v.literal("twilio"),
);
type Provider = "callhippo" | "telecmi" | "twilio";

// ── Dashboard CRUD ────────────────────────────────────────────────────

export const get = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const integration = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace_operator", (q) =>
        q.eq("workspaceId", workspaceId).eq("operatorId", undefined),
      )
      .first();
    if (!integration) return null;
    return {
      _id: integration._id,
      provider: integration.provider,
      apiKey: integration.apiKey, // safe: account ID/email/SID — not a secret
      hasApiToken: Boolean(integration.apiToken),
      apiTokenPreview: integration.apiToken
        ? integration.apiToken.slice(0, 6) + "…"
        : null,
      defaultNumber: integration.defaultNumber,
      webhookSecret: integration.webhookSecret,
      enabled: integration.enabled,
      createdAt: integration.createdAt,
    };
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    provider: providerValidator,
    apiKey: v.string(),
    apiToken: v.optional(v.string()), // leave blank to keep current
    defaultNumber: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  returns: v.id("voiceIntegrations"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can configure voice.",
      );
    }
    if (!args.apiKey.trim()) {
      throw new ConvexError("API key / account ID is required.");
    }

    const existing = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace_operator", (q) =>
        q.eq("workspaceId", workspaceId).eq("operatorId", undefined),
      )
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        provider: args.provider,
        apiKey: args.apiKey.trim(),
        defaultNumber: args.defaultNumber?.trim() || undefined,
      };
      if (args.apiToken && args.apiToken.trim()) {
        patch.apiToken = args.apiToken.trim();
      }
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    if (!args.apiToken || !args.apiToken.trim()) {
      throw new ConvexError(
        "API token / secret / auth token is required to create the integration.",
      );
    }

    return await ctx.db.insert("voiceIntegrations", {
      workspaceId,
      provider: args.provider,
      apiKey: args.apiKey.trim(),
      apiToken: args.apiToken.trim(),
      defaultNumber: args.defaultNumber?.trim() || undefined,
      webhookSecret: generateWebhookSecret(),
      enabled: args.enabled ?? true,
      createdBy: operator._id,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: { sessionToken: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only admins and owners can remove the voice integration.",
      );
    }
    const existing = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace_operator", (q) =>
        q.eq("workspaceId", workspaceId).eq("operatorId", undefined),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

// ── Per-operator (personal) voice line ────────────────────────────────
// Each operator can own their own integration row alongside the
// workspace-shared one. Inbound to a personal number auto-assigns to
// the owner; outbound from that operator routes through this row.

export const getMine = query({
  args: {
    sessionToken: v.string(),
    // Admins/owners can pass another operator's id to view that
    // person's personal integration. Non-admins can also view IF the
    // owner has granted them access via integrationGrants.
    targetOperatorId: v.optional(v.id("operators")),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    let target = operator._id as Id<"operators">;
    if (args.targetOperatorId && args.targetOperatorId !== operator._id) {
      const allowed = await canAccessIntegration(
        ctx,
        operator,
        args.targetOperatorId,
        "voice",
        "read",
      );
      if (allowed) target = args.targetOperatorId;
    }
    const integration = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace_operator", (q) =>
        q.eq("workspaceId", workspaceId).eq("operatorId", target),
      )
      .first();
    if (!integration) return null;
    return {
      _id: integration._id,
      provider: integration.provider,
      apiKey: integration.apiKey,
      hasApiToken: Boolean(integration.apiToken),
      apiTokenPreview: integration.apiToken
        ? integration.apiToken.slice(0, 6) + "…"
        : null,
      defaultNumber: integration.defaultNumber,
      webhookSecret: integration.webhookSecret,
      enabled: integration.enabled,
      createdAt: integration.createdAt,
    };
  },
});

export const upsertMine = mutation({
  args: {
    sessionToken: v.string(),
    targetOperatorId: v.optional(v.id("operators")),
    provider: providerValidator,
    apiKey: v.string(),
    apiToken: v.optional(v.string()),
    defaultNumber: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  returns: v.id("voiceIntegrations"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (args.targetOperatorId && args.targetOperatorId !== operator._id) {
      const allowed = await canAccessIntegration(
        ctx,
        operator,
        args.targetOperatorId,
        "voice",
        "write",
      );
      if (!allowed) {
        throw new ConvexError(
          "You don't have write access to this operator's voice integration.",
        );
      }
    }
    const targetId = args.targetOperatorId ?? operator._id;
    if (!args.apiKey.trim()) {
      throw new ConvexError("API key / account ID is required.");
    }

    const existing = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace_operator", (q) =>
        q.eq("workspaceId", workspaceId).eq("operatorId", targetId),
      )
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        provider: args.provider,
        apiKey: args.apiKey.trim(),
        defaultNumber: args.defaultNumber?.trim() || undefined,
      };
      if (args.apiToken && args.apiToken.trim()) {
        patch.apiToken = args.apiToken.trim();
      }
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    if (!args.apiToken || !args.apiToken.trim()) {
      throw new ConvexError(
        "API token / secret / auth token is required to create the integration.",
      );
    }

    return await ctx.db.insert("voiceIntegrations", {
      workspaceId,
      operatorId: targetId,
      provider: args.provider,
      apiKey: args.apiKey.trim(),
      apiToken: args.apiToken.trim(),
      defaultNumber: args.defaultNumber?.trim() || undefined,
      webhookSecret: generateWebhookSecret(),
      enabled: args.enabled ?? true,
      createdBy: operator._id,
      createdAt: Date.now(),
    });
  },
});

export const removeMine = mutation({
  args: {
    sessionToken: v.string(),
    targetOperatorId: v.optional(v.id("operators")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (args.targetOperatorId && args.targetOperatorId !== operator._id) {
      const allowed = await canAccessIntegration(
        ctx,
        operator,
        args.targetOperatorId,
        "voice",
        "write",
      );
      if (!allowed) {
        throw new ConvexError(
          "You don't have write access to this operator's voice integration.",
        );
      }
    }
    const targetId = args.targetOperatorId ?? operator._id;
    const existing = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace_operator", (q) =>
        q.eq("workspaceId", workspaceId).eq("operatorId", targetId),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/**
 * Admins/owners can see who else on the team has a personal voice
 * line configured. Returns just operator name + display number for
 * display in the team's integrations page.
 */
export const listTeamPersonalLines = query({
  args: { sessionToken: v.string() },
  returns: v.array(
    v.object({
      operatorName: v.string(),
      operatorEmail: v.string(),
      provider: providerValidator,
      defaultNumber: v.union(v.string(), v.null()),
      enabled: v.boolean(),
    }),
  ),
  handler: async (ctx, { sessionToken }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);
    if (operator.role === "agent") return [];
    const all = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    const personal = all.filter((i) => i.operatorId);
    return await Promise.all(
      personal.map(async (i) => {
        const own = await ctx.db.get(i.operatorId!);
        return {
          operatorName: own?.name ?? "Unknown",
          operatorEmail: own?.email ?? "",
          provider: i.provider,
          defaultNumber: i.defaultNumber ?? null,
          enabled: i.enabled,
        };
      }),
    );
  },
});

// ── Inbound (provider webhook) ────────────────────────────────────────
// The webhook URL is the same for every provider; we route by the
// `?secret=` query param. Once we find the integration, the webhook
// handler in http.ts dispatches the parser based on `provider`.

export const findByWebhookSecret = internalQuery({
  args: { webhookSecret: v.string() },
  handler: async (ctx, { webhookSecret }) => {
    const integration = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_webhook_secret", (q) =>
        q.eq("webhookSecret", webhookSecret),
      )
      .first();
    if (!integration || !integration.enabled) return null;
    return {
      _id: integration._id,
      workspaceId: integration.workspaceId,
      operatorId: integration.operatorId ?? null,
      provider: integration.provider,
    };
  },
});

/**
 * Persist a completed call (any provider) as a voice-channel
 * conversation + system message. The webhook handler normalises the
 * provider-specific payload before calling this.
 */
export const recordInboundCall = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    // When the matching integration is owned by an operator, the
    // conversation auto-assigns to them so it shows up in their
    // personal queue (and not in everyone else's).
    assignToOperatorId: v.optional(v.id("operators")),
    fromPhone: v.string(), // E.164
    fromName: v.optional(v.string()),
    durationSec: v.optional(v.number()),
    recordingUrl: v.optional(v.string()),
    transcript: v.optional(v.string()),
    callType: v.union(
      v.literal("inbound"),
      v.literal("outbound"),
      v.literal("missed"),
      v.literal("voicemail"),
    ),
    externalCallId: v.optional(v.string()),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
    messageId: v.id("messages"),
  }),
  handler: async (ctx, args) => {
    const fromPhone = args.fromPhone.startsWith("+")
      ? args.fromPhone
      : `+${args.fromPhone}`;
    const defaultBrandId = await getDefaultBrandId(ctx, args.workspaceId);

    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (v) => v.workspaceId === args.workspaceId && v.phone === fromPhone,
    );
    const now = Date.now();
    if (!visitor) {
      const visitorKey = `voice_${fromPhone}`;
      const id = await ctx.db.insert("visitors", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorKey,
        name: args.fromName,
        phone: fromPhone,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, { lastSeenAt: now });
    }

    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_visitor", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("visitorId", visitor._id),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();

    let conversationId;
    let brandId;
    if (existing && existing.channel === "voice") {
      conversationId = existing._id;
      brandId = existing.brandId;
      await ctx.db.patch(conversationId, { lastMessageAt: now });
    } else {
      const cid = await ctx.db.insert("conversations", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorId: visitor._id,
        channel: "voice",
        status: "open",
        assignedOperatorId: args.assignToOperatorId,
        lastMessageAt: now,
        createdAt: now,
      });
      conversationId = cid;
      brandId = defaultBrandId;
    }

    const dur = args.durationSec ?? 0;
    const minutes = Math.floor(dur / 60);
    const seconds = dur % 60;
    const durStr =
      dur > 0 ? `${minutes}m ${seconds.toString().padStart(2, "0")}s` : "—";
    const verb = {
      inbound: "Inbound call",
      outbound: "Outbound call",
      missed: "Missed call",
      voicemail: "Voicemail",
    }[args.callType];

    const lines = [`${verb} from ${fromPhone} · ${durStr}`];
    if (args.recordingUrl) lines.push(`Recording: ${args.recordingUrl}`);
    if (args.transcript) lines.push(`\nTranscript:\n${args.transcript}`);
    const body = lines.join("\n");

    const messageId = await ctx.db.insert("messages", {
      conversationId,
      workspaceId: args.workspaceId,
      brandId,
      channel: "voice",
      role: "system",
      body,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.webhooks.enqueue, {
      workspaceId: args.workspaceId,
      eventType: "message.created",
      payload: JSON.stringify({
        type: "message.created",
        workspaceId: args.workspaceId,
        occurredAt: new Date(now).toISOString(),
        data: {
          messageId,
          conversationId,
          channel: "voice",
          role: "system",
          fromPhone,
          callType: args.callType,
          durationSec: args.durationSec,
          recordingUrl: args.recordingUrl,
          externalCallId: args.externalCallId,
        },
      }),
    });

    return { conversationId, visitorId: visitor._id, messageId };
  },
});

export const recordCallFailure = internalMutation({
  args: { workspaceId: v.id("workspaces"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pushActivity(ctx, {
      workspaceId: args.workspaceId,
      kind: "system",
      severity: "error",
      title: "Voice call failed",
      body: args.error,
      link: "/app/integrations",
    });
    return null;
  },
});

// ── Outbound: operator click-to-call (provider-dispatched) ────────────

export const originateCall = action({
  args: {
    sessionToken: v.string(),
    toPhone: v.string(),
    name: v.optional(v.string()), // optional display name for new visitor
  },
  returns: v.object({
    ok: v.boolean(),
    error: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    error?: string;
    conversationId?: Id<"conversations">;
  }> => {
    const data = await ctx.runQuery(
      internal.voiceIntegrations.loadOriginateContext,
      { sessionToken: args.sessionToken },
    );
    if (!data) {
      return { ok: false, error: "Voice integration not configured." };
    }
    const { integration } = data;
    if (!integration.defaultNumber) {
      return {
        ok: false,
        error: "No default outbound number set on the integration.",
      };
    }

    try {
      const provider = integration.provider as Provider;
      let externalCallId: string | undefined;
      if (provider === "callhippo") {
        externalCallId = await originateViaCallHippo({
          apiKey: integration.apiKey,
          apiToken: integration.apiToken,
          from: integration.defaultNumber,
          to: args.toPhone,
        });
      } else if (provider === "telecmi") {
        externalCallId = await originateViaTeleCMI({
          appId: integration.apiKey,
          secret: integration.apiToken,
          from: integration.defaultNumber,
          to: args.toPhone,
        });
      } else if (provider === "twilio") {
        externalCallId = await originateViaTwilio({
          accountSid: integration.apiKey,
          authToken: integration.apiToken,
          from: integration.defaultNumber,
          to: args.toPhone,
        });
      }
      // Log the outbound call: creates visitor + conversation if this
      // is a fresh number, or appends to the existing one. Provider's
      // post-call webhook (recordInboundCall) will later append the
      // recording / transcript / duration once the call ends.
      const out: {
        conversationId: Id<"conversations">;
        visitorId: Id<"visitors">;
      } = await ctx.runMutation(
        internal.voiceIntegrations.recordOutboundCallInitiated,
        {
          workspaceId: integration.workspaceId,
          toPhone: args.toPhone,
          name: args.name,
        },
      );
      // Stamp an activeCalls row so the live UI overlay can show
      // hangup + status. externalCallId lets hangupCall target the
      // right provider-side leg.
      if (externalCallId) {
        await ctx.runMutation(internal.voiceIntegrations._registerActiveCall, {
          workspaceId: integration.workspaceId,
          operatorId: data.callerOperatorId,
          conversationId: out.conversationId,
          visitorId: out.visitorId,
          fromPhone: integration.defaultNumber,
          toPhone: args.toPhone,
          provider,
          externalCallId,
        });
      }
      return { ok: true, conversationId: out.conversationId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Originate failed",
      };
    }
  },
});

/**
 * Stamps an "Outbound call to <number>" system message into the
 * conversation timeline, creating visitor + conversation if needed.
 * Called from `originateCall` after the provider accepts the dial.
 */
export const recordOutboundCallInitiated = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    toPhone: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
  }),
  handler: async (ctx, args) => {
    const toPhone = args.toPhone.startsWith("+")
      ? args.toPhone
      : `+${args.toPhone}`;
    const defaultBrandId = await getDefaultBrandId(ctx, args.workspaceId);
    const now = Date.now();

    // Find or create visitor by phone number scoped to this workspace.
    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (vis) => vis.workspaceId === args.workspaceId && vis.phone === toPhone,
    );
    if (!visitor) {
      const visitorKey = `voice_${toPhone}`;
      const id = await ctx.db.insert("visitors", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorKey,
        name: args.name,
        phone: toPhone,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, { lastSeenAt: now });
    }

    // Re-use the existing open voice conversation if one exists, else
    // open a new one.
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_visitor", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("visitorId", visitor._id),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();

    let conversationId: Id<"conversations">;
    let brandId: Id<"brands">;
    if (existing && existing.channel === "voice") {
      conversationId = existing._id;
      brandId = existing.brandId;
      await ctx.db.patch(conversationId, { lastMessageAt: now });
    } else {
      conversationId = await ctx.db.insert("conversations", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorId: visitor._id,
        channel: "voice",
        status: "open",
        lastMessageAt: now,
        createdAt: now,
      });
      brandId = defaultBrandId;
    }

    await ctx.db.insert("messages", {
      conversationId,
      workspaceId: args.workspaceId,
      brandId,
      channel: "voice",
      role: "system",
      body: `Outbound call to ${toPhone} initiated. Provider will post the recording once the call ends.`,
      createdAt: now,
    });

    return { conversationId, visitorId: visitor._id };
  },
});

/**
 * Call history — every conversation on the voice channel, newest
 * first. Joined with the latest message for at-a-glance context
 * (recording URL, duration, etc, all live in the system message body).
 */
export const listCallHistory = query({
  args: {
    sessionToken: v.string(),
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      lastMessageAt: v.number(),
      status: v.union(
        v.literal("open"),
        v.literal("snoozed"),
        v.literal("resolved"),
        v.literal("closed"),
      ),
      visitor: v.union(
        v.null(),
        v.object({
          name: v.optional(v.string()),
          phone: v.optional(v.string()),
        }),
      ),
      lastMessage: v.union(
        v.null(),
        v.object({
          body: v.string(),
          role: v.union(
            v.literal("visitor"),
            v.literal("operator"),
            v.literal("atlas"),
            v.literal("system"),
            v.literal("internal_note"),
          ),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const limit = Math.min(Math.max(1, args.limit ?? 100), 200);
    // Fetch all conversations for the workspace then filter to voice —
    // voice tends to be a small fraction so this is fine at the
    // open-beta scale. Switch to a dedicated channel index when the
    // table grows past ~50k rows.
    const all = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_status_lastmsg", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .order("desc")
      .take(limit * 4);
    const voice = all.filter((c) => c.channel === "voice").slice(0, limit);
    const out = await Promise.all(
      voice.map(async (c) => {
        const visitor = await ctx.db.get(c.visitorId);
        const lastMessage = await ctx.db
          .query("messages")
          .withIndex("by_conversation_created", (q) =>
            q.eq("conversationId", c._id),
          )
          .order("desc")
          .first();
        return {
          _id: c._id,
          lastMessageAt: c.lastMessageAt,
          status: c.status,
          visitor: visitor
            ? { name: visitor.name, phone: visitor.phone }
            : null,
          lastMessage: lastMessage
            ? { body: lastMessage.body, role: lastMessage.role }
            : null,
        };
      }),
    );
    return out;
  },
});

export const loadOriginateContext = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { operator, workspaceId } = await requireOperator(ctx, sessionToken);
    // Personal integration for this operator wins over workspace shared.
    // Lets each team member dial out from their own number when they
    // have one, falling back to the team line otherwise.
    const personal = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace_operator", (q) =>
        q.eq("workspaceId", workspaceId).eq("operatorId", operator._id),
      )
      .first();
    let integration = personal;
    if (!integration) {
      const shared = await ctx.db
        .query("voiceIntegrations")
        .withIndex("by_workspace_operator", (q) =>
          q.eq("workspaceId", workspaceId).eq("operatorId", undefined),
        )
        .first();
      integration = shared;
    }
    if (!integration || !integration.enabled) return null;
    return { integration, callerOperatorId: operator._id };
  },
});

// ── Provider adapters ─────────────────────────────────────────────────

async function originateViaCallHippo(args: {
  apiKey: string; // account email
  apiToken: string;
  from: string;
  to: string;
}): Promise<string | undefined> {
  const auth = btoa(`${args.apiKey}:${args.apiToken}`);
  const res = await fetch("https://api.callhippo.com/v1/originate", {
    method: "POST",
    headers: {
      authorization: `Basic ${auth}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ from: args.from, to: args.to }),
  });
  if (!res.ok) {
    throw new Error(`CallHippo ${res.status}: ${await res.text()}`);
  }
  try {
    const json = (await res.json()) as { callId?: string; data?: { callId?: string } };
    return json.callId ?? json.data?.callId;
  } catch {
    return undefined;
  }
}

async function originateViaTeleCMI(args: {
  appId: string;
  secret: string;
  from: string;
  to: string;
}): Promise<string | undefined> {
  const res = await fetch("https://rest.telecmi.com/v2/ind_dial_call", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appid: args.appId,
      secret: args.secret,
      from: args.from,
      to: args.to,
    }),
  });
  if (!res.ok) {
    throw new Error(`TeleCMI ${res.status}: ${await res.text()}`);
  }
  try {
    const json = (await res.json()) as { call_id?: string; sid?: string };
    return json.call_id ?? json.sid;
  } catch {
    return undefined;
  }
}

async function originateViaTwilio(args: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
}): Promise<string | undefined> {
  const auth = btoa(`${args.accountSid}:${args.authToken}`);
  // Status callback drives the live overlay's status badge —
  // initiating → ringing → in-progress → completed in real time.
  const statusCallback =
    process.env.PRAXTALK_TWILIO_STATUS_CALLBACK_BASE ??
    "https://industrious-moose-892.convex.site";
  const body = new URLSearchParams({
    To: args.to,
    From: args.from,
    Url: "http://demo.twilio.com/docs/voice.xml",
    StatusCallback: `${statusCallback}/api/inbound/voice-status`,
    StatusCallbackEvent: "initiated ringing answered completed",
    StatusCallbackMethod: "POST",
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  }
  try {
    const json = (await res.json()) as { sid?: string };
    return json.sid;
  } catch {
    return undefined;
  }
}

/**
 * Internal-only TTS reminder call. Today: Twilio only — they accept
 * inline TwiML in the POST body via the `Twiml` parameter, so we can
 * trigger a reminder call without standing up a TwiML-serving URL.
 *
 * CallHippo + TeleCMI need adapter work — neither exposes a clean
 * "make a call that says X" endpoint without a hosted IVR flow. Their
 * branches return failure with a clear error so the reminders
 * dashboard shows what's missing.
 */
export const _sendReminderVoice = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    body: v.string(),
  },
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; error?: string }> => {
    const ctxData: {
      provider: Provider;
      apiKey: string;
      apiToken: string;
      defaultNumber: string;
      visitorPhone: string;
    } | null = await ctx.runQuery(
      internal.voiceIntegrations._loadReminderVoiceContext,
      {
        workspaceId: args.workspaceId,
        conversationId: args.conversationId,
      },
    );
    if (!ctxData) {
      return {
        ok: false,
        error:
          "Voice not configured, no defaultNumber set, or visitor has no phone.",
      };
    }
    const { provider, apiKey, apiToken, defaultNumber, visitorPhone } =
      ctxData;

    try {
      if (provider === "twilio") {
        await sendTtsViaTwilio({
          accountSid: apiKey,
          authToken: apiToken,
          from: defaultNumber,
          to: visitorPhone,
          body: args.body,
        });
      } else if (provider === "callhippo") {
        await sendTtsViaCallHippo({
          apiKey, // account email
          apiToken,
          from: defaultNumber,
          to: visitorPhone,
          body: args.body,
        });
      } else if (provider === "telecmi") {
        await sendTtsViaTeleCMI({
          appId: apiKey,
          secret: apiToken,
          from: defaultNumber,
          to: visitorPhone,
          body: args.body,
        });
      }
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "TTS call failed",
      };
    }
  },
});

// ── Voice TTS adapters ────────────────────────────────────────────────

async function sendTtsViaTwilio(args: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}) {
  // Twilio accepts inline TwiML via the `Twiml` form param — saves us
  // from standing up a TwiML server. <Say> is text-to-speech.
  const escaped = args.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const twiml = `<Response><Say voice="alice">${escaped}</Say></Response>`;
  const auth = btoa(`${args.accountSid}:${args.authToken}`);
  const form = new URLSearchParams({
    To: args.to,
    From: args.from,
    Twiml: twiml,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Calls.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio ${res.status}: ${await res.text()}`);
  }
}

/**
 * CallHippo Voice Broadcast — accepts text and synthesizes speech
 * server-side. Endpoint per CallHippo's outbound TTS docs; verify the
 * exact path against your account's API console before going live (it
 * has changed twice in the last year).
 */
async function sendTtsViaCallHippo(args: {
  apiKey: string;
  apiToken: string;
  from: string;
  to: string;
  body: string;
}) {
  const res = await fetch("https://api.callhippo.com/v1/voice-broadcast", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apiToken: args.apiToken,
      email: args.apiKey,
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      message: args.body,
      voice_type: "female",
    }),
  });
  if (!res.ok) {
    throw new Error(`CallHippo TTS ${res.status}: ${await res.text()}`);
  }
}

/**
 * TeleCMI text-to-speech outbound call. The `text_to_speech_call`
 * endpoint accepts the message text directly and synthesizes inline.
 */
async function sendTtsViaTeleCMI(args: {
  appId: string;
  secret: string;
  from: string;
  to: string;
  body: string;
}) {
  const res = await fetch(
    "https://rest.telecmi.com/v2/text_to_speech_call",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        appid: args.appId,
        secret: args.secret,
        from: args.from,
        to: args.to,
        text: args.body,
        lang: "en-US",
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`TeleCMI TTS ${res.status}: ${await res.text()}`);
  }
}

export const _loadReminderVoiceContext = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
  },
  handler: async (ctx, args) => {
    const integration = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", args.workspaceId),
      )
      .first();
    if (!integration || !integration.enabled || !integration.defaultNumber)
      return null;
    const convo = await ctx.db.get(args.conversationId);
    if (!convo) return null;
    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor?.phone) return null;
    return {
      provider: integration.provider,
      apiKey: integration.apiKey,
      apiToken: integration.apiToken,
      defaultNumber: integration.defaultNumber,
      visitorPhone: visitor.phone,
    };
  },
});

// ── SMS adapters (same providers, different endpoints) ────────────────

async function sendSmsViaTwilio(args: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
  body: string;
}) {
  const auth = btoa(`${args.accountSid}:${args.authToken}`);
  const form = new URLSearchParams({
    To: args.to,
    From: args.from,
    Body: args.body,
  });
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${args.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${auth}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    },
  );
  if (!res.ok) {
    throw new Error(`Twilio SMS ${res.status}: ${await res.text()}`);
  }
}

async function sendSmsViaCallHippo(args: {
  apiKey: string; // account email
  apiToken: string;
  from: string;
  to: string;
  body: string;
}) {
  const res = await fetch("https://api.callhippo.com/v1/sendsms", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      apiToken: args.apiToken,
      email: args.apiKey,
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      message: args.body,
    }),
  });
  if (!res.ok) {
    throw new Error(`CallHippo SMS ${res.status}: ${await res.text()}`);
  }
}

async function sendSmsViaTeleCMI(args: {
  appId: string;
  secret: string;
  from: string;
  to: string;
  body: string;
}) {
  const res = await fetch("https://rest.telecmi.com/v2/ind_send_sms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      appid: args.appId,
      secret: args.secret,
      from: args.from,
      to: args.to,
      msg: args.body,
    }),
  });
  if (!res.ok) {
    throw new Error(`TeleCMI SMS ${res.status}: ${await res.text()}`);
  }
}

// ── SMS public surface ────────────────────────────────────────────────

/**
 * Public action — operator sends an outbound SMS to any number. Like
 * originateCall, this creates a visitor + open conversation if the
 * target number isn't already known, then dispatches the SMS through
 * whichever provider the workspace has configured. Reuses the voice
 * integration since Twilio/CallHippo/TeleCMI bundle SMS into the same
 * account/credentials/number.
 */
export const sendSmsToNumber = action({
  args: {
    sessionToken: v.string(),
    toPhone: v.string(),
    body: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.object({
    ok: v.boolean(),
    error: v.optional(v.string()),
    conversationId: v.optional(v.id("conversations")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    ok: boolean;
    error?: string;
    conversationId?: Id<"conversations">;
  }> => {
    const trimmed = args.body.trim();
    if (!trimmed) return { ok: false, error: "Message body is empty." };

    const data = await ctx.runQuery(
      internal.voiceIntegrations.loadOriginateContext,
      { sessionToken: args.sessionToken },
    );
    if (!data) {
      return { ok: false, error: "Voice/SMS integration not configured." };
    }
    const { integration } = data;
    if (!integration.defaultNumber) {
      return {
        ok: false,
        error: "No default outbound number set on the integration.",
      };
    }

    try {
      await dispatchSms({
        provider: integration.provider as Provider,
        apiKey: integration.apiKey,
        apiToken: integration.apiToken,
        from: integration.defaultNumber,
        to: args.toPhone,
        body: trimmed,
      });
      const conversationId: Id<"conversations"> = await ctx.runMutation(
        internal.voiceIntegrations.recordOutboundSms,
        {
          workspaceId: integration.workspaceId,
          toPhone: args.toPhone,
          body: trimmed,
          name: args.name,
        },
      );
      return { ok: true, conversationId };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "SMS send failed",
      };
    }
  },
});

/**
 * Internal action invoked by messages.send when an operator replies to
 * an existing SMS conversation from the inbox.
 */
export const sendSmsForMessage = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const data = await ctx.runQuery(
      internal.voiceIntegrations.loadSmsReplyContext,
      { messageId: args.messageId },
    );
    if (!data) return null;
    const { integration, toPhone, body } = data;
    if (!integration.defaultNumber) return null;
    try {
      await dispatchSms({
        provider: integration.provider as Provider,
        apiKey: integration.apiKey,
        apiToken: integration.apiToken,
        from: integration.defaultNumber,
        to: toPhone,
        body,
      });
    } catch (err) {
      console.warn("[sms] outbound failed", err);
    }
    return null;
  },
});

async function dispatchSms(args: {
  provider: Provider;
  apiKey: string;
  apiToken: string;
  from: string;
  to: string;
  body: string;
}): Promise<void> {
  if (args.provider === "twilio") {
    await sendSmsViaTwilio({
      accountSid: args.apiKey,
      authToken: args.apiToken,
      from: args.from,
      to: args.to,
      body: args.body,
    });
  } else if (args.provider === "callhippo") {
    await sendSmsViaCallHippo({
      apiKey: args.apiKey,
      apiToken: args.apiToken,
      from: args.from,
      to: args.to,
      body: args.body,
    });
  } else if (args.provider === "telecmi") {
    await sendSmsViaTeleCMI({
      appId: args.apiKey,
      secret: args.apiToken,
      from: args.from,
      to: args.to,
      body: args.body,
    });
  }
}

export const loadSmsReplyContext = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return null;
    const convo = await ctx.db.get(msg.conversationId);
    if (!convo) return null;
    const visitor = await ctx.db.get(convo.visitorId);
    if (!visitor?.phone) return null;
    // Prefer the operator who authored the reply's personal integration,
    // falling back to the conversation owner's, then the workspace-shared
    // line — same priority as outbound dial pad.
    const senderId = msg.senderOperatorId ?? convo.assignedOperatorId ?? null;
    let integration = null;
    if (senderId) {
      integration = await ctx.db
        .query("voiceIntegrations")
        .withIndex("by_workspace_operator", (q) =>
          q.eq("workspaceId", msg.workspaceId).eq("operatorId", senderId),
        )
        .first();
    }
    if (!integration) {
      integration = await ctx.db
        .query("voiceIntegrations")
        .withIndex("by_workspace_operator", (q) =>
          q
            .eq("workspaceId", msg.workspaceId)
            .eq("operatorId", undefined),
        )
        .first();
    }
    if (!integration || !integration.enabled) return null;
    return { integration, toPhone: visitor.phone, body: msg.body };
  },
});

export const recordOutboundSms = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    toPhone: v.string(),
    body: v.string(),
    name: v.optional(v.string()),
  },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    const toPhone = args.toPhone.startsWith("+")
      ? args.toPhone
      : `+${args.toPhone}`;
    const defaultBrandId = await getDefaultBrandId(ctx, args.workspaceId);
    const now = Date.now();

    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (vis) => vis.workspaceId === args.workspaceId && vis.phone === toPhone,
    );
    if (!visitor) {
      const id = await ctx.db.insert("visitors", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorKey: `sms_${toPhone}`,
        name: args.name,
        phone: toPhone,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, { lastSeenAt: now });
    }

    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_visitor", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("visitorId", visitor._id),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();

    let conversationId: Id<"conversations">;
    let brandId: Id<"brands">;
    if (existing && existing.channel === "sms") {
      conversationId = existing._id;
      brandId = existing.brandId;
      await ctx.db.patch(conversationId, { lastMessageAt: now });
    } else {
      conversationId = await ctx.db.insert("conversations", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorId: visitor._id,
        channel: "sms",
        status: "open",
        lastMessageAt: now,
        createdAt: now,
      });
      brandId = defaultBrandId;
    }

    await ctx.db.insert("messages", {
      conversationId,
      workspaceId: args.workspaceId,
      brandId,
      channel: "sms",
      role: "operator",
      body: args.body,
      createdAt: now,
    });
    return conversationId;
  },
});

/**
 * Inbound SMS — provider posts to /api/inbound/sms?secret=… with
 * provider-specific shapes. Each parser normalises to NormalisedSms.
 */
export type NormalisedSms = {
  fromPhone: string;
  body: string;
};

export const recordInboundSms = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    assignToOperatorId: v.optional(v.id("operators")),
    fromPhone: v.string(),
    body: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const fromPhone = args.fromPhone.startsWith("+")
      ? args.fromPhone
      : `+${args.fromPhone}`;
    const defaultBrandId = await getDefaultBrandId(ctx, args.workspaceId);
    const now = Date.now();

    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (vis) => vis.workspaceId === args.workspaceId && vis.phone === fromPhone,
    );
    if (!visitor) {
      const id = await ctx.db.insert("visitors", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorKey: `sms_${fromPhone}`,
        phone: fromPhone,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, { lastSeenAt: now });
    }

    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_workspace_visitor", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("visitorId", visitor._id),
      )
      .filter((q) => q.eq(q.field("status"), "open"))
      .first();

    let conversationId: Id<"conversations">;
    let brandId: Id<"brands">;
    if (existing && existing.channel === "sms") {
      conversationId = existing._id;
      brandId = existing.brandId;
      await ctx.db.patch(conversationId, { lastMessageAt: now });
    } else {
      conversationId = await ctx.db.insert("conversations", {
        workspaceId: args.workspaceId,
        brandId: defaultBrandId,
        visitorId: visitor._id,
        channel: "sms",
        status: "open",
        assignedOperatorId: args.assignToOperatorId,
        lastMessageAt: now,
        createdAt: now,
      });
      brandId = defaultBrandId;
    }

    await ctx.db.insert("messages", {
      conversationId,
      workspaceId: args.workspaceId,
      brandId,
      channel: "sms",
      role: "visitor",
      body: args.body,
      createdAt: now,
    });
    return null;
  },
});

// ── Active call registry + hangup ─────────────────────────────────────

export const _registerActiveCall = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
    fromPhone: v.string(),
    toPhone: v.string(),
    provider: providerValidator,
    externalCallId: v.string(),
  },
  returns: v.id("activeCalls"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("activeCalls", {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      conversationId: args.conversationId,
      visitorId: args.visitorId,
      fromPhone: args.fromPhone,
      toPhone: args.toPhone,
      provider: args.provider,
      externalCallId: args.externalCallId,
      status: "initiating",
      startedAt: Date.now(),
    });
  },
});

/**
 * Live calls for the calling operator. Drives the floating "Call in
 * progress" overlay. Returns ringing + in_progress + initiating; hides
 * completed/failed (those land in the call history page).
 */
export const listActive = query({
  args: { sessionToken: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("activeCalls"),
      conversationId: v.id("conversations"),
      visitorName: v.union(v.string(), v.null()),
      toPhone: v.string(),
      provider: providerValidator,
      status: v.union(
        v.literal("initiating"),
        v.literal("ringing"),
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("failed"),
      ),
      startedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const liveStatuses = ["initiating", "ringing", "in_progress"];
    // by_operator_status would need a compound where IN; collect-and-filter
    // is fine at the open-beta scale (one operator rarely has > 3 active calls).
    const all = await ctx.db
      .query("activeCalls")
      .withIndex("by_operator_status", (q) =>
        q.eq("operatorId", operator._id),
      )
      .collect();
    const live = all.filter((c) => liveStatuses.includes(c.status));
    return await Promise.all(
      live.map(async (c) => {
        const visitor = await ctx.db.get(c.visitorId);
        return {
          _id: c._id,
          conversationId: c.conversationId,
          visitorName: visitor?.name ?? null,
          toPhone: c.toPhone,
          provider: c.provider,
          status: c.status,
          startedAt: c.startedAt,
        };
      }),
    );
  },
});

/**
 * Hang up a live call. Calls the provider's hangup endpoint, then
 * marks the activeCalls row completed. Twilio is fully wired;
 * CallHippo / TeleCMI use best-effort endpoints documented for their
 * outbound APIs.
 */
export const hangupCall = action({
  args: { sessionToken: v.string(), activeCallId: v.id("activeCalls") },
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; error?: string }> => {
    const ctxData: {
      ownerOperatorId: Id<"operators">;
      provider: Provider;
      apiKey: string;
      apiToken: string;
      externalCallId: string;
    } | null = await ctx.runQuery(
      internal.voiceIntegrations._loadHangupContext,
      { sessionToken: args.sessionToken, activeCallId: args.activeCallId },
    );
    if (!ctxData) return { ok: false, error: "Call not found or not yours." };

    try {
      if (ctxData.provider === "twilio") {
        const auth = btoa(`${ctxData.apiKey}:${ctxData.apiToken}`);
        const res = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${ctxData.apiKey}/Calls/${ctxData.externalCallId}.json`,
          {
            method: "POST",
            headers: {
              authorization: `Basic ${auth}`,
              "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ Status: "completed" }).toString(),
          },
        );
        if (!res.ok) {
          return { ok: false, error: `Twilio hangup ${res.status}: ${await res.text()}` };
        }
      } else if (ctxData.provider === "callhippo") {
        const auth = btoa(`${ctxData.apiKey}:${ctxData.apiToken}`);
        const res = await fetch(
          `https://api.callhippo.com/v1/call/${ctxData.externalCallId}/hangup`,
          {
            method: "POST",
            headers: { authorization: `Basic ${auth}` },
          },
        );
        if (!res.ok) {
          return { ok: false, error: `CallHippo hangup ${res.status}: ${await res.text()}` };
        }
      } else if (ctxData.provider === "telecmi") {
        const res = await fetch("https://rest.telecmi.com/v2/ind_hangup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            appid: ctxData.apiKey,
            secret: ctxData.apiToken,
            call_id: ctxData.externalCallId,
          }),
        });
        if (!res.ok) {
          return { ok: false, error: `TeleCMI hangup ${res.status}: ${await res.text()}` };
        }
      }

      await ctx.runMutation(internal.voiceIntegrations._markCallEnded, {
        activeCallId: args.activeCallId,
        status: "completed",
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Hangup failed",
      };
    }
  },
});

export const _loadHangupContext = internalQuery({
  args: {
    sessionToken: v.string(),
    activeCallId: v.id("activeCalls"),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    const c = await ctx.db.get(args.activeCallId);
    if (!c) return null;
    if (c.workspaceId !== workspaceId) return null;
    // Owner of the call OR admin/owner can hang it up.
    const isAdmin = operator.role === "owner" || operator.role === "admin";
    if (c.operatorId !== operator._id && !isAdmin) return null;
    // Find the integration that originated this call (matches provider).
    const integration = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .filter((q) => q.eq(q.field("provider"), c.provider))
      .first();
    if (!integration) return null;
    return {
      ownerOperatorId: c.operatorId,
      provider: c.provider,
      apiKey: integration.apiKey,
      apiToken: integration.apiToken,
      externalCallId: c.externalCallId,
    };
  },
});

export const _markCallEnded = internalMutation({
  args: {
    activeCallId: v.id("activeCalls"),
    status: v.union(v.literal("completed"), v.literal("failed")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.activeCallId, {
      status: args.status,
      endedAt: Date.now(),
    });
    return null;
  },
});

/**
 * Twilio status callback — POSTed for each lifecycle transition
 * (initiated / ringing / answered / completed). Maps the provider's
 * status to ours and patches the activeCalls row by externalCallId.
 *
 * No auth check needed: Twilio signs requests with X-Twilio-Signature
 * but verifying that requires the auth token, which means looking up
 * the integration by AccountSid first. For now we trust the signature
 * gateway-side and just check the externalCallId belongs to a real
 * row (silently drop if not).
 */
export const _applyTwilioStatus = internalMutation({
  args: {
    externalCallId: v.string(),
    twilioStatus: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("activeCalls")
      .withIndex("by_external_id", (q) =>
        q.eq("externalCallId", args.externalCallId),
      )
      .first();
    if (!row) return null;

    // Twilio CallStatus values: queued / initiated / ringing /
    // in-progress / completed / busy / failed / no-answer / canceled.
    let next:
      | "initiating"
      | "ringing"
      | "in_progress"
      | "completed"
      | "failed"
      | undefined;
    switch (args.twilioStatus) {
      case "queued":
      case "initiated":
        next = "initiating";
        break;
      case "ringing":
        next = "ringing";
        break;
      case "in-progress":
      case "answered":
        next = "in_progress";
        break;
      case "completed":
        next = "completed";
        break;
      case "busy":
      case "failed":
      case "no-answer":
      case "canceled":
        next = "failed";
        break;
    }
    if (!next) return null;
    if (next === row.status) return null; // idempotent

    const patch: Record<string, unknown> = { status: next };
    if (next === "completed" || next === "failed") {
      patch.endedAt = Date.now();
    }
    await ctx.db.patch(row._id, patch);
    return null;
  },
});

import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import { getDefaultBrandId } from "./brands";
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
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
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
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
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
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
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
      if (provider === "callhippo") {
        await originateViaCallHippo({
          apiKey: integration.apiKey,
          apiToken: integration.apiToken,
          from: integration.defaultNumber,
          to: args.toPhone,
        });
      } else if (provider === "telecmi") {
        await originateViaTeleCMI({
          appId: integration.apiKey,
          secret: integration.apiToken,
          from: integration.defaultNumber,
          to: args.toPhone,
        });
      } else if (provider === "twilio") {
        await originateViaTwilio({
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
      const conversationId: Id<"conversations"> = await ctx.runMutation(
        internal.voiceIntegrations.recordOutboundCallInitiated,
        {
          workspaceId: integration.workspaceId,
          toPhone: args.toPhone,
          name: args.name,
        },
      );
      return { ok: true, conversationId };
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
  returns: v.id("conversations"),
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

    return conversationId;
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
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const integration = await ctx.db
      .query("voiceIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (!integration || !integration.enabled) return null;
    return { integration };
  },
});

// ── Provider adapters ─────────────────────────────────────────────────

async function originateViaCallHippo(args: {
  apiKey: string; // account email
  apiToken: string;
  from: string;
  to: string;
}) {
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
}

async function originateViaTeleCMI(args: {
  appId: string;
  secret: string;
  from: string;
  to: string;
}) {
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
}

async function originateViaTwilio(args: {
  accountSid: string;
  authToken: string;
  from: string;
  to: string;
}) {
  const auth = btoa(`${args.accountSid}:${args.authToken}`);
  // Twilio's REST API takes form-encoded bodies, not JSON.
  const body = new URLSearchParams({
    To: args.to,
    From: args.from,
    // Url is required for Twilio — it's the TwiML that runs when the
    // call connects. We point at a stock <Say>/<Pause> bin so the call
    // bridges without TTS surprises. Customers wanting custom IVR can
    // override per-number in the Twilio console.
    Url: "http://demo.twilio.com/docs/voice.xml",
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
}

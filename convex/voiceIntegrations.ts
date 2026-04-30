import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
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

    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (v) => v.workspaceId === args.workspaceId && v.phone === fromPhone,
    );
    const now = Date.now();
    if (!visitor) {
      const visitorKey = `voice_${fromPhone}`;
      const id = await ctx.db.insert("visitors", {
        workspaceId: args.workspaceId,
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
        visitorId: visitor._id,
        channel: "voice",
        status: "open",
        lastMessageAt: now,
        createdAt: now,
      });
      conversationId = cid;
      brandId = undefined;
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
  },
  returns: v.object({ ok: v.boolean(), error: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<{ ok: boolean; error?: string }> => {
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
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Originate failed",
      };
    }
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

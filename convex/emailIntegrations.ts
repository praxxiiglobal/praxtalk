import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import { slugify } from "./lib/auth";

const providerValidator = v.union(
  v.literal("postmark"),
  v.literal("sendgrid"),
  v.literal("resend"),
);

// ── Dashboard CRUD ────────────────────────────────────────────────────

export const get = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const integration = await ctx.db
      .query("emailIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (!integration) return null;
    return {
      _id: integration._id,
      provider: integration.provider,
      // Don't round-trip the API key.
      hasApiKey: Boolean(integration.apiKey),
      apiKeyPreview: integration.apiKey
        ? integration.apiKey.slice(0, 6) + "…"
        : null,
      fromAddress: integration.fromAddress,
      fromName: integration.fromName,
      inboundAlias: integration.inboundAlias,
      enabled: integration.enabled,
      createdAt: integration.createdAt,
    };
  },
});

export const upsert = mutation({
  args: {
    sessionToken: v.string(),
    provider: providerValidator,
    apiKey: v.optional(v.string()),
    fromAddress: v.string(),
    fromName: v.optional(v.string()),
    inboundAlias: v.optional(v.string()),
    enabled: v.optional(v.boolean()),
  },
  returns: v.id("emailIntegrations"),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can configure email.");
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(args.fromAddress)) {
      throw new Error("From address must be a valid email.");
    }

    const existing = await ctx.db
      .query("emailIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();

    if (existing) {
      const patch: Record<string, unknown> = {
        provider: args.provider,
        fromAddress: args.fromAddress,
        fromName: args.fromName,
      };
      // Only overwrite the API key if a new one was supplied — empty
      // string means "leave it alone".
      if (args.apiKey && args.apiKey.trim()) {
        patch.apiKey = args.apiKey.trim();
      }
      if (args.inboundAlias !== undefined) {
        const alias = slugify(args.inboundAlias);
        if (!alias) throw new Error("Inbound alias must be alphanumeric.");
        patch.inboundAlias = alias;
      }
      if (args.enabled !== undefined) patch.enabled = args.enabled;
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }

    if (!args.apiKey || !args.apiKey.trim()) {
      throw new Error("API key is required to create the integration.");
    }
    const alias = slugify(args.inboundAlias ?? "support");
    if (!alias) throw new Error("Inbound alias must be alphanumeric.");

    return await ctx.db.insert("emailIntegrations", {
      workspaceId,
      provider: args.provider,
      apiKey: args.apiKey.trim(),
      fromAddress: args.fromAddress,
      fromName: args.fromName,
      inboundAlias: alias,
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
      throw new Error("Only admins and owners can remove the email integration.");
    }
    const existing = await ctx.db
      .query("emailIntegrations")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .first();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

// ── Inbound parsing helpers (used by httpAction in convex/http.ts) ────

/**
 * Look up the workspace + integration that owns a given recipient address.
 * Local part is matched against `inboundAlias`; the domain is hard-coded
 * to `inbound.praxtalk.com` for now.
 */
export const findByRecipient = internalQuery({
  args: { recipient: v.string() },
  handler: async (ctx, { recipient }) => {
    const local = recipient.split("@")[0]?.toLowerCase() ?? "";
    if (!local) return null;
    const integration = await ctx.db
      .query("emailIntegrations")
      .withIndex("by_inbound_alias", (q) => q.eq("inboundAlias", local))
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
 * Resolve an existing email-channel conversation by RFC Message-ID
 * threading, or by a reply chain anchored on `inReplyTo`.
 */
export const findThreadedConversation = internalQuery({
  args: {
    workspaceId: v.id("workspaces"),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const candidates = [args.inReplyTo, ...(args.references ?? [])].filter(
      (x): x is string => Boolean(x),
    );
    for (const refId of candidates) {
      // Look first by direct emailThreadId match on conversation,
      // then by message.emailMessageId.
      const conv = await ctx.db
        .query("conversations")
        .withIndex("by_email_thread", (q) => q.eq("emailThreadId", refId))
        .first();
      if (conv && conv.workspaceId === args.workspaceId) return conv;
      // Fall back: a message with this Message-ID
      const messages = await ctx.db.query("messages").collect();
      const m = messages.find(
        (msg) =>
          msg.workspaceId === args.workspaceId && msg.emailMessageId === refId,
      );
      if (m) {
        const c = await ctx.db.get(m.conversationId);
        if (c) return c;
      }
    }
    return null;
  },
});

/**
 * Persist an inbound email: find or create a visitor by the sender's
 * email, find or create the threaded conversation, and insert the
 * message row. Returns the IDs so the http handler can fire webhooks.
 */
export const recordInboundEmail = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    fromEmail: v.string(),
    fromName: v.optional(v.string()),
    subject: v.optional(v.string()),
    body: v.string(),
    messageId: v.optional(v.string()),
    inReplyTo: v.optional(v.string()),
    references: v.optional(v.array(v.string())),
  },
  returns: v.object({
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
    messageId: v.id("messages"),
  }),
  handler: async (ctx, args) => {
    const fromEmail = args.fromEmail.trim().toLowerCase();

    // Find or create visitor by email scoped to this workspace.
    const allVisitors = await ctx.db.query("visitors").collect();
    let visitor = allVisitors.find(
      (vis) => vis.workspaceId === args.workspaceId && vis.email === fromEmail,
    );
    const now = Date.now();
    if (!visitor) {
      const visitorKey = `email_${fromEmail}`;
      const id = await ctx.db.insert("visitors", {
        workspaceId: args.workspaceId,
        visitorKey,
        name: args.fromName,
        email: fromEmail,
        firstSeenAt: now,
        lastSeenAt: now,
      });
      visitor = (await ctx.db.get(id))!;
    } else {
      await ctx.db.patch(visitor._id, { lastSeenAt: now });
    }

    // Try to thread to an existing conversation.
    let conversation: Doc<"conversations"> | null = null;
    const threadCandidates = [args.inReplyTo, ...(args.references ?? [])]
      .filter((x): x is string => Boolean(x));
    for (const ref of threadCandidates) {
      const byThread = await ctx.db
        .query("conversations")
        .withIndex("by_email_thread", (q) => q.eq("emailThreadId", ref))
        .first();
      if (byThread && byThread.workspaceId === args.workspaceId) {
        conversation = byThread;
        break;
      }
    }
    if (!conversation) {
      const cid = await ctx.db.insert("conversations", {
        workspaceId: args.workspaceId,
        visitorId: visitor._id,
        channel: "email",
        status: "open",
        // The first message's Message-ID becomes the thread anchor.
        emailThreadId: args.messageId,
        lastMessageAt: now,
        createdAt: now,
      });
      conversation = (await ctx.db.get(cid))!;
    } else {
      await ctx.db.patch(conversation._id, { lastMessageAt: now });
    }

    const messageId = await ctx.db.insert("messages", {
      conversationId: conversation._id,
      workspaceId: args.workspaceId,
      brandId: conversation.brandId,
      channel: "email",
      role: "visitor",
      body: args.body,
      emailMessageId: args.messageId,
      emailInReplyTo: args.inReplyTo,
      emailSubject: args.subject,
      createdAt: now,
    });

    // Forward to the webhook fan-out.
    await ctx.scheduler.runAfter(0, internal.webhooks.enqueue, {
      workspaceId: args.workspaceId,
      eventType: "message.created",
      payload: JSON.stringify({
        type: "message.created",
        workspaceId: args.workspaceId,
        occurredAt: new Date(now).toISOString(),
        data: {
          messageId,
          conversationId: conversation._id,
          brandId: conversation.brandId,
          channel: "email",
          role: "visitor",
          fromEmail,
          subject: args.subject,
          body: args.body,
        },
      }),
    });

    return {
      conversationId: conversation._id,
      visitorId: visitor._id,
      messageId,
    };
  },
});

// ── Outbound: operator reply on email-channel conversation ────────────

/**
 * Retry schedule for outbound email — same shape as webhooks but with
 * a tighter early gradient (most provider failures clear in seconds).
 * 5 entries → up to 6 attempts spread across ~1 hour before giving up.
 */
const EMAIL_RETRY_BACKOFF_MS = [
  10_000, // 10s
  60_000, // 1m
  5 * 60_000, // 5m
  15 * 60_000, // 15m
  60 * 60_000, // 1h
];
const EMAIL_MAX_ATTEMPTS = EMAIL_RETRY_BACKOFF_MS.length + 1;

/**
 * Internal action — fires after `messages.send` schedules it for any
 * `email`-channel conversation. Looks up the workspace's email provider
 * config, POSTs to the provider's send endpoint, and records delivery
 * state on the message row. Failures are scheduled for retry with
 * exponential backoff.
 */
export const sendOperatorReply = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const ctxData = await ctx.runQuery(
      internal.emailIntegrations.loadOutboundContext,
      { messageId },
    );
    if (!ctxData) {
      await ctx.runMutation(
        internal.emailIntegrations.recordDeliveryFinal,
        {
          messageId,
          error: "No email integration / message context — won't retry",
        },
      );
      return null;
    }
    const { message, conversation, visitor, integration } = ctxData;
    if (!visitor.email) {
      await ctx.runMutation(
        internal.emailIntegrations.recordDeliveryFinal,
        { messageId, error: "Visitor has no email — won't retry" },
      );
      return null;
    }

    const subject =
      conversation.emailThreadId && message.emailSubject
        ? message.emailSubject.startsWith("Re:")
          ? message.emailSubject
          : `Re: ${message.emailSubject}`
        : `Re: ${conversation.emailThreadId ? "your message" : "PraxTalk"}`;

    const fromHeader = integration.fromName
      ? `${integration.fromName} <${integration.fromAddress}>`
      : integration.fromAddress;

    try {
      if (integration.provider === "postmark") {
        await postmarkSend({
          apiKey: integration.apiKey,
          from: fromHeader,
          to: visitor.email,
          subject,
          body: message.body,
          inReplyTo: conversation.emailThreadId,
        });
      } else if (integration.provider === "sendgrid") {
        await sendgridSend({
          apiKey: integration.apiKey,
          from: integration.fromAddress,
          fromName: integration.fromName,
          to: visitor.email,
          subject,
          body: message.body,
          inReplyTo: conversation.emailThreadId,
        });
      } else if (integration.provider === "resend") {
        await resendSend({
          apiKey: integration.apiKey,
          from: fromHeader,
          to: visitor.email,
          subject,
          body: message.body,
          inReplyTo: conversation.emailThreadId,
        });
      }

      await ctx.runMutation(
        internal.emailIntegrations.recordDeliverySuccess,
        { messageId },
      );
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Email send failed";
      await ctx.runMutation(
        internal.emailIntegrations.recordDeliveryFailure,
        { messageId, error: errorMessage },
      );
    }
    return null;
  },
});

export const recordDeliverySuccess = internalMutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const attempts = (message.emailDelivery?.attempts ?? 0) + 1;
    await ctx.db.patch(messageId, {
      emailDelivery: {
        status: "delivered",
        attempts,
        deliveredAt: Date.now(),
      },
    });
    return null;
  },
});

export const recordDeliveryFailure = internalMutation({
  args: { messageId: v.id("messages"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;
    const attempts = (message.emailDelivery?.attempts ?? 0) + 1;

    if (attempts >= EMAIL_MAX_ATTEMPTS) {
      await ctx.db.patch(args.messageId, {
        emailDelivery: {
          status: "failed",
          attempts,
          error: args.error,
        },
      });
      return null;
    }

    const delay =
      EMAIL_RETRY_BACKOFF_MS[attempts - 1] ?? EMAIL_RETRY_BACKOFF_MS[0];
    const nextRetryAt = Date.now() + delay;
    await ctx.db.patch(args.messageId, {
      emailDelivery: {
        status: "retrying",
        attempts,
        error: args.error,
        nextRetryAt,
      },
    });
    await ctx.scheduler.runAfter(
      delay,
      internal.emailIntegrations.sendOperatorReply,
      { messageId: args.messageId },
    );
    return null;
  },
});

/**
 * Permanent failure — no retries (e.g. visitor has no email, no
 * integration configured). Used when the failure is structural rather
 * than transient.
 */
export const recordDeliveryFinal = internalMutation({
  args: { messageId: v.id("messages"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;
    await ctx.db.patch(args.messageId, {
      emailDelivery: {
        status: "failed",
        attempts: (message.emailDelivery?.attempts ?? 0) + 1,
        error: args.error,
      },
    });
    return null;
  },
});

/**
 * Loader for the outbound action — pulls the message + conversation +
 * visitor + integration in one query (transaction-safe).
 */
export const loadOutboundContext = internalQuery({
  args: { messageId: v.id("messages") },
  handler: async (ctx, { messageId }) => {
    const message = await ctx.db.get(messageId);
    if (!message) return null;
    const conversation = await ctx.db.get(message.conversationId);
    if (!conversation) return null;
    const visitor = await ctx.db.get(conversation.visitorId);
    if (!visitor) return null;
    const integration = await ctx.db
      .query("emailIntegrations")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", message.workspaceId),
      )
      .first();
    if (!integration || !integration.enabled) return null;
    return { message, conversation, visitor, integration };
  },
});

// ── Provider adapters ─────────────────────────────────────────────────

async function postmarkSend(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}) {
  const headers: Record<string, string>[] = [];
  if (args.inReplyTo) {
    headers.push({ Name: "In-Reply-To", Value: args.inReplyTo });
    headers.push({ Name: "References", Value: args.inReplyTo });
  }
  const res = await fetch("https://api.postmarkapp.com/email", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-postmark-server-token": args.apiKey,
    },
    body: JSON.stringify({
      From: args.from,
      To: args.to,
      Subject: args.subject,
      TextBody: args.body,
      MessageStream: "outbound",
      Headers: headers,
    }),
  });
  if (!res.ok) {
    throw new Error(`Postmark send failed: ${res.status} ${await res.text()}`);
  }
}

async function sendgridSend(args: {
  apiKey: string;
  from: string;
  fromName?: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}) {
  const headers: Record<string, string> = {};
  if (args.inReplyTo) {
    headers["In-Reply-To"] = args.inReplyTo;
    headers["References"] = args.inReplyTo;
  }
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: args.to }], headers }],
      from: { email: args.from, name: args.fromName },
      subject: args.subject,
      content: [{ type: "text/plain", value: args.body }],
    }),
  });
  if (!res.ok) {
    throw new Error(`SendGrid send failed: ${res.status} ${await res.text()}`);
  }
}

async function resendSend(args: {
  apiKey: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string;
}) {
  const headers: Record<string, string> = {};
  if (args.inReplyTo) {
    headers["In-Reply-To"] = args.inReplyTo;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${args.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: args.from,
      to: args.to,
      subject: args.subject,
      text: args.body,
      headers,
    }),
  });
  if (!res.ok) {
    throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
  }
}

// Quiet unused-imports in case Id<> isn't referenced after edits.
void (null as unknown as Id<"emailIntegrations">);

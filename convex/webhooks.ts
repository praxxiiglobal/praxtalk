import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import { generateWebhookSecret, hmacSha256 } from "./lib/auth";

// Allowed event types. Add to this list when you wire a new event.
export const EVENT_TYPES = [
  "conversation.created",
  "conversation.status_changed",
  "message.created",
  "lead.created",
  "lead.status_changed",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const eventTypeValidator = v.union(
  ...EVENT_TYPES.map((t) => v.literal(t)),
);

// ── Subscription CRUD ─────────────────────────────────────────────────

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const subs = await ctx.db
      .query("webhookSubscriptions")
      .withIndex("by_workspace_enabled", (q) =>
        q.eq("workspaceId", workspaceId),
      )
      .collect();
    return subs
      .map((s) => ({
        _id: s._id,
        url: s.url,
        events: s.events,
        enabled: s.enabled,
        // Only show first 12 chars of the secret in the UI; the customer
        // sees it in full when minted, then never again.
        secretPreview: s.secret.slice(0, 12) + "…",
        createdAt: s.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const create = mutation({
  args: {
    sessionToken: v.string(),
    url: v.string(),
    events: v.array(eventTypeValidator),
  },
  returns: v.object({
    subscriptionId: v.id("webhookSubscriptions"),
    secret: v.string(),
  }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can manage webhooks.");
    }
    const url = args.url.trim();
    if (!/^https?:\/\//.test(url)) {
      throw new Error("URL must start with http:// or https://");
    }
    if (args.events.length === 0) {
      throw new Error("Pick at least one event to subscribe to.");
    }
    const secret = generateWebhookSecret();
    const subscriptionId = await ctx.db.insert("webhookSubscriptions", {
      workspaceId,
      url,
      secret,
      events: args.events,
      enabled: true,
      createdBy: operator._id,
      createdAt: Date.now(),
    });
    return { subscriptionId, secret };
  },
});

export const setEnabled = mutation({
  args: {
    sessionToken: v.string(),
    subscriptionId: v.id("webhookSubscriptions"),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can manage webhooks.");
    }
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub || sub.workspaceId !== workspaceId) {
      throw new Error("Subscription not found.");
    }
    await ctx.db.patch(args.subscriptionId, { enabled: args.enabled });
    return null;
  },
});

export const remove = mutation({
  args: {
    sessionToken: v.string(),
    subscriptionId: v.id("webhookSubscriptions"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can manage webhooks.");
    }
    const sub = await ctx.db.get(args.subscriptionId);
    if (!sub || sub.workspaceId !== workspaceId) {
      throw new Error("Subscription not found.");
    }
    await ctx.db.delete(args.subscriptionId);
    return null;
  },
});

// ── Dispatch flow ──────────────────────────────────────────────────────
//
// Mutations call `enqueue` to push an event for a given workspace. The
// mutation is fast: it just writes an event row + schedules `deliver`.
// `deliver` is an action (so it can fetch + sign) that POSTs to the
// customer URL and writes back the result.
//
// We keep this simple — no exponential backoff yet, just one attempt.
// Promote to a proper retry queue after the first integration partner
// asks for it.

/**
 * Internal — call from any mutation to fan out an event to every enabled
 * subscription for this workspace that opted into the eventType.
 */
export const enqueue = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    eventType: v.string(),
    payload: v.string(), // already-stringified JSON
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const subs = await ctx.db
      .query("webhookSubscriptions")
      .withIndex("by_workspace_enabled", (q) =>
        q.eq("workspaceId", args.workspaceId).eq("enabled", true),
      )
      .collect();

    const matching = subs.filter((s) => s.events.includes(args.eventType));
    for (const sub of matching) {
      const eventId = await ctx.db.insert("webhookEvents", {
        workspaceId: args.workspaceId,
        subscriptionId: sub._id,
        eventType: args.eventType,
        payload: args.payload,
        status: "pending",
        attempts: 0,
        createdAt: Date.now(),
      });
      await ctx.scheduler.runAfter(0, internal.webhooks.deliver, {
        eventId,
      });
    }
    return null;
  },
});

/**
 * Internal — read a pending event + its subscription details so the
 * delivery action can sign and POST.
 */
export const loadPendingEvent = internalQuery({
  args: { eventId: v.id("webhookEvents") },
  handler: async (ctx, { eventId }) => {
    const event = await ctx.db.get(eventId);
    if (!event) return null;
    const sub = await ctx.db.get(event.subscriptionId);
    if (!sub) return null;
    return { event, sub };
  },
});

/**
 * Retry schedule. Each entry is the delay (in ms) before the *next*
 * attempt. With 5 entries we get up to 6 attempts spread across ~7
 * hours before giving up and marking the event permanently `failed`.
 */
const RETRY_BACKOFF_MS = [
  30_000, // 30s
  2 * 60_000, // 2m
  10 * 60_000, // 10m
  60 * 60_000, // 1h
  6 * 60 * 60_000, // 6h
];
const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length + 1;

export const recordDelivery = internalMutation({
  args: {
    eventId: v.id("webhookEvents"),
    success: v.boolean(),
    httpStatus: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;
    const attempts = event.attempts + 1;

    if (args.success) {
      await ctx.db.patch(args.eventId, {
        status: "delivered",
        httpStatus: args.httpStatus,
        error: undefined,
        attempts,
        nextRetryAt: undefined,
        deliveredAt: Date.now(),
      });
      return null;
    }

    // Failed attempt — either schedule a retry or mark permanent failure.
    if (attempts >= MAX_ATTEMPTS) {
      await ctx.db.patch(args.eventId, {
        status: "failed",
        httpStatus: args.httpStatus,
        error: args.error,
        attempts,
        nextRetryAt: undefined,
      });
      return null;
    }

    const delay = RETRY_BACKOFF_MS[attempts - 1] ?? RETRY_BACKOFF_MS[0];
    const nextRetryAt = Date.now() + delay;
    await ctx.db.patch(args.eventId, {
      status: "retrying",
      httpStatus: args.httpStatus,
      error: args.error,
      attempts,
      nextRetryAt,
    });
    await ctx.scheduler.runAfter(delay, internal.webhooks.deliver, {
      eventId: args.eventId,
    });
    return null;
  },
});

/**
 * Operator-triggered manual retry. Resets the event back to "pending"
 * and reschedules immediately. Useful when the customer's CRM was down
 * past the automatic backoff window.
 */
export const manualRetry = mutation({
  args: {
    sessionToken: v.string(),
    eventId: v.id("webhookEvents"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can replay webhooks.");
    }
    const event = await ctx.db.get(args.eventId);
    if (!event || event.workspaceId !== workspaceId) {
      throw new Error("Event not found.");
    }
    await ctx.db.patch(args.eventId, {
      status: "pending",
      error: undefined,
      httpStatus: undefined,
      nextRetryAt: undefined,
    });
    await ctx.scheduler.runAfter(0, internal.webhooks.deliver, {
      eventId: args.eventId,
    });
    return null;
  },
});

/**
 * Recent webhook events for the dashboard. Used by the events log on
 * `/app/integrations` so admins can see what fired and what failed.
 */
export const listRecentEvents = query({
  args: {
    sessionToken: v.string(),
    subscriptionId: v.optional(v.id("webhookSubscriptions")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { workspaceId } = await requireOperator(ctx, args.sessionToken);
    const limit = Math.min(args.limit ?? 30, 200);

    let events;
    if (args.subscriptionId) {
      events = await ctx.db
        .query("webhookEvents")
        .withIndex("by_subscription_created", (q) =>
          q.eq("subscriptionId", args.subscriptionId!),
        )
        .order("desc")
        .take(limit);
    } else {
      events = await ctx.db
        .query("webhookEvents")
        .withIndex("by_status_created")
        .order("desc")
        .filter((q) => q.eq(q.field("workspaceId"), workspaceId))
        .take(limit);
    }
    return events
      .filter((e) => e.workspaceId === workspaceId)
      .map((e) => ({
        _id: e._id,
        subscriptionId: e.subscriptionId,
        eventType: e.eventType,
        status: e.status,
        attempts: e.attempts,
        httpStatus: e.httpStatus,
        error: e.error,
        nextRetryAt: e.nextRetryAt,
        createdAt: e.createdAt,
        deliveredAt: e.deliveredAt,
      }));
  },
});

/**
 * The delivery action — POSTs the JSON payload to the customer URL with
 * an HMAC-SHA256 signature in `X-PraxTalk-Signature` (Stripe-style:
 * `t=<timestamp>,v1=<hex>`).
 */
export const deliver = internalAction({
  args: { eventId: v.id("webhookEvents") },
  returns: v.null(),
  handler: async (ctx, { eventId }) => {
    const loaded: Awaited<
      ReturnType<typeof ctx.runQuery>
    > extends infer T
      ? T
      : never = await ctx.runQuery(internal.webhooks.loadPendingEvent, {
      eventId,
    });
    if (!loaded) return null;
    const { event, sub } = loaded as {
      event: { _id: Id<"webhookEvents">; eventType: string; payload: string };
      sub: { url: string; secret: string; enabled: boolean };
    };
    if (!sub.enabled) {
      await ctx.runMutation(internal.webhooks.recordDelivery, {
        eventId,
        success: false,
        error: "Subscription disabled",
      });
      return null;
    }

    const ts = Math.floor(Date.now() / 1000).toString();
    const signedPayload = `${ts}.${event.payload}`;
    const sig = await hmacSha256(sub.secret, signedPayload);

    try {
      const res = await fetch(sub.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-praxtalk-signature": `t=${ts},v1=${sig}`,
          "x-praxtalk-event": event.eventType,
          "x-praxtalk-event-id": String(event._id),
          "user-agent": "PraxTalk-Webhooks/1.0",
        },
        body: event.payload,
      });
      await ctx.runMutation(internal.webhooks.recordDelivery, {
        eventId,
        success: res.ok,
        httpStatus: res.status,
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (err) {
      await ctx.runMutation(internal.webhooks.recordDelivery, {
        eventId,
        success: false,
        error: err instanceof Error ? err.message : "fetch failed",
      });
    }
    return null;
  },
});

// ── Helpers used by other mutations to fire events ────────────────────

/**
 * Convenience for in-mutation use. Schedules `internal.webhooks.enqueue`
 * to run immediately so the calling mutation stays small + fast and we
 * don't block the operator-facing transaction on webhook fan-out.
 *
 * Fire-and-forget — failures live in the `webhookEvents` table for the
 * dashboard to surface.
 */
export async function fireEvent(
  ctx: {
    scheduler: {
      runAfter: (
        delayMs: number,
        fn: typeof internal.webhooks.enqueue,
        args: { workspaceId: Id<"workspaces">; eventType: string; payload: string },
      ) => Promise<unknown>;
    };
  },
  workspaceId: Id<"workspaces">,
  eventType: EventType,
  data: Record<string, unknown>,
): Promise<void> {
  const payload = JSON.stringify({
    type: eventType,
    workspaceId,
    occurredAt: new Date().toISOString(),
    data,
  });
  await ctx.scheduler.runAfter(0, internal.webhooks.enqueue, {
    workspaceId,
    eventType,
    payload,
  });
}

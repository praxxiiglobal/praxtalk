import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * PraxTalk schema — multi-tenant from day one, multi-brand from v1.
 *
 * Multi-brand migration is in flight (widen-migrate-narrow):
 *   Phase 1 — `brands` table added, `brandId` fields added as optional,
 *             `widgetConfigs` + `workspaces.widgetId` kept around so the
 *             dev deployment still validates pre-migration docs.
 *   Phase 2 — backfill mutation populates brandId everywhere.
 *   Phase 3 — narrow: brandId becomes required, widgetConfigs is dropped,
 *             workspaces.widgetId is dropped.
 */
export default defineSchema({
  // ── Tenancy ────────────────────────────────────────────────────────
  workspaces: defineTable({
    slug: v.string(),
    name: v.string(),
    plan: v.union(
      v.literal("spark"),
      v.literal("team"),
      v.literal("scale"),
      v.literal("enterprise"),
    ),
    createdAt: v.number(),
  }).index("by_slug", ["slug"]),

  // ── Brands ─────────────────────────────────────────────────────────
  // One workspace owns N brands. Each brand has its own widget snippet,
  // theming, and welcome message. Operators are scoped to brands via
  // `operators.brandAccess`. This is the differentiator vs Intercom/Tawk.
  brands: defineTable({
    workspaceId: v.id("workspaces"),
    slug: v.string(),
    name: v.string(),
    widgetId: v.string(), // public id used in <script data-widget-id="…">
    primaryColor: v.string(),
    welcomeMessage: v.string(),
    position: v.union(v.literal("br"), v.literal("bl")),
    avatarUrl: v.optional(v.string()),
    businessHours: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_widget_id", ["widgetId"])
    .index("by_workspace_slug", ["workspaceId", "slug"]),

  // ── Operators (the customer's team replying via dashboard) ─────────
  operators: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    name: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("agent"),
    ),
    // Brand access scope. "all" = sees every brand in the workspace
    // (default for owners/admins). Array = scoped agents.
    // Optional during Phase 1 migration; required in Phase 3.
    brandAccess: v.optional(
      v.union(v.literal("all"), v.array(v.id("brands"))),
    ),
    passwordHash: v.string(), // PBKDF2 — see convex/lib/auth.ts
    createdAt: v.number(),
  })
    .index("by_workspace_email", ["workspaceId", "email"])
    .index("by_email", ["email"]),

  // Operator browser sessions — bearer token in httpOnly cookie
  sessions: defineTable({
    operatorId: v.id("operators"),
    workspaceId: v.id("workspaces"),
    tokenHash: v.string(),
    expiresAt: v.number(),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_operator", ["operatorId"]),

  // ── Visitors (end-users on the customer's site) ───────────────────
  visitors: defineTable({
    workspaceId: v.id("workspaces"),
    // Optional during Phase 1; required in Phase 3.
    // A visitor on Brand A is a different doc from the same person
    // on Brand B (separate identity per brand).
    brandId: v.optional(v.id("brands")),
    visitorKey: v.string(), // anonymous cookie / fingerprint
    // Pre-chat form fields. Captured by the widget before the first
    // message is sent. Optional in the schema only because legacy rows
    // (and the widget's "in-progress" identification step) may not
    // have them yet.
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()), // E.164 with country code, e.g. "+919999999999"
    // Captured server-side from the widget request so operators can
    // see where a visitor is connecting from.
    ip: v.optional(v.string()),
    location: v.optional(
      v.object({
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
        region: v.optional(v.string()),
        city: v.optional(v.string()),
        lat: v.optional(v.number()),
        lng: v.optional(v.number()),
        timezone: v.optional(v.string()),
      }),
    ),
    customData: v.optional(v.string()), // JSON blob (plan, MRR, etc.)
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  })
    .index("by_workspace_visitor_key", ["workspaceId", "visitorKey"])
    .index("by_brand_visitor_key", ["brandId", "visitorKey"]),

  // ── Conversations + messages ──────────────────────────────────────
  conversations: defineTable({
    workspaceId: v.id("workspaces"),
    // Optional during Phase 1; required in Phase 3.
    brandId: v.optional(v.id("brands")),
    visitorId: v.id("visitors"),
    // Where the conversation came from. Required as of the Phase 2
    // narrow on 2026-04-29 — every backfilled row was stamped to
    // "web_chat" by the migration, every new row sets it explicitly.
    channel: v.union(
      v.literal("web_chat"),
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("voice"),
    ),
    assignedOperatorId: v.optional(v.id("operators")),
    status: v.union(
      v.literal("open"),
      v.literal("snoozed"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
    resolvedBy: v.optional(
      v.union(v.literal("atlas"), v.literal("operator")),
    ),
    confidence: v.optional(v.number()),
    // Email-specific threading hints (RFC 5322 Message-ID). Only set on
    // email conversations.
    emailThreadId: v.optional(v.string()),
    // Workspace-level "last time any operator opened this conversation".
    // Drives the unread badge — a conversation is unread if its
    // `lastMessageAt > lastOperatorReadAt` (or this field is unset and
    // the most recent message came from the visitor).
    lastOperatorReadAt: v.optional(v.number()),
    lastMessageAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_workspace_status_lastmsg", [
      "workspaceId",
      "status",
      "lastMessageAt",
    ])
    .index("by_workspace_visitor", ["workspaceId", "visitorId"])
    .index("by_brand_status_lastmsg", ["brandId", "status", "lastMessageAt"])
    .index("by_email_thread", ["emailThreadId"]),

  // ── Public API ─────────────────────────────────────────────────────
  // Workspace-scoped API keys for headless integrations (e.g. customer
  // CRMs hitting our REST endpoints under /api/v1/*).
  apiKeys: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(), // human label, e.g. "Acme CRM production"
    prefix: v.string(), // first 8 chars of the key, shown in UI; rest is hashed
    keyHash: v.string(), // SHA-256 of the secret
    scope: v.union(v.literal("read"), v.literal("write")),
    // Brand restriction. When set, REST endpoints filter every list
    // and reject every action whose target conversation/lead doesn't
    // belong to this brand. Unset = full workspace access.
    brandId: v.optional(v.id("brands")),
    createdBy: v.id("operators"),
    createdAt: v.number(),
    lastUsedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_prefix", ["prefix"]),

  // ── Webhooks ───────────────────────────────────────────────────────
  webhookSubscriptions: defineTable({
    workspaceId: v.id("workspaces"),
    url: v.string(),
    secret: v.string(), // shared HMAC secret; we sign every payload
    events: v.array(v.string()), // e.g. ["conversation.created", "message.created"]
    enabled: v.boolean(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
  }).index("by_workspace_enabled", ["workspaceId", "enabled"]),

  // Outgoing webhook delivery log — one row per event, updated as
  // attempts succeed/fail. Status flow:
  //   pending → retrying (after each failure, while attempts < max)
  //           → delivered (on 2xx) | failed (on max attempts exhausted)
  webhookEvents: defineTable({
    workspaceId: v.id("workspaces"),
    subscriptionId: v.id("webhookSubscriptions"),
    eventType: v.string(),
    payload: v.string(), // JSON-serialised body
    status: v.union(
      v.literal("pending"),
      v.literal("retrying"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    httpStatus: v.optional(v.number()),
    error: v.optional(v.string()),
    attempts: v.number(),
    nextRetryAt: v.optional(v.number()),
    createdAt: v.number(),
    deliveredAt: v.optional(v.number()),
  })
    .index("by_subscription_created", ["subscriptionId", "createdAt"])
    .index("by_status_created", ["status", "createdAt"]),

  // ── Leads ──────────────────────────────────────────────────────────
  // A "lead" is a saved snapshot of a visitor + their conversation context,
  // promoted by an operator from the inbox. Used as a lightweight CRM —
  // the team can follow up later without losing the visitor's details.
  leads: defineTable({
    workspaceId: v.id("workspaces"),
    brandId: v.optional(v.id("brands")),
    conversationId: v.optional(v.id("conversations")),
    visitorId: v.optional(v.id("visitors")),
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    location: v.optional(
      v.object({
        country: v.optional(v.string()),
        countryCode: v.optional(v.string()),
        region: v.optional(v.string()),
        city: v.optional(v.string()),
        timezone: v.optional(v.string()),
      }),
    ),
    ip: v.optional(v.string()),
    status: v.union(
      v.literal("new"),
      v.literal("contacted"),
      v.literal("qualified"),
      v.literal("won"),
      v.literal("lost"),
    ),
    notes: v.optional(v.string()),
    createdBy: v.id("operators"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace_status_updated", [
      "workspaceId",
      "status",
      "updatedAt",
    ])
    .index("by_brand_status_updated", ["brandId", "status", "updatedAt"])
    .index("by_workspace_email", ["workspaceId", "email"])
    .index("by_conversation", ["conversationId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    workspaceId: v.id("workspaces"), // denormalized for tenant scoping
    // Denormalized for inbox row filtering. Optional during Phase 1.
    brandId: v.optional(v.id("brands")),
    // Channel inherited from the parent conversation, denormalized so
    // analytics queries can filter without a join. Required as of the
    // Phase 2 narrow on 2026-04-29.
    channel: v.union(
      v.literal("web_chat"),
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("voice"),
    ),
    role: v.union(
      v.literal("visitor"),
      v.literal("operator"),
      v.literal("atlas"),
      v.literal("system"),
    ),
    senderOperatorId: v.optional(v.id("operators")),
    body: v.string(),
    // Email-specific metadata. Used to thread inbound replies and to
    // build outbound Message-IDs.
    emailMessageId: v.optional(v.string()),
    emailInReplyTo: v.optional(v.string()),
    emailSubject: v.optional(v.string()),
    // Outbound delivery state for email-channel operator replies.
    // Updated by `internal.emailIntegrations.sendOperatorReply` with
    // exponential-backoff retries.
    emailDelivery: v.optional(
      v.object({
        status: v.union(
          v.literal("pending"),
          v.literal("retrying"),
          v.literal("delivered"),
          v.literal("failed"),
        ),
        attempts: v.number(),
        error: v.optional(v.string()),
        nextRetryAt: v.optional(v.number()),
        deliveredAt: v.optional(v.number()),
      }),
    ),
    createdAt: v.number(),
  }).index("by_conversation_created", ["conversationId", "createdAt"]),

  // ── Atlas AI ───────────────────────────────────────────────────────
  // Per-workspace config for the AI agent. The dashboard's settings UI
  // writes here; the `runAtlas` action reads it.
  //
  // Behaviour: if `apiKey` is empty we still record a run (for the
  // dashboard's "Atlas wasn't configured" banner) but skip the network
  // call. Auto-reply requires `enabled` AND a key AND `confidence >=
  // autoReplyThreshold`. Otherwise we keep the generated reply as a
  // draft "suggestion" the operator can send with one click.
  atlasConfigs: defineTable({
    workspaceId: v.id("workspaces"),
    enabled: v.boolean(),
    provider: v.literal("anthropic"),
    apiKey: v.string(), // workspace-stored; never round-tripped to client
    model: v.string(), // e.g. "claude-haiku-4-5-20251001"
    systemPrompt: v.string(), // brand voice, business context, do/don't
    knowledgeBase: v.optional(v.string()), // optional pasted FAQ/docs
    autoReplyThreshold: v.number(), // 0..1 — below this, draft only
    maxTokens: v.number(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // Every Atlas evaluation logs a row here — both successful and
  // skipped runs. Used by the inbox suggestion panel ("latest run for
  // this conversation") and by the audit trail.
  atlasRuns: defineTable({
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    triggerMessageId: v.id("messages"),
    status: v.union(
      v.literal("pending"),
      v.literal("auto_replied"),
      v.literal("drafted"),
      v.literal("skipped_no_config"),
      v.literal("failed"),
    ),
    reply: v.optional(v.string()),
    confidence: v.optional(v.number()), // 0..1, from the model
    reasoning: v.optional(v.string()),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
    error: v.optional(v.string()),
    // The message row Atlas wrote (only when status = "auto_replied").
    autoReplyMessageId: v.optional(v.id("messages")),
    createdAt: v.number(),
    completedAt: v.optional(v.number()),
  })
    .index("by_conversation_created", ["conversationId", "createdAt"])
    .index("by_workspace_created", ["workspaceId", "createdAt"]),

  // ── Email integration ─────────────────────────────────────────────
  // Per-workspace email provider config. Drives both inbound parsing
  // (which workspace owns mail to a given inbox alias) and outbound
  // sending (which API key + from address to use).
  emailIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    provider: v.union(
      v.literal("postmark"),
      v.literal("sendgrid"),
      v.literal("resend"),
    ),
    // API key (encrypted-at-rest by Convex; we just store it as a string
    // here. Treat with care in the UI — never round-trip back to client).
    apiKey: v.string(),
    fromAddress: v.string(), // e.g. "support@acme.com"
    fromName: v.optional(v.string()),
    // The local-part operators sees as the inbound address for this
    // workspace, e.g. "acme" -> mail to acme@inbound.praxtalk.com lands
    // in this workspace's inbox.
    inboundAlias: v.string(),
    enabled: v.boolean(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_inbound_alias", ["inboundAlias"]),
});

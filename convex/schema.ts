import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * PraxTalk schema — multi-tenant from day one, multi-brand from v1.
 *
 * Multi-brand migration complete (widen-migrate-narrow done as of
 * 2026-05-02). brandId is required on visitors, conversations, leads,
 * messages, and savedReplies. It stays optional on apiKeys —
 * those tables use null/absent to mean
 * "workspace-wide" (vs brand-scoped), which is a real product axis, not
 * a migration artefact.
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
    // Subscription state — populated by the webhook for whichever
    // provider the customer used to subscribe. A workspace can only
    // have one active subscription at a time across providers.
    subscriptionProvider: v.optional(
      v.union(v.literal("paypal"), v.literal("razorpay")),
    ),
    paypalSubscriptionId: v.optional(v.string()),
    paypalPayerId: v.optional(v.string()),
    razorpaySubscriptionId: v.optional(v.string()),
    razorpayCustomerId: v.optional(v.string()),
    subscriptionStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("past_due"),
        v.literal("cancelled"),
        v.literal("paused"),
      ),
    ),
    currentPeriodEnd: v.optional(v.number()),
    // Platform-level moderation status — set by Praxxii staff from
    // /admin, INDEPENDENT of subscriptionStatus (which is billing).
    // requireOperator + login refuse anything but "active". When
    // unset, treated as "active". Suspending revokes all sessions
    // immediately; pending_review keeps the workspace read-only-ish
    // for staff review without locking the owner out.
    platformStatus: v.optional(
      v.union(
        v.literal("active"),
        v.literal("suspended"),
        v.literal("pending_review"),
        v.literal("flagged"),
      ),
    ),
    platformStatusReason: v.optional(v.string()),
    platformStatusAt: v.optional(v.number()),
    // Operator dashboard accent color — overrides the default
    // PraxTalk-green when set. Hex string (`#RRGGBB`). Customers match
    // it to their own brand color.
    dashboardAccent: v.optional(v.string()),
    // Per-workspace feature gates, set by platform admin from
    // /admin/workspaces/[id]. Every flag is OPTIONAL — when missing,
    // we treat the feature as enabled. Setting `false` explicitly
    // disables it. This default-on posture means existing workspaces
    // keep working without migration; only when an admin opts a
    // workspace OUT of a feature does anything change.
    features: v.optional(
      v.object({
        channels: v.optional(
          v.object({
            chat: v.optional(v.boolean()),
            email: v.optional(v.boolean()),
            whatsapp: v.optional(v.boolean()),
            voice: v.optional(v.boolean()),
            sms: v.optional(v.boolean()),
          }),
        ),
        atlasAi: v.optional(v.boolean()),
        leads: v.optional(v.boolean()),
        bookingPages: v.optional(v.boolean()),
        multiBrand: v.optional(v.boolean()),
        analytics: v.optional(v.boolean()),
      }),
    ),
    // Cap on concurrent active sessions per operator. Set by platform
    // admin from /admin/workspaces/[id]. When undefined or 0 → no cap.
    // Enforced on login: if cap is exceeded after issuing the new
    // session, the oldest session(s) are evicted to bring the count
    // back to the cap. Use this to limit how many devices/browsers a
    // single operator account can be signed in on at once.
    maxSessionsPerOperator: v.optional(v.number()),
    // Forensic fields captured at signup time. signupIp is the
    // request IP; signupFingerprint is FingerprintJS's visitorId
    // (Murmur3 hash of canvas/audio/font/screen/etc. — stable per
    // browser without cookies). Both used by /admin/workspaces to
    // surface cluster-signup abuse (one fingerprint or IP creating
    // many workspaces).
    signupIp: v.optional(v.string()),
    signupFingerprint: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_paypal_subscription", ["paypalSubscriptionId"])
    .index("by_razorpay_subscription", ["razorpaySubscriptionId"])
    .index("by_signup_fingerprint", ["signupFingerprint"])
    .index("by_signup_ip", ["signupIp"]),

  // Email-verification holding pen. When the platform-level Resend
  // env is set, signups don't immediately materialise a workspace;
  // they sit here behind a one-shot verification token until the
  // owner clicks the email link. Cleaned up on consume or expiry.
  pendingSignups: defineTable({
    email: v.string(),
    workspaceName: v.string(),
    ownerName: v.string(),
    // Password is hashed at intake — plaintext never sits in the
    // pending-signup row, in case the table is ever exported.
    passwordHash: v.string(),
    tokenHash: v.string(),
    tokenPrefix: v.string(), // first 12 chars; index lookup
    ipAddress: v.optional(v.string()),
    fingerprint: v.optional(v.string()),
    expiresAt: v.number(),
    createdAt: v.number(),
    consumedAt: v.optional(v.number()),
  })
    .index("by_token_prefix", ["tokenPrefix"])
    .index("by_email", ["email"]),

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
    // Launcher-bubble icon when avatarUrl is set: "logo" (default)
    // shows the brand logo on the bubble, "glyph" keeps the classic
    // chat icon (for logos that read badly at small sizes).
    bubbleIcon: v.optional(v.union(v.literal("logo"), v.literal("glyph"))),
    businessHours: v.optional(v.string()),
    // Structured business-hours config used by the off-hours auto-
    // responder. Free-text `businessHours` above stays as a human-
    // readable description; this field drives enforcement.
    //
    // weeklySchedule is monday=0..sunday=6. Each day is either null
    // (closed all day) or { open, close } in MINUTES SINCE MIDNIGHT
    // local to `timezone` (e.g. 9:00 = 540, 17:30 = 1050). Multiple
    // ranges per day are explicitly NOT supported here — keep the
    // shape narrow until the second-window need is real.
    //
    // offHoursMessage is the templated body sent automatically when
    // a visitor messages outside business hours and no operator has
    // replied yet. Uses the same {{visitor.name}} substitutions as
    // saved replies. Only one auto-reply per conversation lifetime
    // (conversation.offHoursAutoRepliedAt is the lock).
    businessHoursConfig: v.optional(
      v.object({
        timezone: v.string(),
        weeklySchedule: v.array(
          v.union(v.null(), v.object({ open: v.number(), close: v.number() })),
        ),
        offHoursMessage: v.string(),
      }),
    ),
    // Click-to-chat WhatsApp ("wa.me lite") — phone in
    // international E.164 without "+", e.g. "919876543210". When set,
    // the widget can render a "Chat on WhatsApp" button that opens
    // wa.me/<phone>?text=<welcome>. No API setup required, no inbox
    // integration — just a deep-link.
    waMePhone: v.optional(v.string()),
    waMePrefilledMessage: v.optional(v.string()),
    // When true (default if unset), the widget skips the pre-chat
    // form and drops the visitor straight into chat. After the
    // visitor sends their first message, an inline identity card
    // appears asking for name + email + phone (all optional). The
    // visitor can fill or skip; either way the card disappears and
    // we never ask again on that browser.
    //
    // When false, the visitor stays fully anonymous unless an
    // operator/Atlas asks for identity in chat.
    askIdentityInChat: v.optional(v.boolean()),
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
    role: v.union(v.literal("owner"), v.literal("admin"), v.literal("agent")),
    // Brand access scope. "all" = sees every brand in the workspace
    // (default for owners/admins). Array = scoped agents.
    // Optional during Phase 1 migration; required in Phase 3.
    brandAccess: v.optional(v.union(v.literal("all"), v.array(v.id("brands")))),
    passwordHash: v.string(), // PBKDF2 — see convex/lib/auth.ts
    createdAt: v.number(),
  })
    .index("by_workspace_email", ["workspaceId", "email"])
    .index("by_email", ["email"]),

  // Pending operator invites — email + role + brand access + signed token.
  // The raw token is hashed at rest; the dashboard never re-shows it. The
  // recipient clicks the link in their email, lands on /invite/<token>,
  // sets a password, and the row is consumed (acceptedAt set, operator
  // doc inserted).
  operatorInvites: defineTable({
    workspaceId: v.id("workspaces"),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("agent")),
    brandAccess: v.optional(v.union(v.literal("all"), v.array(v.id("brands")))),
    tokenHash: v.string(), // SHA-256 of the random invite token
    tokenPrefix: v.string(), // first 12 chars of token; UI lookup
    invitedBy: v.id("operators"),
    invitedAt: v.number(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_token_prefix", ["tokenPrefix"])
    .index("by_email", ["email"]),

  // Operator browser sessions — bearer token in httpOnly cookie
  sessions: defineTable({
    operatorId: v.id("operators"),
    workspaceId: v.id("workspaces"),
    tokenHash: v.string(),
    expiresAt: v.number(),
    // Device + location captured at login time. All optional so legacy
    // sessions stay valid; the admin Sessions panel parses userAgent
    // client-side into a device/OS/browser label and shows ipCity /
    // ipRegion / ipCountry as the location string.
    userAgent: v.optional(v.string()),
    ipAddress: v.optional(v.string()),
    ipCountry: v.optional(v.string()),
    ipRegion: v.optional(v.string()),
    ipCity: v.optional(v.string()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_operator", ["operatorId"])
    .index("by_workspace", ["workspaceId"]),

  // Password reset tokens — single-use, 1-hour TTL. Operator clicks the
  // link in their email, lands on /reset-password/<token>, sets a new
  // password. On completion the token is consumed and every existing
  // session for that operator is invalidated.
  passwordResetTokens: defineTable({
    operatorId: v.id("operators"),
    workspaceId: v.id("workspaces"),
    email: v.string(), // denormalised for "Reset for x@y" UI
    tokenHash: v.string(),
    tokenPrefix: v.string(), // first 12 chars; index lookup
    requestedAt: v.number(),
    expiresAt: v.number(),
    usedAt: v.optional(v.number()),
  })
    .index("by_token_prefix", ["tokenPrefix"])
    .index("by_operator", ["operatorId"]),

  // ── Visitors (end-users on the customer's site) ───────────────────
  visitors: defineTable({
    workspaceId: v.id("workspaces"),
    // A visitor on Brand A is a different doc from the same person
    // on Brand B (separate identity per brand).
    brandId: v.id("brands"),
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
    .index("by_brand_visitor_key", ["brandId", "visitorKey"])
    // Lookup by email used by booking-page submissions to dedupe an
    // existing visitor without scanning the whole table. Sparse
    // because email is optional — rows without an email simply don't
    // appear in this index, which is the desired behaviour.
    .index("by_workspace_email", ["workspaceId", "email"]),

  // ── Conversations + messages ──────────────────────────────────────
  conversations: defineTable({
    workspaceId: v.id("workspaces"),
    brandId: v.id("brands"),
    visitorId: v.id("visitors"),
    // Where the conversation came from. Required as of the Phase 2
    // narrow on 2026-04-29 — every backfilled row was stamped to
    // "web_chat" by the migration, every new row sets it explicitly.
    channel: v.union(
      v.literal("web_chat"),
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("voice"),
      v.literal("sms"),
    ),
    assignedOperatorId: v.optional(v.id("operators")),
    status: v.union(
      v.literal("open"),
      v.literal("snoozed"),
      v.literal("resolved"),
      v.literal("closed"),
    ),
    resolvedBy: v.optional(v.union(v.literal("atlas"), v.literal("operator"))),
    confidence: v.optional(v.number()),
    // Visitor explicitly asked to talk to a human. Atlas stops
    // evaluating new messages on this conversation; the inbox badges
    // it so operators jump in. Cleared when the conversation closes.
    atlasPaused: v.optional(v.boolean()),
    humanRequestedAt: v.optional(v.number()),
    // Email-specific threading hints (RFC 5322 Message-ID). Only set on
    // email conversations.
    emailThreadId: v.optional(v.string()),
    // Workspace-level "last time any operator opened this conversation".
    // Drives the unread badge — a conversation is unread if its
    // `lastMessageAt > lastOperatorReadAt` (or this field is unset and
    // the most recent message came from the visitor).
    lastOperatorReadAt: v.optional(v.number()),
    lastMessageAt: v.number(),
    // Set once when the VISITOR sends their first real message (any
    // channel: widget, email, WhatsApp, voice transcript). Unset =
    // the conversation exists only because the widget opened — CRM
    // integrations use this to keep silent widget-opens out of the
    // chat inbox (they show as live visitors instead).
    firstVisitorMessageAt: v.optional(v.number()),
    // SLA — wall-clock time of the first non-internal operator
    // message in this conversation. Set once, never overwritten.
    // The duration since `_creationTime` is the visitor-visible
    // first-response latency that goes into median + p95 metrics
    // on the analytics page.
    firstOperatorResponseAt: v.optional(v.number()),
    // Lock for the off-hours auto-responder. Set once when the brand
    // sends its first auto-reply on this conversation; we never send
    // a second one (visitors don't need 'we're closed' twice in the
    // same thread).
    offHoursAutoRepliedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace_status_lastmsg", [
      "workspaceId",
      "status",
      "lastMessageAt",
    ])
    // Used by the platform-admin /admin/workspaces query to grab a
    // workspace's whole timeline + most-recent activity in one
    // ordered scan (the by_workspace_status_lastmsg index above
    // requires status, which doesn't fit "give me everything for
    // this tenant").
    .index("by_workspace_lastmsg", ["workspaceId", "lastMessageAt"])
    .index("by_workspace_visitor", ["workspaceId", "visitorId"])
    .index("by_brand_status_lastmsg", ["brandId", "status", "lastMessageAt"])
    .index("by_email_thread", ["emailThreadId"]),

  // ── Typing indicators ─────────────────────────────────────────────
  // High-churn, ephemeral "who's typing right now" state. Kept in its
  // own table (not on the conversations doc) so the ~every-2s typing
  // writes don't contend with reads of the conversation row — per the
  // Convex guideline on separating heartbeat-style data. One row per
  // conversation, upserted. Each field is the wall-clock ms of the
  // last "still typing" ping from that party; readers treat a value
  // older than a few seconds as "stopped". Nothing prunes these rows
  // (one per conversation, tiny) — they're overwritten in place.
  typingStates: defineTable({
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    visitorTypingAt: v.optional(v.number()),
    operatorTypingAt: v.optional(v.number()),
  }).index("by_conversation", ["conversationId"]),

  // ── Conversation tags ─────────────────────────────────────────────
  // Many-to-many between conversations and a free-form tag string.
  // Normalised (rather than an array column on conversations) so
  // "all conversations tagged X" is an indexed lookup rather than a
  // table scan with a predicate. Tag strings are the source of truth
  // — workspace-scoped, lower-cased before insert.
  conversationTags: defineTable({
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    tag: v.string(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
  })
    .index("by_conversation", ["conversationId"])
    .index("by_workspace_tag", ["workspaceId", "tag"])
    .index("by_workspace_conversation_tag", [
      "workspaceId",
      "conversationId",
      "tag",
    ]),

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

  // ── Calendar connections (Phase 3 OAuth) ───────────────────────────
  // Per-operator connection to an external calendar. Used by:
  //   1. bookingPages.computeSlots — exclude slots that conflict with
  //      existing events in the operator's calendar
  //   2. bookingPages.book — write the new booking back to the
  //      operator's calendar so it shows up everywhere they look
  //   3. The cron sync — poll the provider every 5 min to keep our
  //      cached events fresh (Phase 3 slice 2)
  calendarConnections: defineTable({
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    provider: v.union(
      v.literal("google"),
      v.literal("microsoft"),
      v.literal("caldav"),
    ),
    accountEmail: v.string(),
    // OAuth tokens (encrypted-at-rest by Convex). Never round-trip to
    // the client. The refresh token outlives access tokens; we use it
    // to mint a new access token when the current one expires.
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    // Scopes granted, comma-separated. We don't currently downgrade
    // gracefully if a customer revokes a scope mid-flight; we just
    // surface the failure on next sync attempt.
    scopes: v.optional(v.string()),
    // Provider-specific calendar ID we read/write. Defaults to the
    // operator's primary calendar.
    calendarId: v.optional(v.string()),
    // For CalDAV: connection URL + username (auth uses an app
    // password stored in accessToken).
    caldavUrl: v.optional(v.string()),
    lastSyncedAt: v.optional(v.number()),
    lastSyncError: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_operator", ["operatorId"])
    .index("by_workspace", ["workspaceId"]),

  // Cached events from the operator's connected calendar. Refreshed
  // every 5 min by the cron in convex/calendarSync.ts. We only cache
  // the fields slot-exclusion needs (startsAt + endsAt + busy state)
  // — no event titles or attendees, so an operator's private calendar
  // contents never leak into PraxTalk's storage.
  calendarEvents: defineTable({
    connectionId: v.id("calendarConnections"),
    operatorId: v.id("operators"),
    externalId: v.string(),
    startsAt: v.number(),
    endsAt: v.number(),
    busy: v.boolean(), // false = "free" / transparent events; ignored when computing conflicts
  })
    .index("by_operator_starts_at", ["operatorId", "startsAt"])
    .index("by_connection", ["connectionId"])
    .index("by_external", ["connectionId", "externalId"]),

  // OAuth state — short-lived rows used to verify the callback isn't
  // a CSRF attempt and to remember which operator initiated the flow.
  // Self-cleaning: the callback deletes its own row on success.
  calendarOauthStates: defineTable({
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    provider: v.union(v.literal("google"), v.literal("microsoft")),
    state: v.string(), // random nonce
    // SHA-256(bindingNonce). The binding nonce is set as an httpOnly
    // cookie on praxtalk.com when the operator clicks Connect, and
    // re-presented on callback. Without the cookie, an attacker who
    // observes only the URL `state` parameter cannot complete the
    // flow. Optional for backwards compat with the legacy convex.site
    // callback path which doesn't have access to the cookie.
    bindingNonceHash: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_state", ["state"]),

  // ── Active voice calls (live UI overlay) ───────────────────────────
  // One row per call from initiation through completion. Drives the
  // floating "Call in progress" overlay that shows hangup + status.
  // Status updates land via the provider's status webhook
  // (/api/inbound/voice-status) and via the originateCall action.
  activeCalls: defineTable({
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    conversationId: v.id("conversations"),
    visitorId: v.id("visitors"),
    fromPhone: v.string(),
    toPhone: v.string(),
    provider: v.union(
      v.literal("callhippo"),
      v.literal("telecmi"),
      v.literal("twilio"),
    ),
    externalCallId: v.string(),
    status: v.union(
      v.literal("initiating"),
      v.literal("ringing"),
      v.literal("in_progress"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  })
    .index("by_operator_status", ["operatorId", "status"])
    .index("by_external_id", ["externalCallId"]),

  // ── Per-integration grants (sharing) ───────────────────────────────
  // Operator A grants operator B access to their personal voice /
  // email / whatsapp integration. Admins/owners always have implicit
  // full access (handled in code, not via grant rows). One row per
  // (integrationType, owner, grantee).
  integrationGrants: defineTable({
    workspaceId: v.id("workspaces"),
    integrationType: v.union(
      v.literal("voice"),
      v.literal("email"),
      v.literal("whatsapp"),
    ),
    integrationOwnerOperatorId: v.id("operators"),
    grantedToOperatorId: v.id("operators"),
    scope: v.union(v.literal("read"), v.literal("write")),
    grantedByOperatorId: v.id("operators"),
    grantedAt: v.number(),
  })
    .index("by_owner_type", ["integrationOwnerOperatorId", "integrationType"])
    .index("by_grantee_type", ["grantedToOperatorId", "integrationType"])
    .index("by_owner_grantee_type", [
      "integrationOwnerOperatorId",
      "grantedToOperatorId",
      "integrationType",
    ]),

  // ── Browser push subscriptions ─────────────────────────────────────
  // One row per (operator, browser) combination. The same operator on
  // their laptop + phone gets two rows. Endpoint is the unique key —
  // the push service URL where we POST encrypted payloads.
  pushSubscriptions: defineTable({
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    userAgent: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_operator", ["operatorId"])
    .index("by_endpoint", ["endpoint"]),

  // ── Reminders ──────────────────────────────────────────────────────
  // Operator (or Atlas) schedules a reminder tied to a conversation.
  // Cron `reminders.dispatchDue` fires at sendAt → routes to the
  // chosen channel (reuses email/SMS integrations; chat just drops a
  // system message). One row per scheduled reminder; no compaction
  // until status moves to "sent" or "cancelled".
  reminders: defineTable({
    workspaceId: v.id("workspaces"),
    // brandId/conversationId/visitorId are optional now: manual
    // reminders ("ping the operator at 3pm to follow up") aren't
    // tied to a conversation. The mutation requires one OR the
    // other depending on channel.
    brandId: v.optional(v.id("brands")),
    conversationId: v.optional(v.id("conversations")),
    visitorId: v.optional(v.id("visitors")),
    channel: v.union(
      v.literal("chat"),
      v.literal("email"),
      v.literal("sms"),
      v.literal("whatsapp"),
      v.literal("voice"),
      // Personal reminder for the scheduling operator — fires as a
      // browser push notification + stays in the reminders list. No
      // visitor-facing dispatch.
      v.literal("internal"),
    ),
    sendAt: v.number(),
    body: v.string(),
    // For WhatsApp outside the 24h customer-service-window — must
    // reference an approved template name. Unused for other channels.
    whatsappTemplateName: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    scheduledByOperatorId: v.optional(v.id("operators")), // null = scheduled by Atlas
    scheduledAt: v.number(),
    sentAt: v.optional(v.number()),
    error: v.optional(v.string()),
    // Operator-only free-text notes ("circle back about pricing",
    // "follow up after demo"). Never sent to the visitor; surfaces in
    // the dashboard reminder + schedule views only.
    remarks: v.optional(v.string()),
    // Optional contact context — for personal reminders that are
    // about a specific person who isn't in the visitors table yet
    // ("call back John Smith at +91…"). Pure metadata; not used for
    // dispatch routing, just shown alongside the reminder in the UI.
    // contactPhone stores the full E.164-style string entered by the
    // operator (country code + digits, e.g. "+919876543210").
    contactName: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
  })
    .index("by_status_send_at", ["status", "sendAt"])
    .index("by_workspace_send_at", ["workspaceId", "sendAt"])
    .index("by_conversation", ["conversationId"]),

  // ── Message drafts ─────────────────────────────────────────────────
  // Operator-scoped — each operator has their own draft per
  // conversation. Autosaved as they type in the composer; deleted on
  // send. Surfaces in the Drafts folder of the dedicated emails view.
  messageDrafts: defineTable({
    workspaceId: v.id("workspaces"),
    conversationId: v.id("conversations"),
    operatorId: v.id("operators"),
    body: v.string(),
    isInternal: v.boolean(), // internal note vs. customer-visible reply
    updatedAt: v.number(),
  })
    .index("by_operator_updated", ["operatorId", "updatedAt"])
    .index("by_conversation_operator", ["conversationId", "operatorId"]),

  // ── Booking pages (Calendly-clone) ─────────────────────────────────
  // Public scheduling page at /book/<slug>. Visitor picks a slot, we
  // create a booking + a conversation + auto-schedule reminders via
  // the Phase 1 reminders table.
  bookingPages: defineTable({
    workspaceId: v.id("workspaces"),
    brandId: v.id("brands"),
    // The primary operator the booking page belongs to. Slot
    // availability is computed against this operator + every entry in
    // additionalOwnerOperatorIds (round-robin); a slot is open if any
    // owner is free, and the booking is auto-assigned to the first
    // available one.
    ownerOperatorId: v.id("operators"),
    additionalOwnerOperatorIds: v.optional(v.array(v.id("operators"))),
    slug: v.string(), // public — appears in /book/<slug>
    title: v.string(), // "30-min intro call"
    description: v.optional(v.string()),
    durationMin: v.number(), // 15 / 30 / 60 etc.
    bufferMin: v.optional(v.number()), // gap between back-to-back slots
    // Weekly availability — array of 7 (Sunday..Saturday). Each day
    // has zero or more open windows in operator-local minutes-since-
    // midnight (e.g. {start:540, end:1020} = 9am-5pm).
    weekly: v.array(
      v.object({
        windows: v.array(
          v.object({ startMin: v.number(), endMin: v.number() }),
        ),
      }),
    ),
    // Date-specific overrides — wins over weekly availability for that
    // single day. `windows: []` blocks the day entirely (vacation /
    // holiday). YYYY-MM-DD keys in the booking page's tz.
    dateOverrides: v.optional(
      v.array(
        v.object({
          date: v.string(),
          windows: v.array(
            v.object({ startMin: v.number(), endMin: v.number() }),
          ),
        }),
      ),
    ),
    timezone: v.string(), // IANA, e.g. "Asia/Kolkata"
    // Channels to send the booking confirmation + reminders on.
    confirmChannel: v.union(
      v.literal("email"),
      v.literal("sms"),
      v.literal("whatsapp"),
    ),
    reminderOffsetMin: v.array(v.number()), // negative offsets, e.g. [-1440, -60]
    enabled: v.boolean(),
    // ── Approval gating (optional) ──────────────────────────────────
    // When requiresApproval is on, visitor bookings land in
    // status="pending_approval" and the listed approvers must
    // accept/decline before the visitor gets a confirmation +
    // calendar invite + reminders. approvalMode picks first-to-
    // approve vs unanimous; approvalTimeoutHours auto-declines
    // anything still pending after the deadline.
    requiresApproval: v.optional(v.boolean()),
    approvalMode: v.optional(v.union(v.literal("any"), v.literal("all"))),
    approvalOperatorIds: v.optional(v.array(v.id("operators"))),
    approvalTimeoutHours: v.optional(v.number()),
    // Phase 2: send a "still waiting on you" escalation to all
    // pending approvers after this many hours. Cron checks every
    // 15 minutes; default 4 hours when set, off when unset/0.
    approvalEscalateAfterHours: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_workspace", ["workspaceId"])
    .index("by_owner_operator", ["ownerOperatorId"]),

  bookings: defineTable({
    workspaceId: v.id("workspaces"),
    brandId: v.id("brands"),
    bookingPageId: v.id("bookingPages"),
    ownerOperatorId: v.id("operators"),
    // For multi-attendee booking pages: the other operators who were
    // free at this slot and should also receive the calendar invite
    // + see the booking on their calendar. Set at create time.
    additionalAttendeeOperatorIds: v.optional(v.array(v.id("operators"))),
    visitorId: v.id("visitors"),
    conversationId: v.id("conversations"),
    startsAt: v.number(),
    endsAt: v.number(),
    status: v.union(
      v.literal("pending"),
      v.literal("pending_approval"), // approval-gated, awaiting approver decision
      v.literal("confirmed"),
      v.literal("cancelled"),
      v.literal("declined"), // approvers refused, or auto-declined on timeout
      v.literal("no_show"),
    ),
    visitorEmail: v.optional(v.string()),
    visitorPhone: v.optional(v.string()),
    notes: v.optional(v.string()), // visitor-supplied at booking time
    // Operator-only remarks added after the booking — separate from
    // visitor notes so the operator can add reminders/context that
    // the visitor never sees.
    remarks: v.optional(v.string()),
    // Set after a successful write-back to the owner's connected
    // calendar — used by the cancel flow to delete the event from
    // their calendar too. (Primary owner only — additional attendees
    // each get their own event row written separately and aren't
    // tracked individually since cancel cascades via bookingId.)
    calendarConnectionId: v.optional(v.id("calendarConnections")),
    calendarEventExternalId: v.optional(v.string()),
    // Approval-gating bookkeeping. Mode/timeout are snapshotted from
    // the bookingPage at create-time so editing the page later
    // doesn't change in-flight bookings.
    approvalMode: v.optional(v.union(v.literal("any"), v.literal("all"))),
    approvalDeadlineAt: v.optional(v.number()),
    finalizedAt: v.optional(v.number()), // when status flipped from pending_approval
    declineReason: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_owner_starts_at", ["ownerOperatorId", "startsAt"])
    .index("by_booking_page_starts_at", ["bookingPageId", "startsAt"])
    .index("by_workspace_starts_at", ["workspaceId", "startsAt"])
    .index("by_workspace_status", ["workspaceId", "status"]),

  // One row per (booking, approver). Created when an approval-gated
  // booking is placed; updated when each approver responds.
  // approvalMode on the booking decides whether one "approved" is
  // enough or whether every row must be approved.
  bookingApprovals: defineTable({
    bookingId: v.id("bookings"),
    workspaceId: v.id("workspaces"),
    approverOperatorId: v.id("operators"),
    decision: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("declined"),
    ),
    note: v.optional(v.string()),
    respondedAt: v.optional(v.number()),
    // Phase 2 — escalation timestamp. The escalation cron sets this
    // the first time it pushes a "still waiting on you" notification
    // for a pending approver row, so the cron is idempotent on
    // subsequent passes (we don't spam the same approver every 15min).
    escalatedAt: v.optional(v.number()),
    // Phase 2 — delegation. When an approver delegates, we mark the
    // original row "delegated" and create a fresh pending row for the
    // recipient. Audit trail stays attached to the booking via
    // by_booking index.
    delegatedToOperatorId: v.optional(v.id("operators")),
    delegatedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_booking", ["bookingId"])
    .index("by_approver_pending", ["approverOperatorId", "decision"])
    // Cron escalation scan — find all pending approvals across the
    // workspace efficiently without a full table scan.
    .index("by_decision_created", ["decision", "createdAt"]),

  // ── REST API rate limiting ─────────────────────────────────────────
  // One row per IP. Tracks the current 60-second window's request
  // count. When the window rolls over the existing row is patched
  // back to count=1 with the new windowStart — bounded to one row
  // per active client IP, no cleanup needed.
  apiRateLimits: defineTable({
    ip: v.string(),
    windowStart: v.number(),
    count: v.number(),
  }).index("by_ip", ["ip"]),

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

  // ── Activity notifications ────────────────────────────────────────
  // General-purpose notification feed, distinct from chat unread state.
  // Producers: lead created, webhook permanent-failure, email permanent-
  // failure, Atlas error, brand created, operator added, etc. Surfaced
  // in the Topbar bell + dedicated /app/notifications page.
  notifications: defineTable({
    workspaceId: v.id("workspaces"),
    // null = visible to every operator. Set to a specific operator for
    // targeted notifications (e.g. "you were assigned this conversation").
    operatorId: v.optional(v.id("operators")),
    kind: v.union(
      v.literal("lead_created"),
      v.literal("conversation_assigned"),
      v.literal("webhook_failed"),
      v.literal("email_failed"),
      v.literal("atlas_error"),
      v.literal("brand_created"),
      v.literal("operator_added"),
      v.literal("api_key_created"),
      v.literal("human_requested"),
      v.literal("mention"),
      v.literal("system"),
    ),
    severity: v.union(
      v.literal("info"),
      v.literal("success"),
      v.literal("warn"),
      v.literal("error"),
    ),
    title: v.string(),
    body: v.optional(v.string()),
    link: v.optional(v.string()), // dashboard URL to open on click
    readAt: v.optional(v.number()), // workspace-wide; first operator to read marks for all
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_workspace_unread", ["workspaceId", "readAt"]),

  // ── Leads ──────────────────────────────────────────────────────────
  // A "lead" is a saved snapshot of a visitor + their conversation context,
  // promoted by an operator from the inbox. Used as a lightweight CRM —
  // the team can follow up later without losing the visitor's details.
  leads: defineTable({
    workspaceId: v.id("workspaces"),
    brandId: v.id("brands"),
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
    // Optional pipeline assignee — typically a sales / CX rep who's
    // working the lead. Owners + admins can pick anyone; agents can
    // only assign to themselves (enforced server-side).
    assignedToOperatorId: v.optional(v.id("operators")),
    assignedAt: v.optional(v.number()),
    assignedByOperatorId: v.optional(v.id("operators")),
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
    .index("by_conversation", ["conversationId"])
    .index("by_workspace_assignee_updated", [
      "workspaceId",
      "assignedToOperatorId",
      "updatedAt",
    ])
    // Cross-workspace lookup for the platform-admin /admin/leads page —
    // walks newest-first by status without scanning every workspace's
    // leads. Without this index the admin query was a full table scan
    // with a filter predicate.
    .index("by_status_updated", ["status", "updatedAt"]),

  // ── Lead remarks (thread of notes per lead) ─────────────────────────
  // Each agent who works a lead can add their own remark. Older flat
  // `leads.notes` stays around as a legacy single-string fallback for
  // pre-thread leads; new entries always go here.
  leadRemarks: defineTable({
    workspaceId: v.id("workspaces"),
    leadId: v.id("leads"),
    operatorId: v.id("operators"),
    body: v.string(),
    createdAt: v.number(),
    // Set when the original author edits their own remark; staff
    // (owner/admin) edits also stamp `editedByOperatorId`.
    updatedAt: v.optional(v.number()),
    editedByOperatorId: v.optional(v.id("operators")),
  })
    .index("by_lead_created", ["leadId", "createdAt"])
    .index("by_workspace_created", ["workspaceId", "createdAt"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    workspaceId: v.id("workspaces"), // denormalized for tenant scoping
    // Denormalized for inbox row filtering.
    brandId: v.id("brands"),
    // Channel inherited from the parent conversation, denormalized so
    // analytics queries can filter without a join. Required as of the
    // Phase 2 narrow on 2026-04-29.
    channel: v.union(
      v.literal("web_chat"),
      v.literal("email"),
      v.literal("whatsapp"),
      v.literal("voice"),
      v.literal("sms"),
    ),
    role: v.union(
      v.literal("visitor"),
      v.literal("operator"),
      v.literal("atlas"),
      v.literal("system"),
      // Internal team note — only operators with brand access can see
      // these. Filtered out of the visitor-side stream and never sent
      // via email/whatsapp/voice. Used for "@karan can you take this?"
      // style coordination on a conversation.
      v.literal("internal_note"),
    ),
    senderOperatorId: v.optional(v.id("operators")),
    // Free-text sender name shown to the visitor in the widget. Set
    // when an external caller (e.g. the Prax CRM External Conversations
    // tab) sends an operator reply via the REST API and wants the
    // visitor to see a specific person's name (typically the agent's
    // alias) without provisioning a PraxTalk operators row.
    // Internal/native-operator messages set senderOperatorId instead;
    // the widget query prefers senderDisplayName when present.
    senderDisplayName: v.optional(v.string()),
    body: v.string(),
    // Email-specific metadata. Used to thread inbound replies and to
    // build outbound Message-IDs.
    emailMessageId: v.optional(v.string()),
    emailInReplyTo: v.optional(v.string()),
    emailSubject: v.optional(v.string()),
    // Optional outbound attachments. Today populated only by the
    // booking flow (ICS calendar invites). The email outbound
    // dispatchers know how to attach these; SMS/voice ignore them.
    attachments: v.optional(
      v.array(
        v.object({
          filename: v.string(),
          contentBase64: v.string(),
          mimeType: v.string(),
        }),
      ),
    ),
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
    // Optional Voyage AI key. When set, the KB is chunked + embedded
    // on save and the evaluate action retrieves top-K relevant chunks
    // per query (RAG). When unset, falls back to plain-text injection.
    voyageApiKey: v.optional(v.string()),
    // Bumped each time the KB is re-embedded. Lets us drop stale
    // chunks from prior versions in a single index scan.
    knowledgeBaseVersion: v.optional(v.number()),
    // ── Website-crawl ingest ─────────────────────────────────────────
    // When set, the KB was assembled by crawling kbSourceUrl. The
    // status fields let the dashboard render a progress card and the
    // "last crawled" timestamp so admins know how stale the KB is.
    kbSourceUrl: v.optional(v.string()),
    kbIngestStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
      ),
    ),
    kbIngestStartedAt: v.optional(v.number()),
    kbIngestCompletedAt: v.optional(v.number()),
    kbIngestPagesFetched: v.optional(v.number()),
    kbIngestError: v.optional(v.string()),
    autoReplyThreshold: v.number(), // 0..1 — below this, draft only
    maxTokens: v.number(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // Atlas knowledge-base chunks — text + embedding pairs produced by
  // the re-embed action when a workspace has Voyage AI configured.
  // Cosine similarity is computed in JS (Convex doesn't yet have a
  // native vector index); fine up to a few thousand chunks per
  // workspace. For larger KBs migrate to @convex-dev/vector.
  atlasKnowledgeChunks: defineTable({
    workspaceId: v.id("workspaces"),
    sourceVersion: v.number(), // matches atlasConfigs.knowledgeBaseVersion
    chunkIndex: v.number(),
    chunkText: v.string(),
    embedding: v.array(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_version", ["workspaceId", "sourceVersion"]),

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
      v.literal("skipped_quota_exceeded"),
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

  // ── Saved replies ──────────────────────────────────────────────────
  // Operator boilerplate. Optionally brand-scoped (visible only on a
  // particular brand's conversations) or global to the workspace.
  savedReplies: defineTable({
    workspaceId: v.id("workspaces"),
    brandId: v.optional(v.id("brands")), // null = workspace-global
    title: v.string(), // shown in the picker, e.g. "Refund kicked off"
    body: v.string(), // text inserted into the composer
    shortcut: v.optional(v.string()), // e.g. "/refund"
    createdBy: v.id("operators"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_brand", ["workspaceId", "brandId"])
    .index("by_workspace_shortcut", ["workspaceId", "shortcut"]),

  // ── WhatsApp integration ──────────────────────────────────────────
  // Per-workspace WhatsApp Business config (Meta Cloud API). Drives
  // outbound sends and inbound webhook routing. The verifyToken is what
  // we check against Meta's webhook handshake (?hub.verify_token=...).
  whatsappIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    // Owner of this number. Null = workspace-shared (everyone sees
    // inbound here, anyone can send from it). Set = personal channel,
    // owned by one operator — inbound auto-assigns to them, outbound
    // from this operator routes through this row.
    operatorId: v.optional(v.id("operators")),
    // Meta Cloud API identifiers (visible in business.facebook.com).
    phoneNumberId: v.string(), // numeric phone number ID
    businessAccountId: v.optional(v.string()), // WABA ID
    displayPhoneNumber: v.optional(v.string()), // E.164, for UI display
    // Auth: long-lived access token for the Meta Graph API.
    accessToken: v.string(),
    verifyToken: v.string(),
    enabled: v.boolean(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_operator", ["workspaceId", "operatorId"])
    .index("by_phone_number_id", ["phoneNumberId"]),

  // WhatsApp templates registered with Meta. Templates must be
  // approved on the Meta side first (Business Manager → Message
  // Templates). We just store the name + language + body text +
  // variable count so operators can compose them from the inbox.
  // The actual approved content lives on Meta — body here is just
  // for preview and variable counting.
  whatsappTemplates: defineTable({
    workspaceId: v.id("workspaces"),
    name: v.string(), // exact name registered with Meta
    language: v.string(), // BCP-47 like "en", "en_US", "hi"
    category: v.optional(v.string()), // marketing | utility | authentication
    body: v.string(), // body with {{1}} {{2}} placeholders, for preview
    variableCount: v.number(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),

  // ── Voice integration (CallHippo) ─────────────────────────────────
  // Per-workspace voice/telephony config. Drives inbound call events
  // (CallHippo posts to our webhook → we create voice-channel
  // conversations) and outbound click-to-call (operator clicks a
  // number → we hit CallHippo's originate endpoint).
  voiceIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    // Owner of this number. Null = workspace-shared (every operator can
    // dial out / receive). Set = personal channel — inbound auto-
    // assigns to the owner, dial pad uses this row when *that* operator
    // dials. Acme can give Sarah her own Twilio number this way.
    operatorId: v.optional(v.id("operators")),
    provider: v.union(
      v.literal("callhippo"),
      v.literal("telecmi"),
      v.literal("twilio"),
    ),
    //   CallHippo : apiKey = account email,    apiToken = API token
    //   TeleCMI   : apiKey = appid,            apiToken = secret
    //   Twilio    : apiKey = Account SID,      apiToken = Auth Token
    apiKey: v.string(),
    apiToken: v.string(),
    defaultNumber: v.optional(v.string()),
    webhookSecret: v.string(),
    enabled: v.boolean(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_operator", ["workspaceId", "operatorId"])
    .index("by_webhook_secret", ["webhookSecret"]),

  // ── Email integration ─────────────────────────────────────────────
  // Per-workspace email provider config. Drives both inbound parsing
  // (which workspace owns mail to a given inbox alias) and outbound
  // sending (which API key + from address to use).
  emailIntegrations: defineTable({
    workspaceId: v.id("workspaces"),
    // Owner of this email channel. Null = workspace-shared. Set =
    // personal — sarah@inbound.praxtalk.com goes only to Sarah's inbox
    // and her replies use her API key + from-address.
    operatorId: v.optional(v.id("operators")),
    provider: v.union(
      v.literal("postmark"),
      v.literal("sendgrid"),
      v.literal("resend"),
      // Generic SMTP+IMAP — for Zoho Workspace, G-Suite (with app
      // password), Fastmail, Proton, etc. Customer pastes their host +
      // creds; PraxTalk talks IMAP for inbound (polled) and SMTP for
      // outbound, no forwarding workaround needed.
      v.literal("smtp_imap"),
    ),
    // For postmark/sendgrid/resend: ESP API key.
    // For smtp_imap: the SMTP password (an app-specific password,
    //   typically — providers don't accept account passwords for SMTP
    //   when 2FA is on). Same value usually works for IMAP, but if
    //   the customer needs different ones we add imapPassword later.
    apiKey: v.string(),
    fromAddress: v.string(), // e.g. "support@acme.com"
    fromName: v.optional(v.string()),
    // For smtp_imap: connection details. Unused for the ESP providers.
    smtpHost: v.optional(v.string()), // e.g. "smtp.zoho.com"
    smtpPort: v.optional(v.number()), // 465 (SSL) or 587 (STARTTLS)
    smtpUser: v.optional(v.string()), // usually = fromAddress
    imapHost: v.optional(v.string()), // e.g. "imap.zoho.com"
    imapPort: v.optional(v.number()), // 993 (SSL) standard
    // Highest IMAP UID we've already pulled. The poll cron only fetches
    // messages with UID > this. Not used by ESP providers.
    imapLastSeenUid: v.optional(v.number()),
    // The local-part for inbound when using postmark/sendgrid/resend.
    // For smtp_imap this is unused — we poll the customer's actual
    // inbox directly, no PraxTalk-side alias.
    inboundAlias: v.string(),
    enabled: v.boolean(),
    createdBy: v.id("operators"),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_operator", ["workspaceId", "operatorId"])
    .index("by_inbound_alias", ["inboundAlias"]),

  // Replay-protection ledger for inbound provider webhooks. We insert
  // a row keyed by `${provider}:${eventId}` the first time we see an
  // event; if the row already exists the handler exits idempotently.
  // A nightly cron prunes anything older than 30 days so this table
  // doesn't grow unbounded.
  processedWebhooks: defineTable({
    key: v.string(), // e.g. "razorpay:evt_NXR…" or "paypal:WH-…"
    receivedAt: v.number(),
  }).index("by_key", ["key"]),

  // Audit trail of privileged operator actions — role changes, brand-
  // access changes, deletes. Populated by the relevant mutations,
  // never deleted (operators table grows forever; this is intentional
  // for forensics).
  auditLogs: defineTable({
    workspaceId: v.id("workspaces"),
    performedByOperatorId: v.id("operators"),
    action: v.string(), // e.g. "operator.role_changed", "operator.brand_access_changed", "operator.removed"
    targetOperatorId: v.optional(v.id("operators")),
    summary: v.string(),
    payload: v.optional(v.string()), // JSON-encoded before/after diff
    createdAt: v.number(),
  })
    .index("by_workspace_created", ["workspaceId", "createdAt"])
    .index("by_target_operator", ["targetOperatorId"]),

  // ── Marketing pricing (Level 1 editable) ──────────────────────────
  // Overrides for the public /pricing page + homepage Pricing block.
  // One row per planKey ("spark" | "team" | "scale" | "enterprise").
  // Missing row = use the hardcoded default in components/marketing/
  // Pricing.tsx. Operators edit via /app/settings/pricing (owner/admin
  // only). Display only — actual billing prices are set when plans
  // are minted via setup-paypal-plans.mjs / setup-razorpay-plans.mjs
  // and are price-locked at subscription-create time. Updating a
  // displayed price here does NOT change what existing or new
  // subscribers are charged on either provider.
  marketingPricing: defineTable({
    planKey: v.union(
      v.literal("spark"),
      v.literal("team"),
      v.literal("scale"),
      v.literal("enterprise"),
    ),
    name: v.optional(v.string()),
    price: v.optional(v.string()),
    priceSub: v.optional(v.string()),
    lede: v.optional(v.string()),
    features: v.optional(v.array(v.string())),
    ctaLabel: v.optional(v.string()),
    ctaHref: v.optional(v.string()),
    ribbon: v.optional(v.string()),
    updatedAt: v.number(),
    updatedByOperatorId: v.optional(v.id("operators")),
  }).index("by_plan_key", ["planKey"]),

  // ── Live visitor presence (monitoring) ─────────────────────────
  // One row per (brand, browser). The widget pings every ~20s while
  // the page is visible; a visitor is "active" when lastSeenAt is
  // recent. Sessions are inferred: a ping after a 30-minute gap
  // starts a new session (visitCount++, pageViews reset). Rows idle
  // for 7 days are purged by cron. Powers GET /api/v1/presence for
  // CRM "live visitors" views.
  visitorPresence: defineTable({
    workspaceId: v.id("workspaces"),
    brandId: v.id("brands"),
    visitorKey: v.string(),
    currentUrl: v.string(),
    pageTitle: v.optional(v.string()),
    referrer: v.optional(v.string()),
    landingUrl: v.optional(v.string()),
    ip: v.optional(v.string()),
    location: v.optional(v.string()),
    countryCode: v.optional(v.string()),
    userAgent: v.optional(v.string()),
    // False while the visitor's tab is backgrounded — drives the
    // Active vs Idle split in monitoring UIs. Unset (old widget
    // versions) counts as visible.
    tabVisible: v.optional(v.boolean()),
    sessionStartedAt: v.number(),
    lastSeenAt: v.number(),
    pageViews: v.number(),
    visitCount: v.number(),
  })
    .index("by_brand_visitor", ["brandId", "visitorKey"])
    .index("by_workspace_lastseen", ["workspaceId", "lastSeenAt"])
    .index("by_lastseen", ["lastSeenAt"]),
});

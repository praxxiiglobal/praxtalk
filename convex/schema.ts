import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * PraxTalk schema — multi-tenant from day one.
 * Every table that holds workspace-owned data carries `workspaceId`
 * and is queried via an index that starts with it.
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
    // Public id used in <script src="cdn.praxtalk.com/widget.js"
    //                         data-workspace-id="ws_xxx"></script>
    widgetId: v.string(),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_widget_id", ["widgetId"]),

  widgetConfigs: defineTable({
    workspaceId: v.id("workspaces"),
    primaryColor: v.string(),
    welcomeMessage: v.string(),
    position: v.union(v.literal("br"), v.literal("bl")),
    avatarUrl: v.optional(v.string()),
    businessHours: v.optional(v.string()),
  }).index("by_workspace", ["workspaceId"]),

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
    visitorKey: v.string(), // anonymous cookie / fingerprint
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    customData: v.optional(v.string()), // JSON blob (plan, MRR, etc.)
    firstSeenAt: v.number(),
    lastSeenAt: v.number(),
  }).index("by_workspace_visitor_key", ["workspaceId", "visitorKey"]),

  // ── Conversations + messages ──────────────────────────────────────
  conversations: defineTable({
    workspaceId: v.id("workspaces"),
    visitorId: v.id("visitors"),
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
    lastMessageAt: v.number(),
    createdAt: v.number(),
  })
    .index("by_workspace_status_lastmsg", [
      "workspaceId",
      "status",
      "lastMessageAt",
    ])
    .index("by_workspace_visitor", ["workspaceId", "visitorId"]),

  messages: defineTable({
    conversationId: v.id("conversations"),
    workspaceId: v.id("workspaces"), // denormalized for tenant scoping
    role: v.union(
      v.literal("visitor"),
      v.literal("operator"),
      v.literal("atlas"),
      v.literal("system"),
    ),
    senderOperatorId: v.optional(v.id("operators")),
    body: v.string(),
    createdAt: v.number(),
  }).index("by_conversation_created", ["conversationId", "createdAt"]),
});

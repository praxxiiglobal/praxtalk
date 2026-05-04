import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

/**
 * Shared export helpers used by both the platform-admin export
 * (`/admin/workspaces/[id]/export.json`) and the customer self-serve
 * export (`/app/export.json`). The ONLY thing that differs between
 * those two callers is the auth check — the data shape, redactions,
 * and table walk are identical.
 */

export const REDACTED = "***REDACTED***" as const;

export function redactOperator(op: Doc<"operators">) {
  const { passwordHash, ...rest } = op;
  void passwordHash;
  return { ...rest, passwordHash: REDACTED };
}

export function redactInvite(inv: Doc<"operatorInvites">) {
  const { tokenHash, ...rest } = inv;
  void tokenHash;
  return { ...rest, tokenHash: REDACTED };
}

export function redactApiKey(k: Doc<"apiKeys">) {
  const { keyHash, ...rest } = k;
  void keyHash;
  return { ...rest, keyHash: REDACTED };
}

export function redactWebhookSub(w: Doc<"webhookSubscriptions">) {
  const { secret, ...rest } = w;
  void secret;
  return { ...rest, secret: REDACTED };
}

export function redactCalendarConn(c: Doc<"calendarConnections">) {
  const { accessToken, refreshToken, ...rest } = c;
  void accessToken;
  void refreshToken;
  return { ...rest, accessToken: REDACTED, refreshToken: REDACTED };
}

export function redactAtlasConfig(a: Doc<"atlasConfigs">) {
  const { apiKey, ...rest } = a;
  void apiKey;
  return { ...rest, apiKey: REDACTED };
}

export function redactWhatsapp(w: Doc<"whatsappIntegrations">) {
  const { accessToken, ...rest } = w;
  void accessToken;
  return { ...rest, accessToken: REDACTED };
}

export function redactVoice(v: Doc<"voiceIntegrations">) {
  const { apiKey, apiToken, webhookSecret, ...rest } = v;
  void apiKey;
  void apiToken;
  void webhookSecret;
  return {
    ...rest,
    apiKey: REDACTED,
    apiToken: REDACTED,
    webhookSecret: REDACTED,
  };
}

export function redactEmail(e: Doc<"emailIntegrations">) {
  const { apiKey, ...rest } = e;
  void apiKey;
  return { ...rest, apiKey: REDACTED };
}

type ExportTable =
  | "brands"
  | "operators"
  | "operatorInvites"
  | "visitors"
  | "conversations"
  | "apiKeys"
  | "calendarConnections"
  | "calendarEvents"
  | "activeCalls"
  | "integrationGrants"
  | "pushSubscriptions"
  | "reminders"
  | "messageDrafts"
  | "bookingPages"
  | "bookings"
  | "bookingApprovals"
  | "webhookSubscriptions"
  | "notifications"
  | "leads"
  | "atlasConfigs"
  | "atlasKnowledgeChunks"
  | "atlasRuns"
  | "lobbyConfigs"
  | "intakeResponses"
  | "savedReplies"
  | "whatsappIntegrations"
  | "whatsappTemplates"
  | "voiceIntegrations"
  | "emailIntegrations"
  | "auditLogs";

export async function collectByWorkspace<T extends ExportTable>(
  ctx: QueryCtx,
  table: T,
  workspaceId: Id<"workspaces">,
): Promise<Doc<T>[]> {
  // Cast bypasses TS narrowing — every listed table really does have
  // a workspaceId of Id<"workspaces"> at runtime.
  const rows = await ctx.db
    .query(table)
    .filter((q) =>
      q.eq(q.field("workspaceId"), workspaceId as unknown as never),
    )
    .collect();
  return rows;
}

/**
 * Pull every workspace-scoped table into one JSON-serialisable
 * object, secrets redacted. Messages are NOT included here — they
 * can run into the millions per workspace and would blow Convex's
 * 8MB single-query response cap; the calling route handler
 * paginates messages separately.
 *
 * Throws if the workspace doesn't exist (caller should validate
 * auth first so a customer never gets a "not found" leak).
 */
export async function buildWorkspaceCoreExport(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  source: "platform_admin" | "workspace_owner",
) {
  const workspace = await ctx.db.get(workspaceId);
  if (!workspace) throw new Error("Workspace not found.");

  const [
    brands,
    operators,
    operatorInvites,
    visitors,
    conversations,
    apiKeys,
    calendarConnections,
    calendarEvents,
    activeCalls,
    integrationGrants,
    pushSubscriptions,
    reminders,
    messageDrafts,
    bookingPages,
    bookings,
    bookingApprovals,
    webhookSubscriptions,
    notifications,
    leads,
    atlasConfigs,
    atlasKnowledgeChunks,
    atlasRuns,
    lobbyConfigs,
    intakeResponses,
    savedReplies,
    whatsappIntegrations,
    whatsappTemplates,
    voiceIntegrations,
    emailIntegrations,
    auditLogs,
  ] = await Promise.all([
    collectByWorkspace(ctx, "brands", workspaceId),
    collectByWorkspace(ctx, "operators", workspaceId),
    collectByWorkspace(ctx, "operatorInvites", workspaceId),
    collectByWorkspace(ctx, "visitors", workspaceId),
    collectByWorkspace(ctx, "conversations", workspaceId),
    collectByWorkspace(ctx, "apiKeys", workspaceId),
    collectByWorkspace(ctx, "calendarConnections", workspaceId),
    collectByWorkspace(ctx, "calendarEvents", workspaceId),
    collectByWorkspace(ctx, "activeCalls", workspaceId),
    collectByWorkspace(ctx, "integrationGrants", workspaceId),
    collectByWorkspace(ctx, "pushSubscriptions", workspaceId),
    collectByWorkspace(ctx, "reminders", workspaceId),
    collectByWorkspace(ctx, "messageDrafts", workspaceId),
    collectByWorkspace(ctx, "bookingPages", workspaceId),
    collectByWorkspace(ctx, "bookings", workspaceId),
    collectByWorkspace(ctx, "bookingApprovals", workspaceId),
    collectByWorkspace(ctx, "webhookSubscriptions", workspaceId),
    collectByWorkspace(ctx, "notifications", workspaceId),
    collectByWorkspace(ctx, "leads", workspaceId),
    collectByWorkspace(ctx, "atlasConfigs", workspaceId),
    collectByWorkspace(ctx, "atlasKnowledgeChunks", workspaceId),
    collectByWorkspace(ctx, "atlasRuns", workspaceId),
    collectByWorkspace(ctx, "lobbyConfigs", workspaceId),
    collectByWorkspace(ctx, "intakeResponses", workspaceId),
    collectByWorkspace(ctx, "savedReplies", workspaceId),
    collectByWorkspace(ctx, "whatsappIntegrations", workspaceId),
    collectByWorkspace(ctx, "whatsappTemplates", workspaceId),
    collectByWorkspace(ctx, "voiceIntegrations", workspaceId),
    collectByWorkspace(ctx, "emailIntegrations", workspaceId),
    collectByWorkspace(ctx, "auditLogs", workspaceId),
  ]);

  return {
    meta: {
      exportedAt: new Date().toISOString(),
      workspaceId,
      workspaceSlug: workspace.slug,
      workspaceName: workspace.name,
      format: "praxtalk-workspace-export@v1",
      source,
      notes:
        "Sensitive fields (password hashes, OAuth tokens, API keys, " +
        "webhook secrets, session tokens) are redacted as ***REDACTED***. " +
        "Sessions + password reset tokens are excluded entirely. " +
        "Messages are streamed separately by the route handler.",
    },
    workspace,
    brands,
    operators: operators.map(redactOperator),
    operatorInvites: operatorInvites.map(redactInvite),
    visitors,
    conversations,
    apiKeys: apiKeys.map(redactApiKey),
    calendarConnections: calendarConnections.map(redactCalendarConn),
    calendarEvents,
    activeCalls,
    integrationGrants,
    pushSubscriptions,
    reminders,
    messageDrafts,
    bookingPages,
    bookings,
    bookingApprovals,
    webhookSubscriptions: webhookSubscriptions.map(redactWebhookSub),
    notifications,
    leads,
    atlasConfigs: atlasConfigs.map(redactAtlasConfig),
    atlasKnowledgeChunks,
    atlasRuns,
    lobbyConfigs,
    intakeResponses,
    savedReplies,
    whatsappIntegrations: whatsappIntegrations.map(redactWhatsapp),
    whatsappTemplates,
    voiceIntegrations: voiceIntegrations.map(redactVoice),
    emailIntegrations: emailIntegrations.map(redactEmail),
    auditLogs,
  };
}

/**
 * Page through a workspace's messages, sorted newest first, using
 * `_creationTime` as the cursor. Returns up to `pageSize` messages
 * (clamped 1..5000) and the next cursor (null when exhausted).
 */
export async function buildMessagesPage(
  ctx: QueryCtx,
  workspaceId: Id<"workspaces">,
  cursor: number | null,
  pageSize: number,
) {
  const limit = Math.min(Math.max(pageSize, 1), 5000);
  let q = ctx.db
    .query("messages")
    .filter((q) => q.eq(q.field("workspaceId"), workspaceId));
  if (cursor !== null) {
    q = q.filter((q) => q.lt(q.field("_creationTime"), cursor));
  }
  const messages = await q.order("desc").take(limit);
  const nextCursor =
    messages.length === limit
      ? messages[messages.length - 1]._creationTime
      : null;
  return { messages, nextCursor, done: nextCursor === null };
}

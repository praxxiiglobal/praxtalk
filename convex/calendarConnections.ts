import { v } from "convex/values";
import { ConvexError } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";

const providerValidator = v.union(
  v.literal("google"),
  v.literal("microsoft"),
  v.literal("caldav"),
);

const oauthProviderValidator = v.union(
  v.literal("google"),
  v.literal("microsoft"),
);

// ── Public surfaces ───────────────────────────────────────────────────

/**
 * Connections for the current operator. Drives the "Calendars" panel
 * in /app/settings.
 */
export const listMine = query({
  args: { sessionToken: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("calendarConnections"),
      provider: providerValidator,
      accountEmail: v.string(),
      calendarId: v.union(v.string(), v.null()),
      lastSyncedAt: v.union(v.number(), v.null()),
      lastSyncError: v.union(v.string(), v.null()),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const all = await ctx.db
      .query("calendarConnections")
      .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
      .collect();
    return all.map((c) => ({
      _id: c._id,
      provider: c.provider,
      accountEmail: c.accountEmail,
      calendarId: c.calendarId ?? null,
      lastSyncedAt: c.lastSyncedAt ?? null,
      lastSyncError: c.lastSyncError ?? null,
      createdAt: c.createdAt,
    }));
  },
});

/**
 * Returns whether each OAuth provider is configured (env vars set).
 * Lets the UI render "Not configured" instead of broken Connect
 * buttons before the admin sets the workspace's OAuth credentials.
 */
export const providerConfig = query({
  args: { sessionToken: v.string() },
  returns: v.object({
    googleConfigured: v.boolean(),
    microsoftConfigured: v.boolean(),
  }),
  handler: async (ctx, args) => {
    await requireOperator(ctx, args.sessionToken);
    return {
      googleConfigured: Boolean(
        process.env.GOOGLE_OAUTH_CLIENT_ID &&
          process.env.GOOGLE_OAUTH_CLIENT_SECRET,
      ),
      microsoftConfigured: Boolean(
        process.env.MICROSOFT_OAUTH_CLIENT_ID &&
          process.env.MICROSOFT_OAUTH_CLIENT_SECRET,
      ),
    };
  },
});

/**
 * Start the OAuth dance — returns the provider's authorize URL with
 * a state nonce we'll verify on callback. The browser navigates to
 * this URL; provider redirects back to /api/oauth/calendar/<provider>/callback
 * with a code we exchange in the http handler.
 */
export const startOauth = action({
  args: { sessionToken: v.string(), provider: oauthProviderValidator },
  returns: v.object({ url: v.string() }),
  handler: async (ctx, args): Promise<{ url: string }> => {
    const ctxData: {
      workspaceId: Id<"workspaces">;
      operatorId: Id<"operators">;
    } = await ctx.runQuery(internal.calendarConnections._loadOperator, {
      sessionToken: args.sessionToken,
    });

    let clientId: string | undefined;
    let scope: string;
    let authorizeBase: string;
    if (args.provider === "google") {
      clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      scope = "https://www.googleapis.com/auth/calendar.events email profile";
      authorizeBase = "https://accounts.google.com/o/oauth2/v2/auth";
    } else {
      clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
      scope = "Calendars.ReadWrite User.Read offline_access";
      authorizeBase =
        "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
    }
    if (!clientId) {
      throw new ConvexError(
        `${args.provider} OAuth isn't configured on this deployment.`,
      );
    }

    const state = randomState();
    await ctx.runMutation(internal.calendarConnections._stashOauthState, {
      workspaceId: ctxData.workspaceId,
      operatorId: ctxData.operatorId,
      provider: args.provider,
      state,
    });

    const redirectUri = redirectUriFor(args.provider);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
      access_type: "offline", // Google: returns a refresh_token
      prompt: "consent",
    });
    return { url: `${authorizeBase}?${params.toString()}` };
  },
});

export const disconnect = mutation({
  args: { sessionToken: v.string(), connectionId: v.id("calendarConnections") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator } = await requireOperator(ctx, args.sessionToken);
    const c = await ctx.db.get(args.connectionId);
    if (!c) return null;
    const isAdmin =
      operator.role === "owner" || operator.role === "admin";
    if (c.operatorId !== operator._id && !isAdmin) {
      throw new ConvexError("Not your calendar connection.");
    }
    await ctx.db.delete(args.connectionId);
    return null;
  },
});

// ── Internal plumbing ─────────────────────────────────────────────────

export const _loadOperator = internalQuery({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    return { operatorId: operator._id, workspaceId };
  },
});

export const _stashOauthState = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    provider: oauthProviderValidator,
    state: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("calendarOauthStates", {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      provider: args.provider,
      state: args.state,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Look up the pending OAuth state — used by the callback handler to
 * verify the state nonce + recover which operator/workspace started
 * the flow. Returns null if state is missing or older than 10 min.
 */
export const _consumeOauthState = internalMutation({
  args: { state: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      operatorId: v.id("operators"),
      provider: oauthProviderValidator,
    }),
  ),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("calendarOauthStates")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();
    if (!row) return null;
    // 10-min TTL — anything older is treated as expired.
    const fresh = Date.now() - row.createdAt < 10 * 60 * 1000;
    await ctx.db.delete(row._id);
    if (!fresh) return null;
    return {
      workspaceId: row.workspaceId,
      operatorId: row.operatorId,
      provider: row.provider,
    };
  },
});

/**
 * Persist a successful OAuth connection. Called by the http callback
 * handler after exchanging the auth code for tokens. Idempotent on
 * (operatorId, provider) — re-connecting overwrites the existing row.
 */
export const _upsertConnection = internalMutation({
  args: {
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    provider: providerValidator,
    accountEmail: v.string(),
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    tokenExpiresAt: v.optional(v.number()),
    scopes: v.optional(v.string()),
    calendarId: v.optional(v.string()),
    caldavUrl: v.optional(v.string()),
  },
  returns: v.id("calendarConnections"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("calendarConnections")
      .withIndex("by_operator", (q) => q.eq("operatorId", args.operatorId))
      .filter((q) => q.eq(q.field("provider"), args.provider))
      .first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        accountEmail: args.accountEmail,
        accessToken: args.accessToken,
        refreshToken: args.refreshToken ?? existing.refreshToken,
        tokenExpiresAt: args.tokenExpiresAt,
        scopes: args.scopes,
        calendarId: args.calendarId ?? existing.calendarId,
        caldavUrl: args.caldavUrl ?? existing.caldavUrl,
        lastSyncedAt: undefined,
        lastSyncError: undefined,
      });
      return existing._id;
    }
    return await ctx.db.insert("calendarConnections", {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      provider: args.provider,
      accountEmail: args.accountEmail,
      accessToken: args.accessToken,
      refreshToken: args.refreshToken,
      tokenExpiresAt: args.tokenExpiresAt,
      scopes: args.scopes,
      calendarId: args.calendarId,
      caldavUrl: args.caldavUrl,
      createdAt: now,
    });
  },
});

// ── Helpers (also used by the http callback handler) ──────────────────

export function redirectUriFor(provider: "google" | "microsoft"): string {
  // Convex http actions live at <deployment>.convex.site. We pin the
  // redirect URI to the prod deployment via env so OAuth registrations
  // don't need to change between dev and prod (and so dev can test
  // with the prod redirect via local tunneling).
  const base =
    process.env.PRAXTALK_OAUTH_REDIRECT_BASE ??
    "https://industrious-moose-892.convex.site";
  return `${base}/api/oauth/calendar/${provider}/callback`;
}

function randomState(): string {
  // 24 bytes of entropy → 32-char base64-ish string. Plenty for CSRF.
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

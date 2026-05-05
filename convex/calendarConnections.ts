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
 * Start the OAuth dance — returns the provider's authorize URL plus
 * a binding nonce. The Next.js server action that calls this sets
 * the binding nonce as an httpOnly `__Host-praxtalk_oauth_binding`
 * cookie before the browser navigates to the OAuth URL. On callback
 * we re-present the cookie value and verify it hashes to what we
 * stashed here.
 *
 * The legacy `useFinalize: false` branch (which routed to the
 * convex.site callback that couldn't read the binding cookie) is
 * gone now that the convex.site http handler was deleted. The arg
 * is kept for one deploy cycle so a stale client bundle calling
 * with the old shape doesn't break — value is ignored.
 */
export const startOauth = action({
  args: {
    sessionToken: v.string(),
    provider: oauthProviderValidator,
    useFinalize: v.optional(v.boolean()),
  },
  returns: v.object({
    url: v.string(),
    bindingNonce: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ url: string; bindingNonce: string }> => {
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
    const bindingNonce = randomState();
    const bindingNonceHash = await sha256Hex(bindingNonce);
    await ctx.runMutation(internal.calendarConnections._stashOauthState, {
      workspaceId: ctxData.workspaceId,
      operatorId: ctxData.operatorId,
      provider: args.provider,
      state,
      bindingNonceHash,
    });

    // useFinalize is ignored — every flow finalises through
    // praxtalk.com now. See doc comment above.
    void args.useFinalize;
    const redirectUri = finalizeRedirectUriFor(args.provider);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope,
      state,
      access_type: "offline", // Google: returns a refresh_token
      prompt: "consent",
    });
    return {
      url: `${authorizeBase}?${params.toString()}`,
      bindingNonce,
    };
  },
});

/**
 * Praxtalk.com-side finalize: consumes state + bindingNonce, exchanges
 * the OAuth code for tokens, and writes the calendarConnection row
 * — all atomically gated on the binding cookie matching the stashed
 * hash. Called by the Next.js route handler that owns the binding
 * cookie.
 */
export const finalizeOauthCallback = action({
  args: {
    state: v.string(),
    code: v.string(),
    bindingNonce: v.string(),
    provider: oauthProviderValidator,
  },
  returns: v.object({
    ok: v.boolean(),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ ok: boolean; error?: string }> => {
    const bindingNonceHash = await sha256Hex(args.bindingNonce);
    const consumed: {
      workspaceId: Id<"workspaces">;
      operatorId: Id<"operators">;
      provider: "google" | "microsoft";
    } | null = await ctx.runMutation(
      internal.calendarConnections._consumeOauthStateBound,
      { state: args.state, bindingNonceHash },
    );
    if (!consumed) return { ok: false, error: "Invalid or expired state" };
    if (consumed.provider !== args.provider) {
      return { ok: false, error: "Provider mismatch" };
    }

    let clientId: string | undefined;
    let clientSecret: string | undefined;
    let tokenUrl: string;
    let userInfoUrl: string;
    if (args.provider === "google") {
      clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      tokenUrl = "https://oauth2.googleapis.com/token";
      userInfoUrl = "https://www.googleapis.com/oauth2/v2/userinfo";
    } else {
      clientId = process.env.MICROSOFT_OAUTH_CLIENT_ID;
      clientSecret = process.env.MICROSOFT_OAUTH_CLIENT_SECRET;
      tokenUrl =
        "https://login.microsoftonline.com/common/oauth2/v2.0/token";
      userInfoUrl = "https://graph.microsoft.com/v1.0/me";
    }
    if (!clientId || !clientSecret) {
      return { ok: false, error: "OAuth not configured" };
    }

    const redirectUri = finalizeRedirectUriFor(args.provider);
    const tokenForm = new URLSearchParams({
      code: args.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });
    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenForm.toString(),
    });
    if (!tokenRes.ok) {
      return { ok: false, error: `Token exchange ${tokenRes.status}` };
    }
    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    let accountEmail = "";
    try {
      const userRes = await fetch(userInfoUrl, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      if (userRes.ok) {
        const u = (await userRes.json()) as {
          email?: string;
          mail?: string;
          userPrincipalName?: string;
        };
        accountEmail = u.email ?? u.mail ?? u.userPrincipalName ?? "";
      }
    } catch {
      // Non-fatal — operator can re-connect to refresh the email.
    }

    await ctx.runMutation(
      internal.calendarConnections._upsertConnection,
      {
        workspaceId: consumed.workspaceId,
        operatorId: consumed.operatorId,
        provider: args.provider,
        accountEmail,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokens.expires_in
          ? Date.now() + tokens.expires_in * 1000
          : undefined,
        scopes: tokens.scope,
      },
    );
    return { ok: true };
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
    bindingNonceHash: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("calendarOauthStates", {
      workspaceId: args.workspaceId,
      operatorId: args.operatorId,
      provider: args.provider,
      state: args.state,
      bindingNonceHash: args.bindingNonceHash,
      createdAt: Date.now(),
    });
    return null;
  },
});

/**
 * Bound consume — used by the praxtalk.com finalize flow. Refuses
 * unless the row's bindingNonceHash matches the supplied value (so
 * the attacker who only has the URL state can't complete the flow).
 */
export const _consumeOauthStateBound = internalMutation({
  args: { state: v.string(), bindingNonceHash: v.string() },
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
    const fresh = Date.now() - row.createdAt < 3 * 60 * 1000;
    await ctx.db.delete(row._id);
    if (!fresh) return null;
    // Refuse if the row was created without a binding (legacy path
    // can't use this entry point) or if the hashes differ.
    if (!row.bindingNonceHash) return null;
    if (
      !timingSafeEqualHex(row.bindingNonceHash, args.bindingNonceHash)
    ) {
      return null;
    }
    return {
      workspaceId: row.workspaceId,
      operatorId: row.operatorId,
      provider: row.provider,
    };
  },
});

// _consumeOauthState (unbound consume — used by the legacy convex.site
// callback) was removed alongside the http handler. The bound variant
// _consumeOauthStateBound below is the only consume entrypoint now;
// every callback path goes through the binding-cookie handshake.

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

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * praxtalk.com-side callback URI used by the binding-cookie flow.
 * Operator clicks Connect → server action sets binding cookie + sends
 * browser to provider → provider redirects here → Next.js route
 * handler reads cookie + finalizes via Convex action.
 *
 * REGISTER THIS URI in Google Cloud Console + Azure AD before the
 * deploy lands or new connect attempts will fail with redirect_uri
 * mismatch. Old convex.site URIs can stay registered alongside.
 */
export function finalizeRedirectUriFor(
  provider: "google" | "microsoft",
): string {
  const base =
    process.env.PRAXTALK_DASHBOARD_BASE ?? "https://www.praxtalk.com";
  return `${base}/api/oauth/calendar/${provider}/callback`;
}

function randomState(): string {
  // 24 bytes of entropy → 48-char hex string. Plenty for CSRF + binding.
  const arr = new Uint8Array(24);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const buf = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

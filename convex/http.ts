import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import * as paypal from "./lib/paypal";

/**
 * REST API for headless integrations. Customers who don't want to use
 * the PraxTalk dashboard can hit these endpoints from their own CRM.
 *
 * Auth: `Authorization: Bearer ptk_live_<secret>`
 *
 * Endpoints (all under /api/v1/):
 *   GET    /conversations            list inbox, ?status=open|... &brandId=...
 *   GET    /conversations/:id        single conversation + visitor + brand
 *   POST   /conversations/:id/messages   { body: "..." } operator reply
 *   PATCH  /conversations/:id        { status: "resolved" | ... }
 *   GET    /messages?conversationId=...
 *   GET    /leads                    ?status=new|... &brandId=...
 *   POST   /leads                    create
 *   PATCH  /leads/:id                update + status changes
 *   GET    /brands                   list workspace brands
 */

const http = httpRouter();

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "Authorization, Content-Type",
  "access-control-max-age": "86400",
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}

function clientIp(req: Request): string {
  // Convex sits behind a proxy; the originating IP is in
  // X-Forwarded-For (first entry of the comma-separated list).
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

async function checkRateLimit(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  req: Request,
): Promise<Response | null> {
  const ip = clientIp(req);
  const result = await ctx.runMutation(internal.rateLimits._checkAndRecord, {
    ip,
  });
  if (result.allowed) return null;
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded. Try again in a moment.",
      retryAfterSeconds: result.retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(result.retryAfterSeconds ?? 60),
        ...CORS_HEADERS,
      },
    },
  );
}

async function authenticate(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  req: Request,
): Promise<
  | {
      workspaceId: Id<"workspaces">;
      scope: "read" | "write";
      brandId: Id<"brands"> | null;
    }
  | { error: Response }
> {
  // Rate limit before auth so brute-force attempts get 429'd just like
  // legitimate over-quota requests do.
  const rateLimited = await checkRateLimit(ctx, req);
  if (rateLimited) return { error: rateLimited };

  const auth = req.headers.get("authorization") ?? "";
  const match = auth.match(/^Bearer (ptk_live_[a-f0-9]+)$/i);
  if (!match) {
    return {
      error: errorResponse(
        401,
        "Missing or malformed Authorization header. Use 'Bearer ptk_live_…'.",
      ),
    };
  }
  const result = await ctx.runQuery(internal.apiKeys.verifyKey, {
    secret: match[1],
  });
  if (!result) {
    return { error: errorResponse(401, "Invalid or revoked API key.") };
  }
  return {
    workspaceId: result.workspaceId,
    scope: result.scope,
    brandId: result.brandId,
  };
}

/**
 * If the API key is brand-scoped and the caller passed an explicit
 * `brandId` query/body param, force them to match. Otherwise, fall
 * back to the key's brand. Returns the effective brandId to filter on,
 * or null for "no filter" (only possible with a workspace-scope key).
 */
function resolveBrandFilter(
  auth: { brandId: Id<"brands"> | null },
  requested: string | null | undefined,
): { ok: true; brandId: Id<"brands"> | null } | { ok: false; response: Response } {
  if (auth.brandId) {
    if (requested && requested !== String(auth.brandId)) {
      return {
        ok: false,
        response: errorResponse(
          403,
          "API key is brand-scoped — cannot query other brands.",
        ),
      };
    }
    return { ok: true, brandId: auth.brandId };
  }
  return {
    ok: true,
    brandId: requested ? (requested as Id<"brands">) : null,
  };
}

/**
 * Verify a brand-scoped API key matches a target conversation/lead by id.
 * Used on per-resource endpoints (POST messages, PATCH status, etc.) so
 * brand-scoped keys can't act on other brands' resources.
 */
async function ensureBrandAccessOnResource(
  ctx: Parameters<Parameters<typeof httpAction>[0]>[0],
  auth: { brandId: Id<"brands"> | null; workspaceId: Id<"workspaces"> },
  resourceBrandId: Id<"brands"> | null | undefined,
): Promise<Response | null> {
  if (!auth.brandId) return null; // workspace-scoped keys see everything
  if (!resourceBrandId || String(resourceBrandId) !== String(auth.brandId)) {
    return errorResponse(
      403,
      "API key is brand-scoped — resource belongs to a different brand.",
    );
  }
  return null;
}

function requireWriteScope(scope: "read" | "write"): Response | null {
  if (scope !== "write") {
    return errorResponse(403, "API key has read-only scope.");
  }
  return null;
}

// CORS preflight catch-all
http.route({
  pathPrefix: "/api/v1/",
  method: "OPTIONS",
  handler: httpAction(async () => {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }),
});

// ── GET /api/v1/brands ────────────────────────────────────────────────
http.route({
  path: "/api/v1/brands",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const brands = await ctx.runQuery(internal.publicApi.listBrands, {
      workspaceId: auth.workspaceId,
    });
    return jsonResponse({ brands });
  }),
});

// ── GET /api/v1/conversations ─────────────────────────────────────────
http.route({
  path: "/api/v1/conversations",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const filter = resolveBrandFilter(auth, url.searchParams.get("brandId"));
    if (!filter.ok) return filter.response;
    const limit = Number(url.searchParams.get("limit") ?? "50");

    const conversations = await ctx.runQuery(
      internal.publicApi.listConversations,
      {
        workspaceId: auth.workspaceId,
        status: status as "open" | "snoozed" | "resolved" | "closed" | null,
        brandId: filter.brandId,
        limit: Math.min(Math.max(1, limit), 200),
      },
    );
    return jsonResponse({ conversations });
  }),
});

// ── GET /api/v1/conversations/:id ─────────────────────────────────────
http.route({
  pathPrefix: "/api/v1/conversations/",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // /api/v1/conversations/:id
    if (segments.length !== 4) {
      return errorResponse(404, "Not found.");
    }
    const id = segments[3] as Id<"conversations">;
    const convo = await ctx.runQuery(internal.publicApi.getConversation, {
      workspaceId: auth.workspaceId,
      conversationId: id,
    });
    if (!convo) return errorResponse(404, "Conversation not found.");
    const denied = await ensureBrandAccessOnResource(
      ctx,
      auth,
      convo.brandId ?? null,
    );
    if (denied) return denied;
    return jsonResponse({ conversation: convo });
  }),
});

// ── POST /api/v1/conversations/:id/messages ──────────────────────────
http.route({
  pathPrefix: "/api/v1/conversations/",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const denied = requireWriteScope(auth.scope);
    if (denied) return denied;

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    // /api/v1/conversations/:id/messages
    if (segments.length !== 5 || segments[4] !== "messages") {
      return errorResponse(404, "Not found.");
    }
    const conversationId = segments[3] as Id<"conversations">;

    let body: { body?: unknown };
    try {
      body = (await req.json()) as { body?: unknown };
    } catch {
      return errorResponse(400, "Invalid JSON body.");
    }
    if (typeof body.body !== "string" || !body.body.trim()) {
      return errorResponse(400, "Field `body` is required.");
    }

    if (auth.brandId) {
      const convo = await ctx.runQuery(internal.publicApi.getConversation, {
        workspaceId: auth.workspaceId,
        conversationId,
      });
      const denied = await ensureBrandAccessOnResource(
        ctx,
        auth,
        convo?.brandId ?? null,
      );
      if (denied) return denied;
    }

    try {
      const messageId = await ctx.runMutation(
        internal.publicApi.sendOperatorMessage,
        {
          workspaceId: auth.workspaceId,
          conversationId,
          body: body.body,
        },
      );
      return jsonResponse({ messageId }, 201);
    } catch (err) {
      return errorResponse(
        400,
        err instanceof Error ? err.message : "Send failed.",
      );
    }
  }),
});

// ── PATCH /api/v1/conversations/:id (status) ─────────────────────────
http.route({
  pathPrefix: "/api/v1/conversations/",
  method: "PATCH",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const denied = requireWriteScope(auth.scope);
    if (denied) return denied;

    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 4) return errorResponse(404, "Not found.");
    const conversationId = segments[3] as Id<"conversations">;

    let payload: { status?: unknown };
    try {
      payload = (await req.json()) as { status?: unknown };
    } catch {
      return errorResponse(400, "Invalid JSON body.");
    }
    const status = payload.status;
    if (
      status !== "open" &&
      status !== "snoozed" &&
      status !== "resolved" &&
      status !== "closed"
    ) {
      return errorResponse(
        400,
        "Field `status` must be one of: open, snoozed, resolved, closed.",
      );
    }

    if (auth.brandId) {
      const convo = await ctx.runQuery(internal.publicApi.getConversation, {
        workspaceId: auth.workspaceId,
        conversationId,
      });
      const denied = await ensureBrandAccessOnResource(
        ctx,
        auth,
        convo?.brandId ?? null,
      );
      if (denied) return denied;
    }

    try {
      await ctx.runMutation(internal.publicApi.setConversationStatus, {
        workspaceId: auth.workspaceId,
        conversationId,
        status,
      });
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse(
        400,
        err instanceof Error ? err.message : "Update failed.",
      );
    }
  }),
});

// ── GET /api/v1/messages?conversationId=… ─────────────────────────────
http.route({
  path: "/api/v1/messages",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const url = new URL(req.url);
    const conversationId = url.searchParams.get("conversationId");
    if (!conversationId) {
      return errorResponse(400, "Query param `conversationId` is required.");
    }
    const messages = await ctx.runQuery(internal.publicApi.listMessages, {
      workspaceId: auth.workspaceId,
      conversationId: conversationId as Id<"conversations">,
    });
    return jsonResponse({ messages });
  }),
});

// ── GET /api/v1/leads ────────────────────────────────────────────────
http.route({
  path: "/api/v1/leads",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const filter = resolveBrandFilter(auth, url.searchParams.get("brandId"));
    if (!filter.ok) return filter.response;
    const leads = await ctx.runQuery(internal.publicApi.listLeads, {
      workspaceId: auth.workspaceId,
      status: status as
        | "new"
        | "contacted"
        | "qualified"
        | "won"
        | "lost"
        | null,
      brandId: filter.brandId,
    });
    return jsonResponse({ leads });
  }),
});

// ── POST /api/v1/leads ───────────────────────────────────────────────
http.route({
  path: "/api/v1/leads",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const denied = requireWriteScope(auth.scope);
    if (denied) return denied;

    let body: {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      notes?: unknown;
      brandId?: unknown;
      status?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON body.");
    }
    if (typeof body.name !== "string" || !body.name.trim()) {
      return errorResponse(400, "Field `name` is required.");
    }

    // Brand scoping: if the key is brand-scoped, force the lead's brand
    // to match. Reject explicit cross-brand attempts.
    let leadBrandId: Id<"brands"> | undefined;
    if (auth.brandId) {
      if (
        typeof body.brandId === "string" &&
        body.brandId !== String(auth.brandId)
      ) {
        return errorResponse(
          403,
          "API key is brand-scoped — cannot create leads for other brands.",
        );
      }
      leadBrandId = auth.brandId;
    } else if (typeof body.brandId === "string") {
      leadBrandId = body.brandId as Id<"brands">;
    }

    try {
      const leadId = await ctx.runMutation(internal.publicApi.createLead, {
        workspaceId: auth.workspaceId,
        name: body.name,
        email: typeof body.email === "string" ? body.email : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        brandId: leadBrandId,
        status:
          body.status === "new" ||
          body.status === "contacted" ||
          body.status === "qualified" ||
          body.status === "won" ||
          body.status === "lost"
            ? body.status
            : undefined,
      });
      return jsonResponse({ leadId }, 201);
    } catch (err) {
      return errorResponse(
        400,
        err instanceof Error ? err.message : "Create failed.",
      );
    }
  }),
});

// ── PATCH /api/v1/leads/:id ──────────────────────────────────────────
http.route({
  pathPrefix: "/api/v1/leads/",
  method: "PATCH",
  handler: httpAction(async (ctx, req) => {
    const auth = await authenticate(ctx, req);
    if ("error" in auth) return auth.error;
    const denied = requireWriteScope(auth.scope);
    if (denied) return denied;
    const url = new URL(req.url);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 4) return errorResponse(404, "Not found.");
    const leadId = segments[3] as Id<"leads">;

    let body: {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      notes?: unknown;
      status?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON body.");
    }

    try {
      await ctx.runMutation(internal.publicApi.updateLead, {
        workspaceId: auth.workspaceId,
        leadId,
        name: typeof body.name === "string" ? body.name : undefined,
        email: typeof body.email === "string" ? body.email : undefined,
        phone: typeof body.phone === "string" ? body.phone : undefined,
        notes: typeof body.notes === "string" ? body.notes : undefined,
        status:
          body.status === "new" ||
          body.status === "contacted" ||
          body.status === "qualified" ||
          body.status === "won" ||
          body.status === "lost"
            ? body.status
            : undefined,
      });
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse(
        400,
        err instanceof Error ? err.message : "Update failed.",
      );
    }
  }),
});

// ── Inbound email ────────────────────────────────────────────────────
//
// POST /api/inbound/email
//
// Public endpoint that ESPs (Postmark, SendGrid, Resend) POST to. We
// detect the payload shape, normalise it, look up the workspace by the
// recipient address (local-part = `inboundAlias`), and persist the
// message. Returns 200 on success so the ESP doesn't retry — anything
// else means we couldn't route it.
//
// Set this URL in your provider's inbound config:
//   https://<deployment>.convex.site/api/inbound/email

http.route({
  path: "/api/inbound/email",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON.");
    }
    const parsed = normaliseInboundEmail(raw);
    if (!parsed) {
      return errorResponse(400, "Unrecognised inbound payload.");
    }

    const workspace = await ctx.runQuery(
      internal.emailIntegrations.findByRecipient,
      { recipient: parsed.toEmail },
    );
    if (!workspace) {
      // Silent 200 so the ESP doesn't keep retrying mail to addresses
      // we don't own. Operators won't see anything because there's no
      // workspace to route it to.
      return jsonResponse({ ok: true, dropped: "unknown recipient" });
    }

    try {
      const result = await ctx.runMutation(
        internal.emailIntegrations.recordInboundEmail,
        {
          workspaceId: workspace.workspaceId,
          fromEmail: parsed.fromEmail,
          fromName: parsed.fromName,
          subject: parsed.subject,
          body: parsed.body,
          messageId: parsed.messageId,
          inReplyTo: parsed.inReplyTo,
          references: parsed.references,
        },
      );
      return jsonResponse({ ok: true, ...result }, 200);
    } catch (err) {
      return errorResponse(
        500,
        err instanceof Error ? err.message : "Failed to record email.",
      );
    }
  }),
});

// ── WhatsApp inbound (Meta Cloud API) ────────────────────────────────
//
// GET  /api/inbound/whatsapp — webhook verification handshake.
//   Meta calls with ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
//   We look up the integration by verify token; if it matches, echo the
//   challenge back as plain text. Otherwise return 403.
//
// POST /api/inbound/whatsapp — message events.
//   Meta posts a `entry[].changes[].value.messages[]` payload. We
//   resolve the workspace by the metadata.phone_number_id, then persist
//   each text message.
//
// Set this URL in Meta App Dashboard → WhatsApp → Configuration →
// Webhooks → Callback URL:
//   https://<deployment>.convex.site/api/inbound/whatsapp

http.route({
  path: "/api/inbound/whatsapp",
  method: "GET",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode !== "subscribe" || !token || !challenge) {
      return errorResponse(400, "Bad verification request.");
    }
    // Try every WhatsApp integration whose verifyToken matches.
    // (Convex doesn't have a global query without a workspace context,
    // so we collect and match in JS — fine: there are very few rows.)
    const all = await ctx.runQuery(
      internal.whatsappIntegrations.findByVerifyToken,
      { verifyToken: token },
    );
    if (!all) return errorResponse(403, "Invalid verify token.");
    return new Response(challenge, {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  }),
});

http.route({
  path: "/api/inbound/whatsapp",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    let payload: unknown;
    try {
      payload = await req.json();
    } catch {
      return errorResponse(400, "Invalid JSON.");
    }

    // Meta payload shape:
    // { object: "whatsapp_business_account",
    //   entry: [{ changes: [{ value: {
    //     metadata: { phone_number_id, display_phone_number },
    //     contacts: [{ profile: { name }, wa_id }],
    //     messages: [{ from, id, timestamp, text: { body }, type }]
    //   }}]}]}
    const p = payload as {
      entry?: Array<{
        changes?: Array<{
          value?: {
            metadata?: { phone_number_id?: string };
            contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
            messages?: Array<{
              from?: string;
              id?: string;
              type?: string;
              text?: { body?: string };
            }>;
          };
        }>;
      }>;
    };

    for (const entry of p.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;
        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const integration = await ctx.runQuery(
          internal.whatsappIntegrations.findByPhoneNumberId,
          { phoneNumberId },
        );
        if (!integration) continue;
        const profileName = value.contacts?.[0]?.profile?.name;
        for (const msg of value.messages ?? []) {
          if (msg.type !== "text" || !msg.text?.body || !msg.from) continue;
          await ctx.runMutation(
            internal.whatsappIntegrations.recordInboundMessage,
            {
              workspaceId: integration.workspaceId,
              fromPhone: msg.from,
              fromName: profileName,
              body: msg.text.body,
              messageId: msg.id,
            },
          );
        }
      }
    }
    // Always 200 so Meta doesn't retry. Errors are logged server-side.
    return jsonResponse({ ok: true });
  }),
});

// ── Voice inbound (provider-dispatched webhook) ──────────────────────
//
// POST /api/inbound/voice?secret=<webhookSecret>
//
// The same URL handles every provider — we route by the secret, then
// dispatch to a provider-specific parser based on the integration's
// `provider` field. CallHippo + TeleCMI post JSON; Twilio posts
// form-urlencoded. Each provider names the same fields differently
// (CallSid vs callId, From vs caller, RecordingUrl vs recording_url).
//
// Customer pastes the URL above into:
//   CallHippo : Settings → Webhooks → Add Webhook
//   TeleCMI   : App → Webhooks → Call Status
//   Twilio    : Phone Numbers → <number> → Voice → Status Callback URL

type NormalisedCall = {
  fromPhone: string;
  fromName?: string;
  durationSec?: number;
  recordingUrl?: string;
  transcript?: string;
  callType: "inbound" | "outbound" | "missed" | "voicemail";
  externalCallId?: string;
};

http.route({
  path: "/api/inbound/voice",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    if (!secret) return errorResponse(400, "Missing secret.");

    const integration = await ctx.runQuery(
      internal.voiceIntegrations.findByWebhookSecret,
      { webhookSecret: secret },
    );
    if (!integration) return errorResponse(403, "Invalid secret.");

    // Provider-aware body parsing. Twilio posts form-urlencoded; the
    // others post JSON.
    const contentType = req.headers.get("content-type") ?? "";
    let normalised: NormalisedCall | null = null;
    try {
      if (integration.provider === "twilio") {
        const text = await req.text();
        const params = new URLSearchParams(text);
        normalised = parseTwilioCallback(params);
      } else if (contentType.includes("application/json")) {
        const json = await req.json();
        normalised =
          integration.provider === "telecmi"
            ? parseTeleCMICallback(json)
            : parseCallHippoCallback(json);
      } else {
        // Fallback: try JSON anyway.
        const json = await req.json();
        normalised = parseCallHippoCallback(json);
      }
    } catch {
      return errorResponse(400, "Couldn't parse webhook body.");
    }

    if (!normalised || !normalised.fromPhone) {
      return jsonResponse({ ok: true, dropped: "no caller number" });
    }

    try {
      await ctx.runMutation(
        internal.voiceIntegrations.recordInboundCall,
        {
          workspaceId: integration.workspaceId,
          ...normalised,
        },
      );
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse(
        500,
        err instanceof Error ? err.message : "Failed to record call.",
      );
    }
  }),
});

// ── Inbound SMS ───────────────────────────────────────────────────────
// Same secret-keyed entry pattern as voice. Each provider posts a
// different body shape; parsers below normalise to { fromPhone, body }.
type NormalisedSmsHttp = { fromPhone: string; body: string };

function parseTwilioSms(params: URLSearchParams): NormalisedSmsHttp | null {
  const fromPhone = params.get("From");
  const body = params.get("Body");
  if (!fromPhone || !body) return null;
  return { fromPhone, body };
}

function parseCallHippoSms(payload: unknown): NormalisedSmsHttp | null {
  const p = payload as { from?: string; sender?: string; message?: string; body?: string };
  const fromPhone = p.from ?? p.sender;
  const body = p.message ?? p.body;
  if (!fromPhone || !body) return null;
  return { fromPhone, body };
}

function parseTeleCMISms(payload: unknown): NormalisedSmsHttp | null {
  const p = payload as { from?: string; msg?: string; message?: string };
  if (!p.from) return null;
  const body = p.msg ?? p.message;
  if (!body) return null;
  return { fromPhone: p.from, body };
}

http.route({
  path: "/api/inbound/sms",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const url = new URL(req.url);
    const secret = url.searchParams.get("secret");
    if (!secret) return errorResponse(400, "Missing secret.");

    const integration = await ctx.runQuery(
      internal.voiceIntegrations.findByWebhookSecret,
      { webhookSecret: secret },
    );
    if (!integration) return errorResponse(403, "Invalid secret.");

    const contentType = req.headers.get("content-type") ?? "";
    let normalised: NormalisedSmsHttp | null = null;
    try {
      if (integration.provider === "twilio") {
        const text = await req.text();
        const params = new URLSearchParams(text);
        normalised = parseTwilioSms(params);
      } else if (contentType.includes("application/json")) {
        const json = await req.json();
        normalised =
          integration.provider === "telecmi"
            ? parseTeleCMISms(json)
            : parseCallHippoSms(json);
      } else {
        const json = await req.json();
        normalised = parseCallHippoSms(json);
      }
    } catch {
      return errorResponse(400, "Couldn't parse SMS webhook body.");
    }

    if (!normalised) {
      return jsonResponse({ ok: true, dropped: "incomplete payload" });
    }

    try {
      await ctx.runMutation(
        internal.voiceIntegrations.recordInboundSms,
        {
          workspaceId: integration.workspaceId,
          fromPhone: normalised.fromPhone,
          body: normalised.body,
        },
      );
      return jsonResponse({ ok: true });
    } catch (err) {
      return errorResponse(
        500,
        err instanceof Error ? err.message : "Failed to record SMS.",
      );
    }
  }),
});

function parseCallHippoCallback(payload: unknown): NormalisedCall | null {
  const p = payload as {
    callId?: string;
    from?: string;
    caller?: string;
    to?: string;
    callee?: string;
    direction?: string;
    duration?: number;
    status?: string;
    recordingUrl?: string;
    recording_url?: string;
    transcript?: string;
    callerName?: string;
  };
  const fromPhone =
    p.from ?? p.caller ?? (p.direction === "outgoing" ? p.to : p.callee);
  if (!fromPhone) return null;
  return {
    fromPhone,
    fromName: p.callerName,
    durationSec: p.duration,
    recordingUrl: p.recordingUrl ?? p.recording_url,
    transcript: p.transcript,
    callType:
      p.status === "voicemail"
        ? "voicemail"
        : p.status === "no-answer" || p.status === "missed"
          ? "missed"
          : p.direction === "outgoing"
            ? "outbound"
            : "inbound",
    externalCallId: p.callId,
  };
}

function parseTeleCMICallback(payload: unknown): NormalisedCall | null {
  const p = payload as {
    cmiid?: string;
    pcmid?: string;
    from?: string;
    to?: string;
    caller_id?: string;
    direction?: string; // "inbound" | "outbound"
    call_status?: string;
    status?: string;
    duration?: number;
    duration_sec?: number;
    recording_url?: string;
    rec_url?: string;
  };
  const fromPhone =
    p.from ?? p.caller_id ?? (p.direction === "outbound" ? p.to : undefined);
  if (!fromPhone) return null;
  const status = p.call_status ?? p.status ?? "";
  return {
    fromPhone,
    durationSec: p.duration_sec ?? p.duration,
    recordingUrl: p.recording_url ?? p.rec_url,
    callType:
      status === "voicemail"
        ? "voicemail"
        : status === "missed" || status === "no-answer"
          ? "missed"
          : p.direction === "outbound"
            ? "outbound"
            : "inbound",
    externalCallId: p.cmiid ?? p.pcmid,
  };
}

function parseTwilioCallback(params: URLSearchParams): NormalisedCall | null {
  const From = params.get("From");
  const To = params.get("To");
  const Direction = params.get("Direction"); // inbound | outbound-api | outbound-dial
  const CallStatus = params.get("CallStatus"); // completed | no-answer | busy | failed
  const isOutbound = (Direction ?? "").startsWith("outbound");
  const fromPhone = isOutbound ? To : From;
  if (!fromPhone) return null;
  const duration = params.get("CallDuration");
  return {
    fromPhone,
    fromName: params.get("CallerName") ?? undefined,
    durationSec: duration ? Number(duration) : undefined,
    recordingUrl: params.get("RecordingUrl") ?? undefined,
    callType:
      CallStatus === "no-answer" || CallStatus === "busy" || CallStatus === "failed"
        ? "missed"
        : isOutbound
          ? "outbound"
          : "inbound",
    externalCallId: params.get("CallSid") ?? undefined,
  };
}

// ── Health probe ─────────────────────────────────────────────────────
http.route({
  path: "/api/v1/ping",
  method: "GET",
  handler: httpAction(async (_ctx, _req) => {
    return jsonResponse({ ok: true, version: "v1" });
  }),
});

/**
 * Normalise the wide variety of inbound-email webhook payload shapes
 * into a single struct. We sniff each provider's tell — Postmark uses
 * `From` / `To` capitalised, SendGrid posts as multipart with an
 * `email` JSON field, Resend uses a generic flat shape. Anything we
 * don't recognise returns null.
 */
function normaliseInboundEmail(payload: unknown): {
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject?: string;
  body: string;
  messageId?: string;
  inReplyTo?: string;
  references?: string[];
} | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;

  // --- Postmark (https://postmarkapp.com/developer/user-guide/inbound)
  if (typeof p.From === "string" && typeof p.To === "string") {
    const headers = (p.Headers as { Name: string; Value: string }[]) ?? [];
    const findHeader = (name: string) =>
      headers.find((h) => h.Name.toLowerCase() === name.toLowerCase())?.Value;
    const refHeader = findHeader("References");
    return {
      fromEmail: extractEmail(p.From as string),
      fromName: extractName(p.From as string),
      toEmail: extractEmail(p.To as string),
      subject: typeof p.Subject === "string" ? p.Subject : undefined,
      body:
        (typeof p.TextBody === "string" && p.TextBody) ||
        (typeof p.HtmlBody === "string" ? stripHtml(p.HtmlBody) : ""),
      messageId: typeof p.MessageID === "string" ? p.MessageID : findHeader("Message-ID"),
      inReplyTo: findHeader("In-Reply-To"),
      references: refHeader
        ? refHeader
            .split(/\s+/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined,
    };
  }

  // --- Resend / generic flat shape: { from, to, subject, text, message_id, ... }
  if (typeof p.from === "string" && typeof p.to === "string") {
    return {
      fromEmail: extractEmail(p.from),
      fromName: extractName(p.from),
      toEmail: extractEmail(p.to),
      subject: typeof p.subject === "string" ? p.subject : undefined,
      body:
        (typeof p.text === "string" && p.text) ||
        (typeof p.html === "string" ? stripHtml(p.html) : ""),
      messageId:
        typeof p.message_id === "string"
          ? p.message_id
          : typeof p.messageId === "string"
            ? p.messageId
            : undefined,
      inReplyTo:
        typeof p.in_reply_to === "string"
          ? p.in_reply_to
          : typeof p.inReplyTo === "string"
            ? p.inReplyTo
            : undefined,
      references: Array.isArray(p.references)
        ? (p.references.filter((x) => typeof x === "string") as string[])
        : undefined,
    };
  }

  return null;
}

function extractEmail(s: string): string {
  // "Name <user@host>" → user@host. Plain "user@host" → user@host.
  const m = s.match(/<([^>]+)>/);
  return (m ? m[1] : s).trim().toLowerCase();
}
function extractName(s: string): string | undefined {
  const m = s.match(/^([^<]+?)\s*<[^>]+>$/);
  return m ? m[1].replace(/^"|"$/g, "").trim() : undefined;
}
function stripHtml(s: string): string {
  return s
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// ── PayPal billing webhook ────────────────────────────────────────────
// PayPal POSTs subscription-lifecycle events here. We verify the
// signature via PayPal's own verification API (avoids implementing the
// cert chain manually), then dispatch to billing._handleWebhookEvent
// which re-fetches the subscription and updates workspace state.
http.route({
  path: "/api/paypal/webhook",
  method: "POST",
  handler: httpAction(async (ctx, req) => {
    const rawBody = await req.text();

    const headers = {
      authAlgo: req.headers.get("paypal-auth-algo") ?? "",
      certUrl: req.headers.get("paypal-cert-url") ?? "",
      transmissionId: req.headers.get("paypal-transmission-id") ?? "",
      transmissionSig: req.headers.get("paypal-transmission-sig") ?? "",
      transmissionTime: req.headers.get("paypal-transmission-time") ?? "",
    };

    const verified = await paypal.verifyWebhookSignature({ headers, rawBody });
    if (!verified) {
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { "content-type": "application/json" },
      });
    }

    let evt: {
      event_type?: string;
      resource?: { id?: string; custom_id?: string };
    };
    try {
      evt = JSON.parse(rawBody);
    } catch {
      return new Response(JSON.stringify({ error: "bad json" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const subscriptionId = evt.resource?.id;
    const eventType = evt.event_type;
    if (!subscriptionId || !eventType) {
      // Not a subscription event we care about; ack so PayPal doesn't retry.
      return new Response(JSON.stringify({ ok: true, ignored: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    await ctx.runAction(internal.billing._handleWebhookEvent, {
      eventType,
      paypalSubscriptionId: subscriptionId,
      customId: evt.resource?.custom_id,
    });

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }),
});

export default http;

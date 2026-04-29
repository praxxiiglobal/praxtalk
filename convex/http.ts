import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

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

export default http;

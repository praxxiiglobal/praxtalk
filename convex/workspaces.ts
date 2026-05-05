import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { requireOperator } from "./auth";
import {
  generateSessionToken,
  generateSignupVerificationToken,
  generateWidgetId,
  hashPassword,
  hashToken,
  slugify,
} from "./lib/auth";
import {
  buildMessagesPage,
  buildWorkspaceCoreExport,
} from "./lib/workspaceExport";
import {
  platformEmailEnabled,
  sendPlatformEmail,
} from "./lib/platformEmail";
import { takeBucket } from "./rateLimits";
import disposableDomainsList from "disposable-email-domains";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Maintained 120k-domain list (npm `disposable-email-domains`,
// updated regularly). New signups whose email domain is in here
// land in pending_review (not auto-approved) so staff can vet them.
// Bundled at deploy time — refresh by `npm update`.
const DISPOSABLE_EMAIL_DOMAINS = new Set<string>(disposableDomainsList);

const SIGNUP_LIMITS = {
  perIp: 5,                      // 5 signups / hour / IP
  perEmailPerDay: 1,             // legitimate signups don't reuse email at all
  windowMs: 60 * 60_000,         // 1 hour
  windowMsDay: 24 * 60 * 60_000, // 1 day
};

// Hard floor on form-fill time. A human can't fill workspace name +
// owner name + email + password in under 1.5s. Anything faster is a
// bot submitting the form before the page even rendered.
const SIGNUP_MIN_FORM_FILL_MS = 1500;

/**
 * Risk-screen a new signup. Returns null when the signup looks fine
 * (auto-approve), or a short human-readable reason string when staff
 * should review before unlocking the dashboard. Heuristics here are
 * deliberately conservative — false negatives are fine (a bad actor
 * gets in for a moment, gets caught later via /admin/workspaces),
 * false positives are not (real customers locked out kill conversion).
 */
function screenSignupRisk(args: {
  email: string;
  workspaceName: string;
  ownerName: string;
}): string | null {
  const email = args.email.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) {
    return "Email is malformed.";
  }
  const domain = email.slice(at + 1);
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return `Disposable email domain (${domain}).`;
  }
  // 8+ digits in the local-part is a strong burner-account signal.
  const localPart = email.slice(0, at);
  const digitRun = localPart.match(/\d{8,}/);
  if (digitRun) {
    return `Suspicious email local-part (${digitRun[0]}…).`;
  }
  // Single-word names like "asdf", "test", "qwerty" — short + only
  // ASCII letters. We don't gate on language because real people
  // type any script.
  const ownerName = args.ownerName.trim();
  if (/^(test|asdf|qwerty|admin|user|abc|xyz)\d*$/i.test(ownerName)) {
    return `Placeholder owner name ("${ownerName}").`;
  }
  if (/^(test|asdf|demo|example|temp|delete)/i.test(args.workspaceName.trim())) {
    return `Placeholder workspace name ("${args.workspaceName}").`;
  }
  return null;
}

/**
 * Bootstrap: create the first workspace + its owner operator + a
 * default widget config, all in one mutation. Returns a fresh session
 * token to set as a cookie on the client.
 *
 * This is the only flow that creates a workspace today. Self-serve
 * signup will reuse the same primitives once the marketing CTA wires up.
 */
export const create = mutation({
  args: {
    workspaceName: v.string(),
    ownerName: v.string(),
    ownerEmail: v.string(),
    ownerPassword: v.string(),
    // Bot-detection signals (all optional so older clients keep
    // working — but the server action SHOULD always send them).
    ipAddress: v.optional(v.string()),
    honeypot: v.optional(v.string()),     // hidden form field; non-empty = bot
    formStartedAt: v.optional(v.number()), // client-stamped, ms since epoch
    fingerprint: v.optional(v.string()),   // FingerprintJS visitorId
  },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    sessionToken: v.string(),
    widgetId: v.string(),
  }),
  handler: async (ctx, args) => {
    // Honeypot — a hidden input no real user can see/fill. Reject
    // hard, no need to be polite about why.
    if (args.honeypot && args.honeypot.length > 0) {
      throw new ConvexError("Signup blocked.");
    }

    // Form-fill timing — humans take >1.5s to fill the form. Bots
    // submit immediately. Skip if the client didn't stamp (older
    // bundles) so we don't break in-flight form posts.
    if (args.formStartedAt) {
      const elapsed = Date.now() - args.formStartedAt;
      if (elapsed >= 0 && elapsed < SIGNUP_MIN_FORM_FILL_MS) {
        throw new ConvexError("Signup blocked.");
      }
    }

    // Per-IP signup throttle (5/hour). Per-email throttle (1/day —
    // legit users don't sign up with the same email twice). The
    // duplicate-email check below will reject the second signup
    // anyway, but the rate-limit fires earlier, before we hit the
    // operators index — useful for IP-spread attacks against
    // many email candidates.
    const ipBucket = args.ipAddress
      ? `signup-ip:${args.ipAddress}`
      : "signup-ip:unknown";
    {
      const limit = await takeBucket(
        ctx,
        ipBucket,
        SIGNUP_LIMITS.perIp,
        SIGNUP_LIMITS.windowMs,
      );
      if (!limit.allowed) {
        throw new ConvexError(
          `Too many signups. Try again in ${limit.retryAfterSeconds ?? 60}s.`,
        );
      }
    }

    const slug = slugify(args.workspaceName);
    if (!slug) throw new Error("Workspace name must contain letters or numbers.");

    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error(`Workspace "${slug}" already exists.`);

    const email = args.ownerEmail.trim().toLowerCase();
    {
      const limit = await takeBucket(
        ctx,
        `signup-email:${email}`,
        SIGNUP_LIMITS.perEmailPerDay,
        SIGNUP_LIMITS.windowMsDay,
      );
      if (!limit.allowed) {
        throw new ConvexError("Signup blocked.");
      }
    }
    const emailTaken = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (emailTaken) throw new Error("That email already has an account.");

    const result = await materialiseWorkspace(ctx, {
      slug,
      workspaceName: args.workspaceName.trim(),
      ownerName: args.ownerName.trim(),
      email,
      passwordHash: await hashPassword(args.ownerPassword),
      ipAddress: args.ipAddress,
      fingerprint: args.fingerprint,
    });
    return result;
  },
});

/**
 * Internal helper — writes the workspace + brand + operator + first
 * session + signup notification rows. Used by both the legacy
 * `create` mutation (direct-signup path when platform email isn't
 * configured) and `confirmSignup` (post-verification path).
 *
 * Caller is responsible for all validation: email format, password
 * length, slug uniqueness, dup-email check, rate-limits, honeypot,
 * timing. By the time we get here the inputs are clean.
 */
async function materialiseWorkspace(
  ctx: { db: import("./_generated/server").MutationCtx["db"] },
  args: {
    slug: string;
    workspaceName: string;
    ownerName: string;
    email: string;
    passwordHash: string;
    ipAddress?: string;
    fingerprint?: string;
  },
): Promise<{
  workspaceId: Id<"workspaces">;
  operatorId: Id<"operators">;
  sessionToken: string;
  widgetId: string;
}> {
  const widgetId = generateWidgetId();
  const now = Date.now();

  const riskReason = screenSignupRisk({
    email: args.email,
    workspaceName: args.workspaceName,
    ownerName: args.ownerName,
  });
  const platformStatus: "active" | "pending_review" = riskReason
    ? "pending_review"
    : "active";

  const workspaceId = await ctx.db.insert("workspaces", {
    slug: args.slug,
    name: args.workspaceName,
    plan: "spark",
    platformStatus,
    platformStatusReason:
      riskReason ?? `Auto-approved at signup (${new Date(now).toISOString()}).`,
    platformStatusAt: now,
    signupIp: args.ipAddress,
    signupFingerprint: args.fingerprint,
    createdAt: now,
  });

  await ctx.db.insert("brands", {
    workspaceId,
    slug: "main",
    name: args.workspaceName,
    widgetId,
    primaryColor: "#0F1A12",
    welcomeMessage: `Hi! How can the ${args.workspaceName} team help?`,
    position: "br",
    createdAt: now,
  });

  const operatorId = await ctx.db.insert("operators", {
    workspaceId,
    email: args.email,
    name: args.ownerName,
    role: "owner",
    brandAccess: "all",
    passwordHash: args.passwordHash,
    createdAt: now,
  });

  const sessionToken = generateSessionToken();
  await ctx.db.insert("sessions", {
    operatorId,
    workspaceId,
    tokenHash: await hashToken(sessionToken),
    expiresAt: now + SESSION_TTL_MS,
  });

  await ctx.db.insert("notifications", {
    workspaceId,
    kind: "system",
    severity: riskReason ? "warn" : "info",
    title: riskReason
      ? `New signup flagged — ${args.workspaceName}`
      : `New signup — ${args.workspaceName}`,
    body: riskReason
      ? `${args.ownerName} <${args.email}> created the workspace. Held for review: ${riskReason}`
      : `${args.ownerName} <${args.email}> created the workspace and was auto-approved.`,
    link: `/admin/workspaces`,
    createdAt: now,
  });

  return { workspaceId, operatorId, sessionToken, widgetId };
}

// ── Email-verified signup flow ────────────────────────────────────────
//
// When PRAXTALK_RESEND_API_KEY is set, /sign-up form submissions go
// through requestSignup → email click → confirmSignup instead of
// directly into materialiseWorkspace. This kills the entire class
// of bots that can't read the inbox tied to the email they signed
// up with — which is most of them.
//
// When the env is unset the server action falls back to the legacy
// `create` mutation, so deploys without Resend wired up still work.

const SIGNUP_TOKEN_TTL_MS = 60 * 60_000; // 1 hour

export const requestSignup = mutation({
  args: {
    workspaceName: v.string(),
    ownerName: v.string(),
    ownerEmail: v.string(),
    ownerPassword: v.string(),
    ipAddress: v.optional(v.string()),
    honeypot: v.optional(v.string()),
    formStartedAt: v.optional(v.number()),
    fingerprint: v.optional(v.string()),
  },
  returns: v.object({
    email: v.string(),
    expiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    if (args.honeypot && args.honeypot.length > 0) {
      throw new ConvexError("Signup blocked.");
    }
    if (args.formStartedAt) {
      const elapsed = Date.now() - args.formStartedAt;
      if (elapsed >= 0 && elapsed < SIGNUP_MIN_FORM_FILL_MS) {
        throw new ConvexError("Signup blocked.");
      }
    }

    const ipBucket = args.ipAddress
      ? `signup-ip:${args.ipAddress}`
      : "signup-ip:unknown";
    {
      const limit = await takeBucket(
        ctx,
        ipBucket,
        SIGNUP_LIMITS.perIp,
        SIGNUP_LIMITS.windowMs,
      );
      if (!limit.allowed) {
        throw new ConvexError(
          `Too many signups. Try again in ${limit.retryAfterSeconds ?? 60}s.`,
        );
      }
    }

    const slug = slugify(args.workspaceName);
    if (!slug) throw new Error("Workspace name must contain letters or numbers.");

    const existing = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (existing) throw new Error(`Workspace "${slug}" already exists.`);

    const email = args.ownerEmail.trim().toLowerCase();
    {
      const limit = await takeBucket(
        ctx,
        `signup-email:${email}`,
        SIGNUP_LIMITS.perEmailPerDay,
        SIGNUP_LIMITS.windowMsDay,
      );
      if (!limit.allowed) {
        throw new ConvexError("Signup blocked.");
      }
    }
    const emailTaken = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (emailTaken) throw new Error("That email already has an account.");

    if (args.ownerPassword.length < 8) {
      throw new ConvexError("Password must be at least 8 characters.");
    }

    // Last-attempt-wins: drop any prior pending row for this email
    // before inserting a fresh one. Avoids stale-token confusion.
    const prior = await ctx.db
      .query("pendingSignups")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    for (const row of prior) await ctx.db.delete(row._id);

    const token = generateSignupVerificationToken();
    const tokenHash = await hashToken(token);
    const tokenPrefix = token.slice(0, 12);
    const now = Date.now();
    const expiresAt = now + SIGNUP_TOKEN_TTL_MS;

    const pendingId = await ctx.db.insert("pendingSignups", {
      email,
      workspaceName: args.workspaceName.trim(),
      ownerName: args.ownerName.trim(),
      passwordHash: await hashPassword(args.ownerPassword),
      tokenHash,
      tokenPrefix,
      ipAddress: args.ipAddress,
      fingerprint: args.fingerprint,
      expiresAt,
      createdAt: now,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.workspaces._sendSignupVerificationEmail,
      { pendingId, token },
    );

    return { email, expiresAt };
  },
});

/**
 * Resolves a token to its (still-valid, not-consumed) pending row.
 * Used by the /setup/confirm page to render "verifying…" state
 * before the user clicks Confirm.
 */
export const lookupSignupToken = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      workspaceName: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, { token }) => {
    if (!token.startsWith("pst_")) return null;
    const tokenHash = await hashToken(token);
    const candidates = await ctx.db
      .query("pendingSignups")
      .withIndex("by_token_prefix", (q) =>
        q.eq("tokenPrefix", token.slice(0, 12)),
      )
      .collect();
    const row = candidates.find((r) =>
      timingSafeEqualHex(r.tokenHash, tokenHash),
    );
    if (!row) return null;
    if (row.consumedAt) return null;
    if (row.expiresAt < Date.now()) return null;
    return {
      email: row.email,
      workspaceName: row.workspaceName,
      expiresAt: row.expiresAt,
    };
  },
});

export const confirmSignup = mutation({
  args: { token: v.string() },
  returns: v.object({
    workspaceId: v.id("workspaces"),
    operatorId: v.id("operators"),
    sessionToken: v.string(),
    widgetId: v.string(),
  }),
  handler: async (ctx, { token }) => {
    if (!token.startsWith("pst_")) {
      throw new ConvexError("Invalid verification link.");
    }
    const tokenHash = await hashToken(token);
    const candidates = await ctx.db
      .query("pendingSignups")
      .withIndex("by_token_prefix", (q) =>
        q.eq("tokenPrefix", token.slice(0, 12)),
      )
      .collect();
    const row = candidates.find((r) =>
      timingSafeEqualHex(r.tokenHash, tokenHash),
    );
    if (!row) throw new ConvexError("Verification link not recognised.");
    if (row.consumedAt) {
      throw new ConvexError("This link was already used.");
    }
    if (row.expiresAt < Date.now()) {
      throw new ConvexError(
        "This verification link expired. Restart the signup.",
      );
    }

    // Recheck slug + email-uniqueness in case anything changed in
    // the time the token was outstanding.
    const slug = slugify(row.workspaceName);
    if (!slug) throw new ConvexError("Workspace name is invalid.");
    const slugTaken = await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (slugTaken) {
      throw new ConvexError(
        `Workspace "${slug}" already exists. Restart the signup.`,
      );
    }
    const emailTaken = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", row.email))
      .first();
    if (emailTaken) {
      throw new ConvexError(
        "That email already has an account. Sign in instead.",
      );
    }

    const result = await materialiseWorkspace(ctx, {
      slug,
      workspaceName: row.workspaceName,
      ownerName: row.ownerName,
      email: row.email,
      passwordHash: row.passwordHash,
      ipAddress: row.ipAddress,
      fingerprint: row.fingerprint,
    });

    // Mark the token consumed (don't delete the row immediately —
    // staff investigating an abuse cluster might want the audit
    // trail. Periodic cleanup can prune consumed rows older than
    // 30 days.)
    await ctx.db.patch(row._id, { consumedAt: Date.now() });
    return result;
  },
});

export const _loadPendingSignup = internalQuery({
  args: { pendingId: v.id("pendingSignups") },
  handler: async (ctx, { pendingId }) => {
    const row = await ctx.db.get(pendingId);
    return row;
  },
});

export const _sendSignupVerificationEmail = internalAction({
  args: {
    pendingId: v.id("pendingSignups"),
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, { pendingId, token }) => {
    if (!platformEmailEnabled()) {
      console.warn(
        "[signup-verify] PRAXTALK_RESEND_API_KEY not set — verification email skipped",
      );
      return null;
    }
    const row = await ctx.runQuery(
      internal.workspaces._loadPendingSignup,
      { pendingId },
    );
    if (!row) return null;

    const dashboardBase =
      process.env.PRAXTALK_DASHBOARD_BASE ?? "https://www.praxtalk.com";
    const link = `${dashboardBase}/setup/confirm?token=${encodeURIComponent(token)}`;
    const expiryHours = Math.round(SIGNUP_TOKEN_TTL_MS / (60 * 60_000));

    const html = `
      <!doctype html>
      <html><body style="font-family: system-ui, -apple-system, Helvetica, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; color: #14181b;">
        <h1 style="font-size: 22px; margin: 0 0 16px;">Verify your PraxTalk signup</h1>
        <p style="font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
          Hi ${escapeHtml(row.ownerName)},<br /><br />
          Click the button below to finish creating <strong>${escapeHtml(row.workspaceName)}</strong> and unlock your workspace dashboard.
        </p>
        <p style="margin: 0 0 24px;">
          <a href="${link}" style="display: inline-block; background: #14181b; color: #f7f4ee; padding: 12px 22px; border-radius: 12px; text-decoration: none; font-weight: 500; font-size: 15px;">
            Verify and create workspace
          </a>
        </p>
        <p style="font-size: 13px; line-height: 1.55; color: #6b7280; margin: 0 0 8px;">
          Link expires in ${expiryHours} hour. If you didn't ask for this, ignore the email — no workspace will be created.
        </p>
        <p style="font-size: 12px; color: #9ca3af; margin-top: 24px;">
          PraxTalk · AI-native customer messaging<br />
          <a href="${dashboardBase}" style="color: #6b7280;">www.praxtalk.com</a>
        </p>
      </body></html>
    `;

    const result = await sendPlatformEmail({
      to: row.email,
      subject: `Verify your PraxTalk signup`,
      html,
    });
    if (!result.ok) {
      console.error("[signup-verify] send failed:", result.error);
    }
    return null;
  },
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * The dashboard accent color the current operator's workspace sees.
 * Hex string or null when unset (UI falls back to default).
 */
export const getDashboardAccent = query({
  args: { sessionToken: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    try {
      const { workspaceId } = await requireOperator(ctx, args.sessionToken);
      const ws = await ctx.db.get(workspaceId);
      return ws?.dashboardAccent ?? null;
    } catch {
      return null;
    }
  },
});

/**
 * Owner / admin sets the workspace's dashboard accent. Pass null to
 * reset to default.
 */
export const setDashboardAccent = mutation({
  args: {
    sessionToken: v.string(),
    accent: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can change the dashboard color.");
    }
    if (args.accent && !/^#[0-9a-fA-F]{6}$/.test(args.accent)) {
      throw new Error("Color must be a 6-digit hex like #0F1A12.");
    }
    await ctx.db.patch(workspaceId, {
      dashboardAccent: args.accent ?? undefined,
    });
    return null;
  },
});

/**
 * Owner / admin renames the workspace and/or changes its slug. Plan
 * tier is read-only here — that's managed via the billing webhook.
 *
 * Slug changes are validated for uniqueness across the table. Pending
 * invite links that reference the old slug are NOT migrated; we just
 * trust the admin understands they'll stop matching.
 */
export const updateIdentity = mutation({
  args: {
    sessionToken: v.string(),
    name: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error(
        "Only admins and owners can rename the workspace.",
      );
    }
    const ws = await ctx.db.get(workspaceId);
    if (!ws) throw new Error("Workspace not found.");

    const patch: Record<string, unknown> = {};

    if (args.name !== undefined) {
      const nextName = args.name.trim();
      if (!nextName) throw new Error("Workspace name can't be empty.");
      if (nextName.length > 80) {
        throw new Error("Workspace name is too long (max 80 chars).");
      }
      if (nextName !== ws.name) patch.name = nextName;
    }

    if (args.slug !== undefined) {
      const nextSlug = slugify(args.slug);
      if (!nextSlug) {
        throw new Error("Slug must contain letters or numbers.");
      }
      if (nextSlug.length > 60) {
        throw new Error("Slug is too long (max 60 chars).");
      }
      if (nextSlug !== ws.slug) {
        const taken = await ctx.db
          .query("workspaces")
          .withIndex("by_slug", (q) => q.eq("slug", nextSlug))
          .unique();
        if (taken && taken._id !== workspaceId) {
          throw new Error(`Slug "${nextSlug}" is already taken.`);
        }
        patch.slug = nextSlug;
      }
    }

    if (Object.keys(patch).length === 0) return null;
    await ctx.db.patch(workspaceId, patch);
    return null;
  },
});

export const getBySlug = query({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("workspaces"),
      _creationTime: v.number(),
      slug: v.string(),
      name: v.string(),
      plan: v.union(
        v.literal("spark"),
        v.literal("team"),
        v.literal("scale"),
        v.literal("enterprise"),
      ),
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, { slug }) => {
    return await ctx.db
      .query("workspaces")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
  },
});

// ── Customer self-serve export ─────────────────────────────────────────
//
// Workspace owners + admins can download a complete dump of their
// own workspace data. This is GDPR Article 20 (data portability)
// table-stakes and the same data the platform-admin export gives us
// — same redaction rules, same shape — just gated by the operator's
// own session instead of the platform-admin allowlist.
//
// Agents (role="agent") can't export — they have access only to
// conversations they're assigned to via brand access, not the
// whole workspace.

export const exportMine = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only workspace owners and admins can export workspace data.",
      );
    }
    return await buildWorkspaceCoreExport(ctx, workspaceId, "workspace_owner");
  },
});

export const exportMineMessagesPage = query({
  args: {
    sessionToken: v.string(),
    cursor: v.union(v.number(), v.null()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new ConvexError(
        "Only workspace owners and admins can export workspace data.",
      );
    }
    return await buildMessagesPage(
      ctx,
      workspaceId,
      args.cursor,
      args.pageSize ?? 5000,
    );
  },
});

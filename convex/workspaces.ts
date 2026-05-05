import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOperator } from "./auth";
import {
  generateSessionToken,
  generateWidgetId,
  hashPassword,
  hashToken,
  slugify,
} from "./lib/auth";
import {
  buildMessagesPage,
  buildWorkspaceCoreExport,
} from "./lib/workspaceExport";
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

    const widgetId = generateWidgetId();
    const now = Date.now();
    const workspaceName = args.workspaceName.trim();

    // Auto-approve clean signups so the customer drops straight into
    // the dashboard. Only suspicious ones (disposable email,
    // placeholder names, etc.) get held for staff review — that
    // queue stays useful as an exception path, not the default path.
    const riskReason = screenSignupRisk({
      email,
      workspaceName,
      ownerName: args.ownerName,
    });
    const platformStatus: "active" | "pending_review" = riskReason
      ? "pending_review"
      : "active";

    const workspaceId = await ctx.db.insert("workspaces", {
      slug,
      name: workspaceName,
      plan: "spark",
      platformStatus,
      platformStatusReason:
        riskReason ?? `Auto-approved at signup (${new Date(now).toISOString()}).`,
      platformStatusAt: now,
      createdAt: now,
    });

    // Seed a default "main" brand. New workspaces get a single brand
    // out of the gate; admins can add more from /app/brands.
    await ctx.db.insert("brands", {
      workspaceId,
      slug: "main",
      name: workspaceName,
      widgetId,
      primaryColor: "#0F1A12",
      welcomeMessage: `Hi! How can the ${workspaceName} team help?`,
      position: "br",
      createdAt: now,
    });

    const operatorId = await ctx.db.insert("operators", {
      workspaceId,
      email,
      name: args.ownerName.trim(),
      role: "owner",
      brandAccess: "all",
      passwordHash: await hashPassword(args.ownerPassword),
      createdAt: now,
    });

    const sessionToken = generateSessionToken();
    await ctx.db.insert("sessions", {
      operatorId,
      workspaceId,
      tokenHash: await hashToken(sessionToken),
      expiresAt: now + SESSION_TTL_MS,
    });

    // System notification on the new workspace so staff see the
    // signup landed. The flagged signups also get a louder badge
    // because they're the ones the platform-admin actually needs
    // to act on.
    await ctx.db.insert("notifications", {
      workspaceId,
      kind: "system",
      severity: riskReason ? "warn" : "info",
      title: riskReason
        ? `New signup flagged — ${workspaceName}`
        : `New signup — ${workspaceName}`,
      body: riskReason
        ? `${args.ownerName.trim()} <${email}> created the workspace. Held for review: ${riskReason}`
        : `${args.ownerName.trim()} <${email}> created the workspace and was auto-approved.`,
      link: `/admin/workspaces`,
      createdAt: now,
    });

    return { workspaceId, operatorId, sessionToken, widgetId };
  },
});

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

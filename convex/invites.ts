import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { requireOperator } from "./auth";
import {
  generateInviteToken,
  generateSessionToken,
  hashPassword,
  hashToken,
} from "./lib/auth";
import { pushActivity } from "./notifications";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const brandAccessValidator = v.union(
  v.literal("all"),
  v.array(v.id("brands")),
);

// ── Dashboard queries / mutations ─────────────────────────────────────

export const list = query({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    const { workspaceId } = await requireOperator(ctx, sessionToken);
    const invites = await ctx.db
      .query("operatorInvites")
      .withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
      .collect();
    return invites
      .filter((i) => !i.acceptedAt && !i.revokedAt)
      .map((i) => ({
        _id: i._id,
        email: i.email,
        name: i.name,
        role: i.role,
        brandAccess: i.brandAccess ?? "all",
        invitedAt: i.invitedAt,
        expiresAt: i.expiresAt,
      }))
      .sort((a, b) => b.invitedAt - a.invitedAt);
  },
});

/**
 * Send an invite to an email address. Stores a hashed token + schedules
 * the email-send action. The raw token is returned so the caller can
 * also display the magic link in the dashboard (for the "we couldn't
 * email you the link, here it is" recovery path).
 */
export const send = mutation({
  args: {
    sessionToken: v.string(),
    email: v.string(),
    name: v.optional(v.string()),
    role: v.union(v.literal("admin"), v.literal("agent")),
    brandAccess: v.optional(brandAccessValidator),
  },
  returns: v.object({
    inviteId: v.id("operatorInvites"),
    inviteToken: v.string(),
    inviteLink: v.string(),
  }),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can invite teammates.");
    }
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new Error("Please enter a valid email.");
    }

    // Refuse if an operator with this email already exists.
    const existingOperator = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (existingOperator) {
      throw new Error("That email already has an operator account.");
    }

    // Refuse if there's already a live invite for this email.
    const existing = await ctx.db
      .query("operatorInvites")
      .withIndex("by_email", (q) => q.eq("email", email))
      .collect();
    const liveDuplicate = existing.find(
      (i) =>
        i.workspaceId === workspaceId && !i.acceptedAt && !i.revokedAt,
    );
    if (liveDuplicate) {
      throw new Error(
        "A pending invite for that email already exists. Revoke it before sending another.",
      );
    }

    const token = generateInviteToken();
    const tokenHash = await hashToken(token);
    const tokenPrefix = token.slice(0, 12);
    const now = Date.now();

    const inviteId = await ctx.db.insert("operatorInvites", {
      workspaceId,
      email,
      name: args.name?.trim(),
      role: args.role,
      brandAccess: args.brandAccess ?? "all",
      tokenHash,
      tokenPrefix,
      invitedBy: operator._id,
      invitedAt: now,
      expiresAt: now + INVITE_TTL_MS,
    });

    // Schedule the email send. Action looks up the workspace's email
    // integration; if none configured we record an activity warning so
    // the inviter can hand-deliver the link.
    await ctx.scheduler.runAfter(0, internal.invites.deliverInviteEmail, {
      inviteId,
      token,
    });

    return {
      inviteId,
      inviteToken: token,
      inviteLink: `https://praxtalk.com/invite/${token}`,
    };
  },
});

export const revoke = mutation({
  args: {
    sessionToken: v.string(),
    inviteId: v.id("operatorInvites"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { operator, workspaceId } = await requireOperator(
      ctx,
      args.sessionToken,
    );
    if (operator.role === "agent") {
      throw new Error("Only admins and owners can revoke invites.");
    }
    const invite = await ctx.db.get(args.inviteId);
    if (!invite || invite.workspaceId !== workspaceId) {
      throw new Error("Invite not found.");
    }
    if (!invite.acceptedAt && !invite.revokedAt) {
      await ctx.db.patch(args.inviteId, { revokedAt: Date.now() });
    }
    return null;
  },
});

// ── Public — acceptance flow ──────────────────────────────────────────

/**
 * Public — read invite metadata so the accept page can render
 * "<inviter> invited you to <workspace>". Returns null for expired,
 * accepted, revoked, or unknown tokens.
 */
export const lookup = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceName: v.string(),
      workspaceSlug: v.string(),
      email: v.string(),
      name: v.union(v.null(), v.string()),
      role: v.union(v.literal("admin"), v.literal("agent")),
      invitedByName: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, { token }) => {
    if (!token.startsWith("inv_")) return null;
    const tokenHash = await hashToken(token);
    const candidates = await ctx.db
      .query("operatorInvites")
      .withIndex("by_token_prefix", (q) =>
        q.eq("tokenPrefix", token.slice(0, 12)),
      )
      .collect();
    const invite = candidates.find((i) => i.tokenHash === tokenHash);
    if (
      !invite ||
      invite.acceptedAt ||
      invite.revokedAt ||
      invite.expiresAt < Date.now()
    ) {
      return null;
    }
    const workspace = await ctx.db.get(invite.workspaceId);
    const inviter = await ctx.db.get(invite.invitedBy);
    if (!workspace) return null;
    return {
      workspaceName: workspace.name,
      workspaceSlug: workspace.slug,
      email: invite.email,
      name: invite.name ?? null,
      role: invite.role,
      invitedByName: inviter?.name ?? "A teammate",
      expiresAt: invite.expiresAt,
    };
  },
});

/**
 * Public — recipient sets their name + password. Creates the operator
 * doc, marks the invite consumed, and returns a fresh session token so
 * the Next.js side can drop the cookie.
 */
export const accept = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    password: v.string(),
  },
  returns: v.object({
    operatorId: v.id("operators"),
    workspaceId: v.id("workspaces"),
    sessionToken: v.string(),
  }),
  handler: async (ctx, args) => {
    if (!args.token.startsWith("inv_")) {
      throw new Error("Invalid invite token.");
    }
    if (args.password.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (!args.name.trim()) {
      throw new Error("Name is required.");
    }

    const tokenHash = await hashToken(args.token);
    const candidates = await ctx.db
      .query("operatorInvites")
      .withIndex("by_token_prefix", (q) =>
        q.eq("tokenPrefix", args.token.slice(0, 12)),
      )
      .collect();
    const invite = candidates.find((i) => i.tokenHash === tokenHash);
    if (!invite) throw new Error("Invite not found or already used.");
    if (invite.acceptedAt || invite.revokedAt) {
      throw new Error("Invite already used or revoked.");
    }
    if (invite.expiresAt < Date.now()) {
      throw new Error("Invite has expired. Ask for a new one.");
    }

    // Refuse if email got claimed elsewhere between send + accept.
    const dupe = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", invite.email))
      .first();
    if (dupe) {
      throw new Error("That email already has an operator account.");
    }

    const now = Date.now();
    const operatorId = await ctx.db.insert("operators", {
      workspaceId: invite.workspaceId,
      email: invite.email,
      name: args.name.trim(),
      role: invite.role,
      brandAccess: invite.brandAccess ?? "all",
      passwordHash: await hashPassword(args.password),
      createdAt: now,
    });

    await ctx.db.patch(invite._id, { acceptedAt: now });

    const sessionToken = generateSessionToken();
    await ctx.db.insert("sessions", {
      operatorId,
      workspaceId: invite.workspaceId,
      tokenHash: await hashToken(sessionToken),
      expiresAt: now + SESSION_TTL_MS,
    });

    await pushActivity(ctx, {
      workspaceId: invite.workspaceId,
      kind: "operator_added",
      severity: "success",
      title: `Joined: ${args.name.trim()}`,
      body: `${invite.role} · ${invite.email}`,
      link: "/app/team",
    });

    return {
      operatorId,
      workspaceId: invite.workspaceId,
      sessionToken,
    };
  },
});

// ── Email delivery ────────────────────────────────────────────────────

/**
 * Look up everything `deliverInviteEmail` needs. Internal-only because
 * it returns the workspace's email-provider API key.
 */
export const loadInviteContext = internalQuery({
  args: { inviteId: v.id("operatorInvites") },
  handler: async (ctx, { inviteId }) => {
    const invite = await ctx.db.get(inviteId);
    if (!invite) return null;
    const workspace = await ctx.db.get(invite.workspaceId);
    const inviter = await ctx.db.get(invite.invitedBy);
    const integration = await ctx.db
      .query("emailIntegrations")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", invite.workspaceId),
      )
      .first();
    return { invite, workspace, inviter, integration };
  },
});

export const recordInviteDeliveryFailure = internalMutation({
  args: { inviteId: v.id("operatorInvites"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { inviteId, error }) => {
    const invite = await ctx.db.get(inviteId);
    if (!invite) return null;
    await pushActivity(ctx, {
      workspaceId: invite.workspaceId,
      kind: "email_failed",
      severity: "warn",
      title: `Couldn't email invite to ${invite.email}`,
      body: `${error} — share the invite link manually from /app/team.`,
      link: "/app/team",
    });
    return null;
  },
});

/**
 * Send the invite email via the workspace's configured ESP. If none is
 * configured, log a warn-level activity so the admin knows to copy the
 * invite link out of the dashboard manually.
 */
export const deliverInviteEmail = internalAction({
  args: { inviteId: v.id("operatorInvites"), token: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(internal.invites.loadInviteContext, {
      inviteId: args.inviteId,
    });
    if (!data) return null;
    const { invite, workspace, inviter, integration } = data;
    if (!workspace) return null;

    if (!integration || !integration.enabled) {
      await ctx.runMutation(
        internal.invites.recordInviteDeliveryFailure,
        {
          inviteId: args.inviteId,
          error: "No email integration configured",
        },
      );
      return null;
    }

    const inviteLink = `https://praxtalk.com/invite/${args.token}`;
    const inviterName = inviter?.name ?? "Your teammate";
    const subject = `${inviterName} invited you to PraxTalk`;
    const body =
      `${inviterName} invited you to join the ${workspace.name} workspace on PraxTalk as ${invite.role}.\n\n` +
      `Accept the invite (set your password) here:\n${inviteLink}\n\n` +
      `This link expires in 14 days.\n\n` +
      `— PraxTalk`;
    const fromHeader = integration.fromName
      ? `${integration.fromName} <${integration.fromAddress}>`
      : integration.fromAddress;

    try {
      if (integration.provider === "postmark") {
        const res = await fetch("https://api.postmarkapp.com/email", {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/json",
            "x-postmark-server-token": integration.apiKey,
          },
          body: JSON.stringify({
            From: fromHeader,
            To: invite.email,
            Subject: subject,
            TextBody: body,
            MessageStream: "outbound",
          }),
        });
        if (!res.ok) throw new Error(`Postmark ${res.status}`);
      } else if (integration.provider === "sendgrid") {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            authorization: `Bearer ${integration.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: invite.email }] }],
            from: {
              email: integration.fromAddress,
              name: integration.fromName,
            },
            subject,
            content: [{ type: "text/plain", value: body }],
          }),
        });
        if (!res.ok) throw new Error(`SendGrid ${res.status}`);
      } else if (integration.provider === "resend") {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            authorization: `Bearer ${integration.apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            from: fromHeader,
            to: invite.email,
            subject,
            text: body,
          }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}`);
      }
    } catch (err) {
      await ctx.runMutation(
        internal.invites.recordInviteDeliveryFailure,
        {
          inviteId: args.inviteId,
          error: err instanceof Error ? err.message : "Send failed",
        },
      );
    }
    return null;
  },
});

// silence unused-imports lint if Doc/Id not directly referenced after edits
void (null as unknown as Doc<"operatorInvites">);
void (null as unknown as Id<"operatorInvites">);

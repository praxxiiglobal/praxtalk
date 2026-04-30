import { ConvexError, v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  generatePasswordResetToken,
  hashPassword,
  hashToken,
} from "./lib/auth";
import { pushActivity } from "./notifications";

const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── Public — request a reset link ─────────────────────────────────────

/**
 * Public mutation. Always returns null — never reveals whether the email
 * is registered (no account enumeration). If the email maps to an
 * operator, we generate a token, store its hash, and schedule an email.
 * If not, we silently no-op.
 */
export const request = mutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ConvexError("Please enter a valid email.");
    }

    const operator = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!operator) return null;

    const token = generatePasswordResetToken();
    const tokenHash = await hashToken(token);
    const tokenPrefix = token.slice(0, 12);
    const now = Date.now();

    const tokenId = await ctx.db.insert("passwordResetTokens", {
      operatorId: operator._id,
      workspaceId: operator.workspaceId,
      email,
      tokenHash,
      tokenPrefix,
      requestedAt: now,
      expiresAt: now + RESET_TTL_MS,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.passwordReset.deliverResetEmail,
      { tokenId, token },
    );

    return null;
  },
});

// ── Public — verify a token (rendered on /reset-password/[token]) ─────

export const lookup = query({
  args: { token: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      email: v.string(),
      expiresAt: v.number(),
    }),
  ),
  handler: async (ctx, { token }) => {
    if (!token.startsWith("pwr_")) return null;
    const tokenHash = await hashToken(token);
    const candidates = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token_prefix", (q) =>
        q.eq("tokenPrefix", token.slice(0, 12)),
      )
      .collect();
    const reset = candidates.find((r) => r.tokenHash === tokenHash);
    if (!reset || reset.usedAt || reset.expiresAt < Date.now()) {
      return null;
    }
    return { email: reset.email, expiresAt: reset.expiresAt };
  },
});

// ── Public — complete the reset (set new password) ────────────────────

export const complete = mutation({
  args: { token: v.string(), newPassword: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (!args.token.startsWith("pwr_")) {
      throw new ConvexError("Invalid reset link.");
    }
    if (args.newPassword.length < 8) {
      throw new ConvexError("Password must be at least 8 characters.");
    }

    const tokenHash = await hashToken(args.token);
    const candidates = await ctx.db
      .query("passwordResetTokens")
      .withIndex("by_token_prefix", (q) =>
        q.eq("tokenPrefix", args.token.slice(0, 12)),
      )
      .collect();
    const reset = candidates.find((r) => r.tokenHash === tokenHash);
    if (!reset) throw new ConvexError("Reset link not found or already used.");
    if (reset.usedAt) throw new ConvexError("This reset link was already used.");
    if (reset.expiresAt < Date.now()) {
      throw new ConvexError("This reset link has expired. Request a new one.");
    }

    const operator = await ctx.db.get(reset.operatorId);
    if (!operator) throw new ConvexError("Operator not found.");

    await ctx.db.patch(operator._id, {
      passwordHash: await hashPassword(args.newPassword),
    });
    await ctx.db.patch(reset._id, { usedAt: Date.now() });

    // Invalidate all existing sessions for this operator — anyone holding
    // a stale cookie is logged out.
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);

    return null;
  },
});

// ── Email delivery ────────────────────────────────────────────────────

export const loadResetContext = internalQuery({
  args: { tokenId: v.id("passwordResetTokens") },
  handler: async (ctx, { tokenId }) => {
    const reset = await ctx.db.get(tokenId);
    if (!reset) return null;
    const workspace = await ctx.db.get(reset.workspaceId);
    const integration = await ctx.db
      .query("emailIntegrations")
      .withIndex("by_workspace", (q) =>
        q.eq("workspaceId", reset.workspaceId),
      )
      .first();
    return { reset, workspace, integration };
  },
});

export const recordResetDeliveryFailure = internalMutation({
  args: { tokenId: v.id("passwordResetTokens"), error: v.string() },
  returns: v.null(),
  handler: async (ctx, { tokenId, error }) => {
    const reset = await ctx.db.get(tokenId);
    if (!reset) return null;
    await pushActivity(ctx, {
      workspaceId: reset.workspaceId,
      kind: "email_failed",
      severity: "warn",
      title: `Couldn't email password-reset to ${reset.email}`,
      body: `${error} — share the reset link manually if you trust the requester.`,
      link: "/app/integrations",
    });
    return null;
  },
});

export const deliverResetEmail = internalAction({
  args: {
    tokenId: v.id("passwordResetTokens"),
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const data = await ctx.runQuery(
      internal.passwordReset.loadResetContext,
      { tokenId: args.tokenId },
    );
    if (!data) return null;
    const { reset, workspace, integration } = data;
    if (!workspace) return null;

    if (!integration || !integration.enabled) {
      await ctx.runMutation(
        internal.passwordReset.recordResetDeliveryFailure,
        {
          tokenId: args.tokenId,
          error: "No email integration configured",
        },
      );
      return null;
    }

    const resetLink = `https://praxtalk.com/reset-password/${args.token}`;
    const subject = `Reset your PraxTalk password`;
    const body =
      `Someone requested a password reset for your PraxTalk account on ${workspace.name}.\n\n` +
      `If this was you, set a new password here:\n${resetLink}\n\n` +
      `This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.\n\n` +
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
            To: reset.email,
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
            personalizations: [{ to: [{ email: reset.email }] }],
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
            to: reset.email,
            subject,
            text: body,
          }),
        });
        if (!res.ok) throw new Error(`Resend ${res.status}`);
      }
    } catch (err) {
      await ctx.runMutation(
        internal.passwordReset.recordResetDeliveryFailure,
        {
          tokenId: args.tokenId,
          error: err instanceof Error ? err.message : "Send failed",
        },
      );
    }
    return null;
  },
});

// ── Admin escape hatch ────────────────────────────────────────────────

/**
 * Internal mutation — set an operator's password directly by email.
 * Not exposed via the public API. Run with:
 *
 *   npx convex run --prod passwordReset:adminSetPasswordByEmail \
 *     '{"email":"you@example.com","newPassword":"newSecret123"}'
 *
 * Useful when:
 *   - The owner forgot their password AND no email integration is set up
 *     yet, so /forgot-password can't deliver a reset link.
 *   - You're rotating credentials in an emergency.
 *
 * Always invalidates all existing sessions for the operator.
 */
export const adminSetPasswordByEmail = internalMutation({
  args: { email: v.string(), newPassword: v.string() },
  returns: v.object({ operatorId: v.id("operators") }),
  handler: async (ctx, args) => {
    const email = args.email.trim().toLowerCase();
    if (args.newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    const operator = await ctx.db
      .query("operators")
      .withIndex("by_email", (q) => q.eq("email", email))
      .first();
    if (!operator) throw new Error(`No operator with email ${email}`);
    await ctx.db.patch(operator._id, {
      passwordHash: await hashPassword(args.newPassword),
    });
    const sessions = await ctx.db
      .query("sessions")
      .withIndex("by_operator", (q) => q.eq("operatorId", operator._id))
      .collect();
    for (const s of sessions) await ctx.db.delete(s._id);
    return { operatorId: operator._id };
  },
});

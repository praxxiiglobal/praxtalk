"use node";

import { v } from "convex/values";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { Id } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * SMTP+IMAP outbound + inbound for the "smtp_imap" email provider.
 * Lives in Node runtime because nodemailer + imapflow both pull in
 * Node-only crypto and net APIs.
 *
 * Outbound: sendOutboundForMessage builds an RFC822 message via
 * nodemailer, hits the customer's SMTP server with their stored creds.
 * Threading is preserved with In-Reply-To + References.
 *
 * Inbound: pollAllMailboxes runs every minute as a cron, picks up
 * every smtp_imap integration, fetches new messages (UID > stored
 * imapLastSeenUid), normalises to the same shape that the existing
 * recordInboundEmail mutation expects.
 */

export const sendOutboundForMessage = internalAction({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const data = await ctx.runQuery(
      internal.emailIntegrations.loadOutboundContext,
      { messageId: args.messageId },
    );
    if (!data) return null;
    const { message, conversation, visitor, integration } = data;
    if (integration.provider !== "smtp_imap") return null;
    if (!visitor.email) return null;
    if (!integration.smtpHost || !integration.smtpPort || !integration.smtpUser) {
      console.warn("[smtp] missing connection fields, skipping send");
      return null;
    }

    const transport = nodemailer.createTransport({
      host: integration.smtpHost,
      port: integration.smtpPort,
      secure: integration.smtpPort === 465, // SSL on 465; STARTTLS on 587
      auth: {
        user: integration.smtpUser,
        pass: integration.apiKey, // SMTP password (app password)
      },
    });

    const subject =
      conversation.emailThreadId && message.emailSubject
        ? message.emailSubject
        : (message.emailSubject ??
          (visitor.name ? `Re: conversation with ${visitor.name}` : "Re: support request"));

    try {
      const info = await transport.sendMail({
        from: integration.fromName
          ? `"${integration.fromName}" <${integration.fromAddress}>`
          : integration.fromAddress,
        to: visitor.email,
        subject,
        text: message.body,
        // Preserve threading so the customer's mail client groups it.
        inReplyTo: conversation.emailThreadId,
        references: conversation.emailThreadId
          ? [conversation.emailThreadId]
          : undefined,
      });
      // Stamp the SMTP-assigned Message-ID back onto the message so
      // future replies thread cleanly.
      if (info.messageId) {
        await ctx.runMutation(
          internal.emailIntegrations.recordOutboundDelivery,
          {
            messageId: args.messageId,
            providerMessageId: info.messageId,
            ok: true,
          },
        );
      }
    } catch (err) {
      console.warn("[smtp] send failed", err);
      await ctx.runMutation(
        internal.emailIntegrations.recordOutboundDelivery,
        {
          messageId: args.messageId,
          providerMessageId: undefined,
          ok: false,
          error: err instanceof Error ? err.message : "SMTP send failed",
        },
      );
    } finally {
      transport.close();
    }
    return null;
  },
});

/**
 * Cron entry — polls every smtp_imap mailbox in the system. Cheap
 * because most workspaces won't have one configured and the inner
 * fetch only pulls messages with UID > lastSeenUid (so steady-state
 * is "connect, list, disconnect" with zero downloads).
 */
export const pollAllMailboxes = internalAction({
  args: {},
  returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const integrations: Array<{
      _id: Id<"emailIntegrations">;
      workspaceId: Id<"workspaces">;
      operatorId: Id<"operators"> | null;
      imapHost: string;
      imapPort: number;
      smtpUser: string;
      apiKey: string;
      imapLastSeenUid: number;
    }> = await ctx.runQuery(internal.emailIntegrations.listSmtpImapForPolling);

    for (const integ of integrations) {
      try {
        await pollOne(ctx, integ);
      } catch (err) {
        console.warn(
          `[imap] poll failed for ${integ.smtpUser}`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    return null;
  },
});

type Integ = {
  _id: Id<"emailIntegrations">;
  workspaceId: Id<"workspaces">;
  operatorId: Id<"operators"> | null;
  imapHost: string;
  imapPort: number;
  smtpUser: string;
  apiKey: string;
  imapLastSeenUid: number;
};

async function pollOne(
  ctx: { runMutation: any },
  integ: Integ,
): Promise<void> {
  const client = new ImapFlow({
    host: integ.imapHost,
    port: integ.imapPort,
    secure: integ.imapPort === 993,
    auth: { user: integ.smtpUser, pass: integ.apiKey },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Fetch every message with UID strictly greater than what we
      // last saw. On first run lastSeenUid=0 so we pull everything;
      // we cap at 50 per cycle to bound work.
      const range = `${integ.imapLastSeenUid + 1}:*`;
      let highestUid = integ.imapLastSeenUid;
      let count = 0;
      for await (const msg of client.fetch(
        range,
        { uid: true, envelope: true, source: true },
        { uid: true },
      )) {
        if (count >= 50) break;
        count++;
        const uid = msg.uid;
        if (uid <= integ.imapLastSeenUid) continue;
        highestUid = Math.max(highestUid, uid);

        const env = msg.envelope;
        if (!env) continue;
        const fromAddr = env.from?.[0];
        if (!fromAddr?.address) continue;
        const messageIdHeader = env.messageId ?? undefined;
        const inReplyTo = env.inReplyTo ?? undefined;
        const subject = env.subject ?? undefined;

        // Pull just the text/plain body. `source` is the full RFC822
        // bytes; we extract a rough text body via header split. For
        // multipart messages this is good enough for chat-style
        // replies; richer parsing can come later.
        const body = extractTextBody(msg.source);
        if (!body) continue;

        await (ctx.runMutation as any)(
          internal.emailIntegrations.recordInboundEmail,
          {
            workspaceId: integ.workspaceId,
            assignToOperatorId: integ.operatorId ?? undefined,
            fromEmail: fromAddr.address,
            fromName: fromAddr.name ?? undefined,
            subject,
            body,
            messageId: messageIdHeader,
            inReplyTo,
          },
        );
      }
      if (highestUid > integ.imapLastSeenUid) {
        await (ctx.runMutation as any)(
          internal.emailIntegrations.updateImapCursor,
          { integrationId: integ._id, lastSeenUid: highestUid },
        );
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

function extractTextBody(source: Buffer | undefined): string {
  if (!source) return "";
  const raw = source.toString("utf8");
  // Find the first blank line separating headers from body.
  const split = raw.indexOf("\r\n\r\n");
  const bodyOnly = split >= 0 ? raw.slice(split + 4) : raw;
  // Multipart? Try to grab the text/plain part.
  const boundaryMatch = raw.match(
    /^Content-Type:\s*multipart\/[^;]+;\s*boundary="?([^";\r\n]+)"?/im,
  );
  if (boundaryMatch) {
    const boundary = boundaryMatch[1];
    const parts = bodyOnly.split(`--${boundary}`);
    for (const part of parts) {
      if (/Content-Type:\s*text\/plain/i.test(part)) {
        const innerSplit = part.indexOf("\r\n\r\n");
        if (innerSplit >= 0) return part.slice(innerSplit + 4).trim();
      }
    }
  }
  return bodyOnly.trim().slice(0, 8000);
}

"use node";

import { v } from "convex/values";
import webpush from "web-push";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Fan a payload out to every active subscription for a workspace.
 * Triggered when a visitor sends a message and we want to wake any
 * operators with browser push enabled.
 *
 * Lives in Node runtime (not V8) because the web-push library uses
 * Node-only crypto APIs internally for the VAPID JWT + ECE encryption.
 *
 * Failed deliveries with 404 / 410 mean the subscription is dead on
 * the push service's end — we delete the row. Other failures are
 * logged and swallowed; we don't want one bad endpoint to block the
 * fan-out.
 */
export const sendToWorkspace = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    title: v.string(),
    body: v.string(),
    url: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT ?? "mailto:hello@praxtalk.com";

    if (!publicKey || !privateKey) {
      // Push not configured — skip silently. The subscribe flow already
      // guards on getVapidPublicKey returning null, so dead-key calls
      // shouldn't normally land here.
      return null;
    }

    webpush.setVapidDetails(subject, publicKey, privateKey);

    const subs: Array<{
      _id: string;
      endpoint: string;
      p256dh: string;
      auth: string;
    }> = await ctx.runQuery(internal.pushSubscriptions._listForWorkspace, {
      workspaceId: args.workspaceId,
    });
    if (subs.length === 0) return null;

    const payload = JSON.stringify({
      title: args.title,
      body: args.body,
      url: args.url ?? "/app",
    });

    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            },
            payload,
            { TTL: 60 * 60 }, // 1 hour — drop if undelivered
          );
        } catch (err: unknown) {
          const status =
            err && typeof err === "object" && "statusCode" in err
              ? Number((err as { statusCode: unknown }).statusCode)
              : 0;
          if (status === 404 || status === 410) {
            // Dead subscription — clean up.
            await ctx.runMutation(
              internal.pushSubscriptions._deleteByEndpoint,
              { endpoint: s.endpoint },
            );
          } else {
            console.warn(
              `[push] failed (status=${status}) endpoint=${s.endpoint.slice(0, 60)}…`,
              err,
            );
          }
        }
      }),
    );
    return null;
  },
});

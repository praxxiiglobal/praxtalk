"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { readClientIp } from "@/lib/clientIp";
import { convexServer } from "@/lib/convexServer";
import { setSessionCookie } from "@/lib/session";
import { verifyTurnstile } from "@/lib/turnstile";

export type SetupState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function createWorkspaceAction(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  const workspaceName = String(formData.get("workspaceName") ?? "").trim();
  const ownerName = String(formData.get("ownerName") ?? "").trim();
  const ownerEmail = String(formData.get("ownerEmail") ?? "").trim();
  const ownerPassword = String(formData.get("ownerPassword") ?? "");
  // Bot-detection signals from the client. honeypot is a hidden
  // input no real user can see — non-empty means a naive bot
  // filled every field. formStartedAt is a hidden field stamped
  // when the form mounts; the server checks the elapsed time
  // before letting the signup through.
  const honeypot = String(formData.get("website") ?? "");
  const formStartedAtRaw = String(formData.get("formStartedAt") ?? "");
  const formStartedAt = Number(formStartedAtRaw);
  // Cloudflare Turnstile token (only set when the widget rendered;
  // i.e. NEXT_PUBLIC_TURNSTILE_SITE_KEY is configured). Server-side
  // verifyTurnstile no-ops when TURNSTILE_SECRET_KEY isn't set, so
  // the env can be wired progressively.
  const turnstileToken = String(formData.get("cf-turnstile-response") ?? "");

  if (!workspaceName || !ownerName || !ownerEmail || !ownerPassword) {
    return { status: "error", message: "All fields are required." };
  }
  if (ownerPassword.length < 8) {
    return { status: "error", message: "Password must be at least 8 characters." };
  }
  if (!ownerEmail.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  const ipAddress = readClientIp(await headers());

  const turnstile = await verifyTurnstile({
    token: turnstileToken,
    remoteIp: ipAddress,
  });
  if (!turnstile.ok) {
    return {
      status: "error",
      message: "Couldn't verify you're human — refresh and try again.",
    };
  }

  try {
    const result = await convexServer.mutation(api.workspaces.create, {
      workspaceName,
      ownerName,
      ownerEmail,
      ownerPassword,
      ipAddress,
      honeypot: honeypot || undefined,
      formStartedAt: Number.isFinite(formStartedAt)
        ? formStartedAt
        : undefined,
    });
    await setSessionCookie(result.sessionToken);
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not create workspace.";
    return { status: "error", message };
  }

  // Send the new owner to /app — the layout there gates pending_review
  // workspaces behind PendingReviewScreen, then drops them into the
  // dashboard once a platform admin approves. Never serve the embed
  // snippet inline here; it leaks the widgetId before review.
  redirect("/app");
}

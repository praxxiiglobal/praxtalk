"use server";

import { ConvexError } from "convex/values";
import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { setSessionCookie } from "@/lib/session";

export type ConfirmState =
  | { status: "idle" }
  | { status: "error"; message: string };

/**
 * Consume the email-verification token, materialise the workspace,
 * set the session cookie, redirect to /app. Called by a `<form>`
 * submit on /setup/confirm so the cookie write happens in a
 * non-Action route boundary that has access to next/headers.
 */
export async function confirmSignupAction(
  _prev: ConfirmState,
  formData: FormData,
): Promise<ConfirmState> {
  const token = String(formData.get("token") ?? "");
  if (!token) {
    return { status: "error", message: "Missing verification token." };
  }

  try {
    const result = await convexServer.mutation(api.workspaces.confirmSignup, {
      token,
    });
    await setSessionCookie(result.sessionToken);
  } catch (e) {
    const message =
      e instanceof ConvexError
        ? String(e.data)
        : e instanceof Error
          ? e.message
          : "Could not verify the link.";
    return { status: "error", message };
  }
  redirect("/app");
}

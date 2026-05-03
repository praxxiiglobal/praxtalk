"use server";

import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { setSessionCookie } from "@/lib/session";

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

  if (!workspaceName || !ownerName || !ownerEmail || !ownerPassword) {
    return { status: "error", message: "All fields are required." };
  }
  if (ownerPassword.length < 8) {
    return { status: "error", message: "Password must be at least 8 characters." };
  }
  if (!ownerEmail.includes("@")) {
    return { status: "error", message: "Enter a valid email address." };
  }

  try {
    const result = await convexServer.mutation(api.workspaces.create, {
      workspaceName,
      ownerName,
      ownerEmail,
      ownerPassword,
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

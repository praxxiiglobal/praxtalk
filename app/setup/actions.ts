"use server";

import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { setSessionCookie } from "@/lib/session";

export type SetupState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "ok"; workspaceSlug: string; widgetId: string };

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

    // Slug is derived deterministically from the name on the server, but
    // we don't have it in the response. Re-derive client-side display name
    // from the input. Slug isn't user-facing here so we just echo the name.
    return {
      status: "ok",
      workspaceSlug: workspaceName,
      widgetId: result.widgetId,
    };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not create workspace.";
    return { status: "error", message };
  }
}

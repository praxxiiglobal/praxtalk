"use server";

import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { setSessionCookie } from "@/lib/session";

export type AcceptInviteState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get("token") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!token || !name || !password) {
    return { status: "error", message: "All fields are required." };
  }

  let sessionToken: string;
  try {
    const result = await convexServer.mutation(api.invites.accept, {
      token,
      name,
      password,
    });
    sessionToken = result.sessionToken;
  } catch (e) {
    const message = e instanceof Error ? e.message : "Couldn't accept the invite.";
    return { status: "error", message };
  }

  await setSessionCookie(sessionToken);
  redirect("/app");
}

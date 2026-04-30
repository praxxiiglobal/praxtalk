"use server";

import { redirect } from "next/navigation";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { setSessionCookie } from "@/lib/session";

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function loginAction(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { status: "error", message: "Email and password are required." };
  }

  let sessionToken: string;
  try {
    const result = await convexServer.mutation(api.auth.login, {
      email,
      password,
    });
    sessionToken = result.sessionToken;
  } catch (e) {
    if (e instanceof ConvexError) {
      return { status: "error", message: String(e.data) };
    }
    return { status: "error", message: "Could not sign in. Please try again." };
  }

  await setSessionCookie(sessionToken);
  redirect("/app");
}

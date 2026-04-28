"use server";

import { redirect } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import {
  clearSessionCookie,
  readSessionToken,
} from "@/lib/session";

export async function logoutAction() {
  const token = await readSessionToken();
  if (token) {
    try {
      await convexServer.mutation(api.auth.logout, { sessionToken: token });
    } catch {
      // best-effort; we still clear the cookie locally
    }
  }
  await clearSessionCookie();
  redirect("/login");
}

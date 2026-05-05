"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";

const BINDING_COOKIE = "__Host-praxtalk_oauth_binding";
const BINDING_TTL_SECONDS = 5 * 60; // 5 minutes — comfortably exceeds OAuth flow time

/**
 * Click handler for "Connect Google" / "Connect Microsoft". Runs on
 * praxtalk.com, sets a binding cookie that the OAuth callback route
 * verifies, then redirects the browser to the provider's authorize
 * URL.
 *
 * Why we can't just call the Convex action from the React client:
 * Convex actions don't have access to the response object, so they
 * can't set httpOnly cookies. Setting the cookie on praxtalk.com is
 * what makes the binding strong — an attacker who observes the URL
 * `state` value can't forge the cookie.
 */
export async function startCalendarConnect(provider: "google" | "microsoft") {
  const sessionToken = await readSessionToken();
  if (!sessionToken) redirect("/login");

  let url: string;
  let bindingNonce: string;
  try {
    const result = await convexServer.action(api.calendarConnections.startOauth, {
      sessionToken,
      provider,
      useFinalize: true,
    });
    url = result.url;
    bindingNonce = result.bindingNonce;
  } catch (e) {
    const message =
      e instanceof ConvexError
        ? String(e.data)
        : "Couldn't start the OAuth flow. Please retry.";
    redirect(
      `/app/settings?calendar_error=${encodeURIComponent(message)}`,
    );
  }

  const store = await cookies();
  store.set(BINDING_COOKIE, bindingNonce, {
    httpOnly: true,
    secure: true,
    // sameSite=lax so the cookie still rides along on the top-level
    // GET redirect from the OAuth provider back to praxtalk.com.
    // Strict would block the callback request entirely.
    sameSite: "lax",
    path: "/",
    maxAge: BINDING_TTL_SECONDS,
  });

  redirect(url);
}

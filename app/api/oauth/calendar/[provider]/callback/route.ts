import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";

const BINDING_COOKIE = "__Host-praxtalk_oauth_binding";

/**
 * OAuth callback (praxtalk.com side). The OAuth provider redirects
 * here after the user authorises; we read the binding cookie that
 * was set when the flow started, hand it + the URL `code`/`state`
 * over to the Convex `finalizeOauthCallback` action, then clear the
 * cookie and bounce back to the dashboard.
 *
 * The binding cookie is what makes the state value unforgeable — an
 * attacker who observed only the URL params can't forge an httpOnly
 * cookie set on a different origin.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ provider: string }> },
) {
  const { provider } = await ctx.params;
  if (provider !== "google" && provider !== "microsoft") {
    return NextResponse.redirect(
      new URL(
        `/app/settings?calendar_error=${encodeURIComponent("Unknown provider")}`,
        req.url,
      ),
    );
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");
  const settingsUrl = new URL("/app/settings", req.url);

  // Always clear the binding cookie, success or fail — single-use.
  const cookieStore = await cookies();
  const bindingNonce = cookieStore.get(BINDING_COOKIE)?.value;
  cookieStore.delete(BINDING_COOKIE);

  if (errorParam || !code || !state) {
    settingsUrl.searchParams.set(
      "calendar_error",
      errorParam ?? "missing code or state",
    );
    return NextResponse.redirect(settingsUrl);
  }
  if (!bindingNonce) {
    // No binding cookie — either the flow was started outside the
    // praxtalk.com server action, or the cookie was stripped in
    // transit. Either way we refuse.
    settingsUrl.searchParams.set(
      "calendar_error",
      "Missing binding cookie — restart the connect flow",
    );
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const result = await convexServer.action(
      api.calendarConnections.finalizeOauthCallback,
      { state, code, bindingNonce, provider },
    );
    if (!result.ok) {
      settingsUrl.searchParams.set(
        "calendar_error",
        result.error ?? "Could not finalise the connection",
      );
      return NextResponse.redirect(settingsUrl);
    }
  } catch (e) {
    settingsUrl.searchParams.set(
      "calendar_error",
      e instanceof Error ? e.message : "Convex finalize action failed",
    );
    return NextResponse.redirect(settingsUrl);
  }

  settingsUrl.searchParams.set("calendar_ok", provider);
  return NextResponse.redirect(settingsUrl);
}

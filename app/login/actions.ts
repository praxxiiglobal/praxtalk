"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { setSessionCookie } from "@/lib/session";

export type LoginState =
  | { status: "idle" }
  | { status: "error"; message: string };

/**
 * Pull the device + location metadata Vercel injects into request
 * headers (and standard XFF). Used purely for admin session
 * visibility — never for auth decisions.
 */
async function readClientMeta() {
  const h = await headers();
  const xff = h.get("x-forwarded-for") ?? "";
  // x-forwarded-for can be a CSV like "1.2.3.4, 10.0.0.1" — left-most
  // entry is the original client.
  const ipAddress =
    xff.split(",")[0]?.trim() || h.get("x-real-ip") || undefined;
  const decode = (v: string | null) => {
    if (!v) return undefined;
    try {
      return decodeURIComponent(v);
    } catch {
      return v;
    }
  };
  return {
    userAgent: h.get("user-agent") ?? undefined,
    ipAddress: ipAddress || undefined,
    ipCountry: h.get("x-vercel-ip-country") ?? undefined,
    ipRegion: decode(h.get("x-vercel-ip-country-region")),
    ipCity: decode(h.get("x-vercel-ip-city")),
  };
}

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
    const meta = await readClientMeta();
    const result = await convexServer.mutation(api.auth.login, {
      email,
      password,
      ...meta,
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

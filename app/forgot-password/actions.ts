"use server";

import { headers } from "next/headers";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { readClientIp } from "@/lib/clientIp";
import { convexServer } from "@/lib/convexServer";

export type ForgotPasswordState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "sent"; email: string };

export async function requestPasswordResetAction(
  _prev: ForgotPasswordState,
  formData: FormData,
): Promise<ForgotPasswordState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) {
    return { status: "error", message: "Please enter your email." };
  }

  const ipAddress = readClientIp(await headers());

  try {
    await convexServer.mutation(api.passwordReset.request, {
      email,
      ipAddress,
    });
  } catch (e) {
    if (e instanceof ConvexError) {
      return { status: "error", message: String(e.data) };
    }
    return {
      status: "error",
      message: "Couldn't send the reset link. Please try again.",
    };
  }

  return { status: "sent", email };
}

"use server";

import { redirect } from "next/navigation";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";

export type ResetPasswordState =
  | { status: "idle" }
  | { status: "error"; message: string };

export async function resetPasswordAction(
  _prev: ResetPasswordState,
  formData: FormData,
): Promise<ResetPasswordState> {
  const token = String(formData.get("token") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    return { status: "error", message: "Missing reset token." };
  }
  if (newPassword.length < 8) {
    return {
      status: "error",
      message: "Password must be at least 8 characters.",
    };
  }
  if (newPassword !== confirm) {
    return { status: "error", message: "Passwords don't match." };
  }

  try {
    await convexServer.mutation(api.passwordReset.complete, {
      token,
      newPassword,
    });
  } catch (e) {
    if (e instanceof ConvexError) {
      return { status: "error", message: String(e.data) };
    }
    return {
      status: "error",
      message: "Couldn't reset your password. Please try again.",
    };
  }

  redirect("/login?reset=1");
}

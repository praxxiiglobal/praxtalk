import { redirect } from "next/navigation";

// Bare /reset-password has nothing to do without a token. Send the
// visitor to /forgot-password so they can request a fresh email
// instead of staring at a 404.
export default function ResetPasswordIndex(): never {
  redirect("/forgot-password");
}

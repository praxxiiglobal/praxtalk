import { redirect } from "next/navigation";

// Bare /invite has no token to claim. Send the visitor to /login —
// if they're an existing operator they're at the right place; if
// they're a brand-new invitee they should re-open the email link.
export default function InviteIndex(): never {
  redirect("/login");
}

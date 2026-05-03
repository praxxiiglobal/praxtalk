/**
 * Platform-admin allowlist — emails that can access the cross-tenant
 * /admin pages. This is NOT the same as workspace owner/admin roles
 * (those are per-tenant); platform admin sees every workspace.
 *
 * Set PLATFORM_ADMIN_EMAILS in Convex env to add more emails. Always
 * lowercased before compare. The hardcoded fallback covers the
 * founder so the panel works on a fresh prod deploy without env
 * setup.
 */
export function isPlatformAdmin(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  if (normalised === "praxxiiglobal@gmail.com") return true;
  const extra = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return extra.includes(normalised);
}

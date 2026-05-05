/**
 * Platform-admin allowlist — emails that can access the cross-tenant
 * /admin pages. This is NOT the same as workspace owner/admin roles
 * (those are per-tenant); platform admin sees every workspace.
 *
 * Set PLATFORM_ADMIN_EMAILS in Convex env (comma-separated). Always
 * lowercased before compare. The previous hardcoded fallback for
 * praxxiiglobal@gmail.com was removed — leaving an authoritative
 * email in source meant a personal-Gmail compromise would
 * immediately escalate to platform-admin even if the env var was
 * tightened. The env value MUST be set before this function is
 * useful; an empty env results in nobody being admin (deliberate
 * fail-closed).
 */
export function isPlatformAdmin(email: string): boolean {
  const normalised = email.trim().toLowerCase();
  const allowed = (process.env.PLATFORM_ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(normalised);
}

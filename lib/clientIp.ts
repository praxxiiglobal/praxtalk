import "server-only";
import type { ReadonlyHeaders } from "next/dist/server/web/spec-extension/adapters/headers";

/**
 * Extract the original client IP from a Next.js request's headers,
 * preferring Vercel's `x-real-ip` (set authoritatively by Vercel at
 * the function ingress) over `x-forwarded-for`'s leftmost entry.
 *
 * On Vercel both headers are set by the edge before the function
 * runs, so they're trustworthy. Off Vercel — or if a future
 * regression exposes the function via a non-edge route — neither
 * is signed. We accept that risk and document the dependency on
 * Vercel's edge proxy for these audit-log + rate-limit signals.
 *
 * Returns undefined when no header matches, so callers can decide
 * whether to fail-closed (refuse the request) or fail-open (skip
 * the rate-limit check, log the missing IP).
 */
export function readClientIp(
  h: ReadonlyHeaders | Headers,
): string | undefined {
  const get = (name: string) =>
    "get" in h ? (h.get(name) ?? undefined) : undefined;
  const real = get("x-real-ip");
  if (real && real.length > 0) return real.trim();
  const xff = get("x-forwarded-for") ?? "";
  // Vercel sets XFF as a CSV — leftmost is the original client.
  const left = xff.split(",")[0]?.trim();
  return left && left.length > 0 ? left : undefined;
}

import { NextResponse } from "next/server";

/**
 * CSP violation report endpoint. Browsers POST a JSON body conforming
 * to the CSP report spec when an inline script / external resource is
 * blocked by the policy. We log the report and return 204 — never
 * 5xx (browsers don't retry CSP reports anyway, but keeps logs clean).
 *
 * Hardening:
 *   - 8 KB body cap. Real CSP reports are <2 KB; anything larger is
 *     someone trying to flood Vercel function logs.
 *   - Per-IP token bucket scoped to this Edge instance. Cross-region
 *     coordination would need Upstash; the per-instance cap is
 *     "good enough" since each region has its own attacker budget.
 */
export const runtime = "edge";

const MAX_BODY_BYTES = 8 * 1024;
const WINDOW_MS = 60_000;
const REPORTS_PER_WINDOW = 60; // 60 reports per minute per IP per Edge instance

type Bucket = { windowStart: number; count: number };
const buckets = new Map<string, Bucket>();

function take(ip: string): boolean {
  const now = Date.now();
  const start = Math.floor(now / WINDOW_MS) * WINDOW_MS;
  const existing = buckets.get(ip);
  if (!existing || existing.windowStart !== start) {
    buckets.set(ip, { windowStart: start, count: 1 });
    // Cheap GC so the Map doesn't grow unbounded on rotating attacker IPs.
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) {
        if (v.windowStart !== start) buckets.delete(k);
      }
    }
    return true;
  }
  if (existing.count >= REPORTS_PER_WINDOW) return false;
  existing.count += 1;
  return true;
}

function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip");
  if (real && real.trim()) return real.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return "unknown";
}

export async function POST(req: Request) {
  // Bound body size before reading. Most Edge runtimes don't enforce
  // a generous default; an attacker sending GB streams can otherwise
  // pin the runtime.
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) {
    return new NextResponse(null, { status: 413 });
  }

  if (!take(clientIp(req))) {
    return new NextResponse(null, { status: 429 });
  }

  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) {
      // Server didn't honour the content-length header; truncate
      // before logging.
      console.warn("[csp]", text.slice(0, MAX_BODY_BYTES) + "…[truncated]");
    } else {
      // Body shape varies across browsers — Chromium and Firefox both
      // use { "csp-report": { ... } }. Just log the raw text so we
      // don't lose nested fields.
      console.warn("[csp]", text);
    }
  } catch {
    // Don't let a malformed body 5xx the report endpoint.
  }
  return new NextResponse(null, { status: 204 });
}

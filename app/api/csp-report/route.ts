import { NextResponse } from "next/server";

/**
 * CSP violation report endpoint. Browsers POST a JSON body conforming
 * to the CSP report spec when an inline script / external resource is
 * blocked by the policy. We log the report and return 204 — never
 * 5xx (browsers don't retry CSP reports anyway, but keeps logs clean).
 *
 * In production these reports flow into Vercel function logs. To pipe
 * them into Sentry / Datadog later, swap the console.warn for a
 * fetch to the destination.
 */
export const runtime = "edge";

export async function POST(req: Request) {
  try {
    const text = await req.text();
    // Body shape varies across browsers — Chromium uses
    // { "csp-report": { ... } }, Firefox does the same. Just log the
    // raw text so we don't lose nested fields.
    console.warn("[csp]", text);
  } catch {
    // Don't let a malformed body 5xx the report endpoint.
  }
  return new NextResponse(null, { status: 204 });
}

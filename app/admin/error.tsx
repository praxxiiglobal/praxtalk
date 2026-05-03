"use client";

import Link from "next/link";

/**
 * Catches any uncaught error in /admin/* — server-side render
 * crashes, client component throws, anything. Without this,
 * Next.js's default 500 page shows and Vercel might serve a
 * bare error response that Chrome renders as a generic
 * "This page couldn't load" with no actionable detail.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-300/40 bg-red-50/30 p-5">
      <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-red-700">
        Something failed
      </div>
      <pre className="mt-2 whitespace-pre-wrap break-all text-[12.5px] text-red-900">
        {error.message}
        {error.digest ? `\n\ndigest: ${error.digest}` : ""}
      </pre>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition"
        >
          Try again
        </button>
        <Link
          href="/admin/workspaces"
          className="inline-flex h-9 items-center rounded-full border border-rule-2 bg-paper px-4 text-[13px] font-medium text-ink transition hover:bg-paper-2"
        >
          Back to workspaces
        </Link>
      </div>
      <p className="mt-4 text-[12px] text-muted">
        If this keeps happening: the most common fix is to run{" "}
        <code>npx convex deploy --yes</code> from a local checkout —
        that force-pushes the current schema + functions to prod.
      </p>
    </div>
  );
}

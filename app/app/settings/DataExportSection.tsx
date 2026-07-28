"use client";

import { useDashboardAuth } from "../_components/DashboardShell";

/**
 * Self-serve export — workspace owners + admins can download their
 * full workspace data on demand. Gated UI-side too (the route +
 * Convex query also enforce owner/admin), so agents see explanatory
 * copy instead of a button they can't use.
 */
export function DataExportSection() {
  const { operator } = useDashboardAuth();
  const canExport = operator.role !== "agent";

  if (!canExport) {
    return (
      <p className="text-sm text-muted">
        Only workspace owners and admins can export workspace data. Ask
        your owner to download the file if you need it.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm leading-relaxed text-muted">
        Download a complete JSON dump of every record in your
        workspace — brands, operators, conversations, messages,
        bookings, integrations config, audit log, the lot. Use it to
        back up, migrate to another tool, or satisfy a data-portability
        request from your customers.
      </p>
      <ul className="ml-4 list-disc text-[12.5px] leading-relaxed text-muted">
        <li>
          Sensitive secrets (passwords, OAuth tokens, API keys, webhook
          signing secrets) are stripped — re-issue them from settings if
          you need them.
        </li>
        <li>
          Large workspaces stream up to 1M messages per file. If you have
          more, email <a href="mailto:hello@praxtalk.com" className="underline-offset-2 hover:underline">hello@praxtalk.com</a>.
        </li>
        <li>
          The download starts immediately — no email link, no waiting
          queue.
        </li>
      </ul>
      <a
        href="/app/export.json"
        download
        className="inline-flex h-9 w-fit items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px"
      >
        Download workspace export (JSON) ↓
      </a>
    </div>
  );
}

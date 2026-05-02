"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";

export function CallsView() {
  const { sessionToken } = useDashboardAuth();
  const calls = useQuery(api.voiceIntegrations.listCallHistory, {
    sessionToken,
  });

  if (calls === undefined) {
    return (
      <Card title="">
        <div className="py-8 text-center text-xs text-muted">Loading…</div>
      </Card>
    );
  }
  if (calls.length === 0) {
    return (
      <Card title="No calls yet">
        <p className="text-sm text-muted">
          When a customer rings your voice number, or you dial out from the
          dial pad, the call lands here. Use the 📞 button in the top bar to
          place an outbound call.
        </p>
      </Card>
    );
  }

  return (
    <Card title={`${calls.length} ${calls.length === 1 ? "call" : "calls"}`}>
      <ul className="-mx-3 -my-2 divide-y divide-rule">
        {calls.map((c) => (
          <li key={c._id}>
            <Link
              href={`/app?conversation=${c._id}`}
              className="flex items-center gap-4 px-3 py-3 transition hover:bg-paper-2"
            >
              <div className="flex size-9 items-center justify-center rounded-full bg-paper-2 font-mono text-[12px] uppercase text-ink">
                {(c.visitor?.name ?? c.visitor?.phone ?? "?")
                  .charAt(0)
                  .toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-[13.5px] font-medium tracking-[-0.01em]">
                    {c.visitor?.name ?? c.visitor?.phone ?? "Unknown caller"}
                  </span>
                  <StatusPill status={c.status} />
                </div>
                {c.lastMessage ? (
                  <div className="mt-0.5 line-clamp-1 text-[12px] text-muted">
                    {c.lastMessage.body}
                  </div>
                ) : null}
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                {timeAgo(c.lastMessageAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "open"
      ? "bg-good/15 text-good"
      : status === "resolved"
        ? "bg-paper-2 text-muted"
        : status === "snoozed"
          ? "bg-yellow-100 text-yellow-800"
          : "bg-paper-2 text-muted";
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] ${cls}`}
    >
      {status}
    </span>
  );
}

function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}

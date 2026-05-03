"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

const STATUSES = ["pending", "sent", "failed", "cancelled"] as const;

const CHANNEL_LABEL: Record<string, string> = {
  chat: "💬 Chat",
  email: "✉ Email",
  sms: "📱 SMS",
  whatsapp: "🟢 WhatsApp",
  voice: "📞 Voice",
};

export function RemindersView() {
  const { sessionToken } = useDashboardAuth();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const reminders = useQuery(api.reminders.listForWorkspace, {
    sessionToken,
    status,
  });
  const cancel = useMutation(api.reminders.cancel);

  return (
    <Card title="">
      <div className="mb-3 flex items-center gap-1 border-b border-rule pb-3">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={cn(
              "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition",
              status === s
                ? "bg-ink text-paper"
                : "text-muted hover:text-ink",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {reminders === undefined ? (
        <div className="py-8 text-center text-xs text-muted">Loading…</div>
      ) : reminders.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted">
          No {status} reminders.
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {reminders.map((r) => (
            <li
              key={r._id}
              className="flex items-start justify-between gap-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                    {CHANNEL_LABEL[r.channel] ?? r.channel}
                  </span>
                  <Link
                    href={`/app?conversation=${r.conversationId}`}
                    className="text-[13px] font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {r.visitorName ?? "Visitor"}
                  </Link>
                  <span className="font-mono text-[10px] text-muted">
                    {whenLabel(r.sendAt, r.status === "sent" ? r.sentAt : null)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] text-ink">
                  {r.body}
                </p>
                {r.error && (
                  <div className="mt-1 text-[11px] text-red-700">
                    {r.error}
                  </div>
                )}
              </div>
              {r.status === "pending" && (
                <button
                  type="button"
                  onClick={() => cancel({ sessionToken, reminderId: r._id })}
                  className="shrink-0 rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-ink"
                >
                  Cancel
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function whenLabel(sendAt: number, sentAt: number | null): string {
  const ref = sentAt ?? sendAt;
  const d = new Date(ref);
  const now = Date.now();
  const diff = sendAt - now;
  if (sentAt) return `sent ${d.toLocaleString()}`;
  if (diff < 0) return `overdue · ${d.toLocaleString()}`;
  if (diff < 60_000) return `in <1 min`;
  if (diff < 3_600_000) return `in ${Math.round(diff / 60_000)} min`;
  if (diff < 86_400_000) return `in ${Math.round(diff / 3_600_000)} h`;
  return d.toLocaleString();
}

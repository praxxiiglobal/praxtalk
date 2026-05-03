"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
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
  internal: "🔔 Personal",
};

export function RemindersView() {
  const { sessionToken } = useDashboardAuth();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("pending");
  const [creating, setCreating] = useState(false);
  const reminders = useQuery(api.reminders.listForWorkspace, {
    sessionToken,
    status,
  });
  const cancel = useMutation(api.reminders.cancel);

  return (
    <Card title="">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-rule pb-3">
        <div className="flex items-center gap-1">
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
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-[11px] font-medium text-paper transition hover:-translate-y-px"
        >
          + Manual reminder
        </button>
      </div>

      {creating && (
        <ManualReminderModal onClose={() => setCreating(false)} />
      )}

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
                  {r.conversationId ? (
                    <Link
                      href={`/app?conversation=${r.conversationId}`}
                      className="text-[13px] font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {r.visitorName ?? "Visitor"}
                    </Link>
                  ) : (
                    <span className="text-[13px] font-medium text-ink">
                      Personal reminder
                    </span>
                  )}
                  <span className="font-mono text-[10px] text-muted">
                    {whenLabel(r.sendAt, r.status === "sent" ? r.sentAt : null)}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[13px] text-ink">
                  {r.body}
                </p>
                {r.remarks && (
                  <div className="mt-1 rounded-md bg-paper-2/40 px-2 py-1 text-[11px] text-muted">
                    📝 {r.remarks}
                  </div>
                )}
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

function ManualReminderModal({ onClose }: { onClose: () => void }) {
  const { sessionToken } = useDashboardAuth();
  const schedule = useMutation(api.reminders.scheduleManual);

  const [body, setBody] = useState("");
  const [remarks, setRemarks] = useState("");
  const [whenISO, setWhenISO] = useState(() => isoLocalIn(60));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const onSchedule = async () => {
    setBusy(true);
    setError(null);
    try {
      await schedule({
        sessionToken,
        sendAt: new Date(whenISO).getTime(),
        body: body.trim(),
        remarks: remarks.trim() || undefined,
      });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't schedule.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 pt-12 pb-8"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[440px] rounded-2xl border border-rule bg-paper p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-[-0.01em]">
            🔔 Add manual reminder
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        <p className="mb-3 text-[11.5px] leading-[1.4] text-muted">
          Personal reminder for you — fires as a browser push at the
          chosen time + shows up in this list. No conversation or
          customer needed.
        </p>

        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            What to remind yourself
          </div>
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Follow up with Acme on the contract"
            autoFocus
            className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13.5px] outline-none focus:border-ink"
          />
        </div>

        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            When
          </div>
          <input
            type="datetime-local"
            value={whenISO}
            onChange={(e) => setWhenISO(e.target.value)}
            className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { label: "+15 min", min: 15 },
              { label: "+1 hour", min: 60 },
              { label: "+4 hours", min: 240 },
              { label: "+1 day", min: 1440 },
              { label: "+1 week", min: 10080 },
            ].map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => setWhenISO(isoLocalIn(p.min))}
                className="rounded-full border border-rule-2 px-2.5 py-1 text-[11px] text-muted hover:text-ink"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Remarks (optional)
          </div>
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Additional context — links, follow-up details, etc."
            rows={2}
            className="w-full resize-none rounded-xl border border-rule-2 bg-paper-2/40 px-3 py-2 text-[13px] outline-none focus:border-ink"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-2 text-[12px] text-red-900"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={onSchedule}
          disabled={busy || !body.trim()}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-ink text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
        >
          {busy ? "Scheduling…" : "Schedule reminder"}
        </button>
      </div>
    </div>
  );
}

function isoLocalIn(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

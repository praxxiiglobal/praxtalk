"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

type Channel = "chat" | "email" | "sms" | "whatsapp" | "voice";

const CHANNELS: { value: Channel; label: string; icon: string }[] = [
  { value: "chat", label: "Chat", icon: "💬" },
  { value: "email", label: "Email", icon: "✉" },
  { value: "sms", label: "SMS", icon: "📱" },
  { value: "whatsapp", label: "WhatsApp", icon: "🟢" },
  { value: "voice", label: "Voice", icon: "📞" },
];

const PRESETS: { label: string; minutes: number }[] = [
  { label: "+15 min", minutes: 15 },
  { label: "+1 hour", minutes: 60 },
  { label: "+4 hours", minutes: 4 * 60 },
  { label: "Tomorrow 9am", minutes: -1 }, // sentinel — handled below
  { label: "+3 days", minutes: 3 * 24 * 60 },
];

export function ReminderModal({
  conversationId,
  conversationChannel,
  onClose,
}: {
  conversationId: Id<"conversations">;
  conversationChannel: Channel | "web_chat";
  onClose: () => void;
}) {
  const { sessionToken } = useDashboardAuth();
  const schedule = useMutation(api.reminders.schedule);
  const cancel = useMutation(api.reminders.cancel);
  const existing = useQuery(api.reminders.listForConversation, {
    sessionToken,
    conversationId,
  });

  // Default channel = the conversation's own channel where it makes
  // sense, falling back to chat. Voice/whatsapp need extra setup so
  // we don't auto-pick them.
  const defaultChannel: Channel =
    conversationChannel === "email" || conversationChannel === "sms"
      ? conversationChannel
      : "chat";

  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [body, setBody] = useState("");
  const [whenISO, setWhenISO] = useState(() => isoLocalIn(15));
  const [whatsappTemplate, setWhatsappTemplate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const applyPreset = (mins: number) => {
    if (mins === -1) {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      setWhenISO(toIsoLocal(d));
    } else {
      setWhenISO(isoLocalIn(mins));
    }
  };

  const onSchedule = async () => {
    setBusy(true);
    setError(null);
    try {
      const sendAt = new Date(whenISO).getTime();
      await schedule({
        sessionToken,
        conversationId,
        channel,
        sendAt,
        body: body.trim(),
        whatsappTemplateName:
          channel === "whatsapp" ? whatsappTemplate.trim() || undefined : undefined,
      });
      setBody("");
      setError(null);
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
        className="w-full max-w-[480px] rounded-2xl border border-rule bg-paper p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-[-0.01em]">
            Schedule reminder
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

        {/* Channel picker */}
        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Channel
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setChannel(c.value)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] transition",
                  channel === c.value
                    ? "border-ink bg-ink text-paper"
                    : "border-rule-2 text-muted hover:text-ink",
                )}
              >
                <span>{c.icon}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* When */}
        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Send at
          </div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p.minutes)}
                className="rounded-full border border-rule-2 px-2.5 py-1 text-[11px] text-muted hover:text-ink"
              >
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="datetime-local"
            value={whenISO}
            onChange={(e) => setWhenISO(e.target.value)}
            className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
          />
        </div>

        {/* Body */}
        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Message
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              channel === "chat"
                ? "Hey, just checking in on this — let us know how it's going."
                : "Following up on our conversation…"
            }
            rows={3}
            className="w-full resize-none rounded-xl border border-rule-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink"
          />
        </div>

        {channel === "whatsapp" && (
          <div className="mb-3">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              Approved WhatsApp template name
            </div>
            <input
              type="text"
              value={whatsappTemplate}
              onChange={(e) => setWhatsappTemplate(e.target.value)}
              placeholder="reminder_followup_v1"
              className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
            />
            <p className="mt-1 text-[10.5px] text-muted">
              Required outside the 24h customer-service-window. Template
              must already be approved by Meta.
            </p>
          </div>
        )}

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
          disabled={busy || !body.trim() || !whenISO}
          className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-ink text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
        >
          {busy ? "Scheduling…" : "Schedule reminder"}
        </button>

        {existing && existing.length > 0 && (
          <div className="mt-5 border-t border-rule pt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              Already scheduled for this conversation
            </div>
            <ul className="flex flex-col gap-2">
              {existing.map((r) => (
                <li
                  key={r._id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-rule px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                      {r.channel} ·{" "}
                      <span
                        className={
                          r.status === "pending"
                            ? "text-good"
                            : r.status === "sent"
                              ? "text-ink"
                              : r.status === "failed"
                                ? "text-red-700"
                                : "text-muted"
                        }
                      >
                        {r.status}
                      </span>{" "}
                      · {new Date(r.sendAt).toLocaleString()}
                    </div>
                    <div className="line-clamp-2 text-[12px] text-ink">
                      {r.body}
                    </div>
                  </div>
                  {r.status === "pending" && (
                    <button
                      type="button"
                      onClick={() => cancel({ sessionToken, reminderId: r._id })}
                      className="shrink-0 rounded-full border border-rule-2 px-2 py-0.5 text-[10px] text-muted hover:text-ink"
                    >
                      Cancel
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function isoLocalIn(mins: number): string {
  const d = new Date(Date.now() + mins * 60_000);
  return toIsoLocal(d);
}
function toIsoLocal(d: Date): string {
  // datetime-local needs YYYY-MM-DDTHH:MM in local time
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../_components/DashboardShell";
import { Card } from "../_components/PageHeader";
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
                  ) : r.contactName || r.contactPhone ? (
                    <span className="text-[13px] font-medium text-ink">
                      {r.contactName ?? "Personal reminder"}
                      {r.contactPhone && (
                        <a
                          href={`tel:${r.contactPhone}`}
                          className="ml-2 font-mono text-[11px] text-muted underline-offset-2 hover:text-ink hover:underline"
                        >
                          {r.contactPhone}
                        </a>
                      )}
                    </span>
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

// Common country dial codes — covers the geographies we hear from
// most. The select stores the dial code (e.g. "+91"); the rendered
// text shows flag + label so operators don't have to memorise codes.
const COUNTRY_CODES: { code: string; label: string }[] = [
  { code: "+91", label: "🇮🇳 India (+91)" },
  { code: "+1", label: "🇺🇸 US/Canada (+1)" },
  { code: "+44", label: "🇬🇧 UK (+44)" },
  { code: "+61", label: "🇦🇺 Australia (+61)" },
  { code: "+971", label: "🇦🇪 UAE (+971)" },
  { code: "+966", label: "🇸🇦 Saudi Arabia (+966)" },
  { code: "+65", label: "🇸🇬 Singapore (+65)" },
  { code: "+49", label: "🇩🇪 Germany (+49)" },
  { code: "+33", label: "🇫🇷 France (+33)" },
  { code: "+34", label: "🇪🇸 Spain (+34)" },
  { code: "+39", label: "🇮🇹 Italy (+39)" },
  { code: "+31", label: "🇳🇱 Netherlands (+31)" },
  { code: "+46", label: "🇸🇪 Sweden (+46)" },
  { code: "+41", label: "🇨🇭 Switzerland (+41)" },
  { code: "+81", label: "🇯🇵 Japan (+81)" },
  { code: "+82", label: "🇰🇷 South Korea (+82)" },
  { code: "+86", label: "🇨🇳 China (+86)" },
  { code: "+852", label: "🇭🇰 Hong Kong (+852)" },
  { code: "+60", label: "🇲🇾 Malaysia (+60)" },
  { code: "+62", label: "🇮🇩 Indonesia (+62)" },
  { code: "+63", label: "🇵🇭 Philippines (+63)" },
  { code: "+66", label: "🇹🇭 Thailand (+66)" },
  { code: "+880", label: "🇧🇩 Bangladesh (+880)" },
  { code: "+92", label: "🇵🇰 Pakistan (+92)" },
  { code: "+94", label: "🇱🇰 Sri Lanka (+94)" },
  { code: "+27", label: "🇿🇦 South Africa (+27)" },
  { code: "+234", label: "🇳🇬 Nigeria (+234)" },
  { code: "+254", label: "🇰🇪 Kenya (+254)" },
  { code: "+20", label: "🇪🇬 Egypt (+20)" },
  { code: "+55", label: "🇧🇷 Brazil (+55)" },
  { code: "+52", label: "🇲🇽 Mexico (+52)" },
  { code: "+54", label: "🇦🇷 Argentina (+54)" },
];

function ManualReminderModal({ onClose }: { onClose: () => void }) {
  const { sessionToken } = useDashboardAuth();
  const schedule = useMutation(api.reminders.scheduleManual);

  const [body, setBody] = useState("");
  const [remarks, setRemarks] = useState("");
  const [whenISO, setWhenISO] = useState(() => isoLocalIn(60));
  const [contactName, setContactName] = useState("");
  const [countryCode, setCountryCode] = useState("+91");
  const [phoneNumber, setPhoneNumber] = useState("");
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
    // Strip everything except digits from the local part so the saved
    // phone is always `<dialCode><digits>` regardless of how the
    // operator typed it (spaces, hyphens, parentheses all welcome).
    const digits = phoneNumber.replace(/\D+/g, "");
    const fullPhone = digits ? `${countryCode}${digits}` : "";
    try {
      await schedule({
        sessionToken,
        sendAt: new Date(whenISO).getTime(),
        body: body.trim(),
        remarks: remarks.trim() || undefined,
        contactName: contactName.trim() || undefined,
        contactPhone: fullPhone || undefined,
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
          chosen time + shows up in this list. Add a contact name and
          phone (optional) if it&apos;s a follow-up about a specific
          person.
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
            Contact name (optional)
          </div>
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="John Smith"
            className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13.5px] outline-none focus:border-ink"
          />
        </div>

        <div className="mb-3">
          <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Phone number (optional)
          </div>
          <div className="flex gap-2">
            <select
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              className="h-10 w-[140px] shrink-0 rounded-xl border border-rule-2 bg-paper px-2 text-[13px] outline-none focus:border-ink"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
              placeholder="9876543210"
              inputMode="tel"
              className="h-10 w-full flex-1 rounded-xl border border-rule-2 bg-paper px-3 text-[13.5px] outline-none focus:border-ink"
            />
          </div>
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

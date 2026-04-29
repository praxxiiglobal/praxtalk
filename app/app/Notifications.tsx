"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

/**
 * Notifications bell — lives in the Topbar. Subscribes to
 * `notifications.summary`, surfaces new visitor messages with:
 *   1. Badge count on the bell
 *   2. Dropdown of the most recent unread conversations
 *   3. Browser Notification (when document.hidden + permission granted)
 *   4. Optional sound (uses an embedded base64 PCM blip — no asset)
 *
 * Reactive: Convex websocket pushes new state into `summary` whenever
 * a `messages.created` event lands; the diff against the previous
 * snapshot drives the OS notification.
 */
export function NotificationsBell() {
  const { sessionToken } = useDashboardAuth();
  const summary = useQuery(api.notifications.summary, { sessionToken });
  const markAllRead = useMutation(api.notifications.markAllRead);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const previousIds = useRef<Set<string>>(new Set());
  const hasInitialised = useRef(false);
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "default",
  );

  // Close dropdown on click-outside.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Diff incoming notifications against what we've already shown so we
  // only fire OS-level toasts for *new* arrivals.
  useEffect(() => {
    if (!summary) return;
    const currentIds = new Set(
      summary.recent.map((r) => String(r.conversationId)),
    );

    if (!hasInitialised.current) {
      // First load — don't pop a notification for every existing
      // unread row, just remember them.
      previousIds.current = currentIds;
      hasInitialised.current = true;
      return;
    }

    const newIds = [...currentIds].filter(
      (id) => !previousIds.current.has(id),
    );
    previousIds.current = currentIds;
    if (newIds.length === 0) return;

    // Sound — short blip generated via Web Audio so we don't ship an asset.
    playBlip();

    // Browser Notification — only when window is hidden so we don't
    // pop redundant OS toasts on top of the in-page bell.
    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible" &&
      permission === "granted"
    ) {
      for (const id of newIds) {
        const row = summary.recent.find((r) => String(r.conversationId) === id);
        if (!row) continue;
        try {
          const n = new Notification(
            row.brandName ? `${row.brandName} · new message` : "New message",
            {
              body: `${row.visitorName} on ${channelLabel(row.channel)}`,
              tag: id,
              icon: "/praxtalk-logo.png",
            },
          );
          n.onclick = () => {
            window.focus();
            window.location.href = "/app";
            n.close();
          };
        } catch {
          /* permissions revoked between gate and call */
        }
      }
    }
  }, [summary, permission]);

  const requestPermission = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setPermission(result);
  };

  const onMarkAllRead = async () => {
    await markAllRead({ sessionToken });
  };

  const count = summary?.unreadCount ?? 0;
  const showCount = count > 0;
  const recent = summary?.recent ?? [];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={
          showCount ? `${count} unread conversations` : "Notifications"
        }
        aria-expanded={open}
        className="relative inline-flex size-9 items-center justify-center rounded-full border border-rule-2 bg-paper text-ink transition hover:-translate-y-px"
      >
        <BellIcon ringing={showCount} />
        {showCount ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-warn px-1.5 font-mono text-[10px] font-semibold text-ink">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-[320px] overflow-hidden rounded-xl border border-rule bg-paper shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              Inbox
            </span>
            {showCount ? (
              <button
                type="button"
                onClick={onMarkAllRead}
                className="text-[11px] font-medium text-ink underline-offset-2 hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          {permission === "default" && typeof Notification !== "undefined" ? (
            <button
              type="button"
              onClick={requestPermission}
              className="block w-full border-b border-rule bg-accent-soft/40 px-4 py-2.5 text-left text-[12px] text-ink hover:bg-accent-soft/60"
            >
              Enable browser notifications →
            </button>
          ) : null}

          {recent.length === 0 ? (
            <div className="px-4 py-6 text-center text-[12px] text-muted">
              {count === 0
                ? "All caught up. New conversations will show up here."
                : "Loading…"}
            </div>
          ) : (
            <ul className="divide-y divide-rule">
              {recent.map((r) => (
                <li key={r.conversationId}>
                  <a
                    href="/app"
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 transition hover:bg-paper-2"
                  >
                    <span
                      className="mt-1 size-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor: r.brandColor ?? "var(--color-rule-2)",
                      }}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">
                          {r.visitorName}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 truncate font-mono text-[11px] text-muted">
                        {r.brandName ? <span>{r.brandName}</span> : null}
                        {r.brandName ? <span>·</span> : null}
                        <span>{channelLabel(r.channel)}</span>
                        <span>·</span>
                        <span>{timeAgo(r.lastMessageAt)}</span>
                      </div>
                    </div>
                  </a>
                </li>
              ))}
            </ul>
          )}

          <a
            href="/app"
            className="block border-t border-rule bg-paper-2/40 px-4 py-2.5 text-center text-[12px] font-medium text-ink hover:bg-paper-2"
          >
            Open inbox →
          </a>
        </div>
      ) : null}
    </div>
  );
}

function BellIcon({ ringing }: { ringing?: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(
        "transition-transform",
        ringing ? "origin-top animate-[wiggle_1.6s_ease-in-out_infinite]" : "",
      )}
    >
      <path d="M3 11h10l-1.2-2.4V6a3.8 3.8 0 0 0-7.6 0v2.6L3 11z" />
      <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
    </svg>
  );
}

function channelLabel(c: string): string {
  switch (c) {
    case "email":
      return "Email";
    case "whatsapp":
      return "WhatsApp";
    case "voice":
      return "Voice";
    default:
      return "Web chat";
  }
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

// ── Sound ─────────────────────────────────────────────────────────────
//
// Generates a short two-tone blip via Web Audio. No asset, no preload,
// no autoplay-policy issues (fires only after a user gesture has
// landed earlier in the session, which is true any time the operator
// is actually in the dashboard).

let _audioCtx: AudioContext | null = null;
function playBlip() {
  if (typeof window === "undefined") return;
  try {
    _audioCtx ??= new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext)();
    const ctx = _audioCtx;
    const now = ctx.currentTime;
    const note = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.18, now + start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };
    note(660, 0, 0.12);
    note(880, 0.12, 0.16);
  } catch {
    /* audio unavailable — silent failure */
  }
}

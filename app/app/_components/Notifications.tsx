"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

/**
 * Topbar bell — unified feed of:
 *   - chat unreads (kind === "chat")
 *   - activity events (lead_created, webhook_failed, email_failed,
 *     atlas_error, brand_created, operator_added, api_key_created,
 *     system, conversation_assigned)
 *
 * Reactive via Convex: when any producer pushes a new notification or
 * a new visitor message lands, the dropdown re-renders and (when the
 * tab is hidden + permission granted) fires a browser Notification.
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
    const currentIds = new Set(summary.recent.map((r) => r.id));

    if (!hasInitialised.current) {
      previousIds.current = currentIds;
      hasInitialised.current = true;
      return;
    }

    const newIds = [...currentIds].filter(
      (id) => !previousIds.current.has(id),
    );
    previousIds.current = currentIds;
    if (newIds.length === 0) return;

    playBlip();

    if (
      typeof document !== "undefined" &&
      document.visibilityState !== "visible" &&
      permission === "granted"
    ) {
      for (const id of newIds) {
        const row = summary.recent.find((r) => r.id === id);
        if (!row) continue;
        try {
          const n = new Notification(row.title, {
            body: row.body ?? kindLabel(row.kind),
            tag: id,
            icon: "/praxtalk-logo.png",
          });
          n.onclick = () => {
            window.focus();
            window.location.href = row.link ?? "/app";
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
          showCount ? `${count} unread notifications` : "Notifications"
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
          className="absolute right-0 top-full z-30 mt-2 w-[360px] overflow-hidden rounded-xl border border-rule bg-paper shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-rule px-4 py-3">
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
              Notifications
              {summary
                ? ` · ${summary.chatUnreadCount} chat · ${summary.activityUnreadCount} activity`
                : null}
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
              All caught up. New events show up here.
            </div>
          ) : (
            <ul className="max-h-[420px] divide-y divide-rule overflow-y-auto">
              {recent.map((r) => (
                <li key={r.id}>
                  <Link
                    href={r.link ?? "/app"}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-3 px-4 py-3 transition hover:bg-paper-2"
                  >
                    <NotificationGlyph
                      kind={r.kind}
                      severity={r.severity}
                      brandColor={r.brandColor}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium text-ink">
                          {r.title}
                        </span>
                        {r.readAt === null ? (
                          <span className="size-1.5 shrink-0 rounded-full bg-warn" />
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2 truncate font-mono text-[11px] text-muted">
                        <span>{kindLabel(r.kind)}</span>
                        {r.body ? (
                          <>
                            <span>·</span>
                            <span className="truncate">{r.body}</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>{timeAgo(r.createdAt)}</span>
                      </div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/app/notifications"
            className="block border-t border-rule bg-paper-2/40 px-4 py-2.5 text-center text-[12px] font-medium text-ink hover:bg-paper-2"
          >
            See all notifications →
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function NotificationGlyph({
  kind,
  severity,
  brandColor,
}: {
  kind: string;
  severity: "info" | "success" | "warn" | "error";
  brandColor: string | null;
}) {
  if (kind === "chat") {
    return (
      <span
        className="mt-1 size-2 shrink-0 rounded-full"
        style={{ backgroundColor: brandColor ?? "var(--color-rule-2)" }}
        aria-hidden
      />
    );
  }
  const cls =
    severity === "error"
      ? "bg-warn/20 text-warn"
      : severity === "warn"
        ? "bg-warn/15 text-warn"
        : severity === "success"
          ? "bg-good/15 text-good"
          : "bg-paper-2 text-ink";
  return (
    <span
      className={cn(
        "inline-flex size-7 shrink-0 items-center justify-center rounded-full font-mono text-[11px]",
        cls,
      )}
      aria-hidden
    >
      {kindEmoji(kind)}
    </span>
  );
}

function kindLabel(kind: string): string {
  switch (kind) {
    case "chat":
      return "New message";
    case "lead_created":
      return "Lead";
    case "conversation_assigned":
      return "Assigned";
    case "webhook_failed":
      return "Webhook";
    case "email_failed":
      return "Email";
    case "atlas_error":
      return "Atlas";
    case "brand_created":
      return "Brand";
    case "operator_added":
      return "Team";
    case "api_key_created":
      return "API key";
    case "system":
      return "System";
    default:
      return kind;
  }
}

function kindEmoji(kind: string): string {
  switch (kind) {
    case "lead_created":
      return "✦";
    case "conversation_assigned":
      return "→";
    case "webhook_failed":
      return "↯";
    case "email_failed":
      return "✉";
    case "atlas_error":
      return "!";
    case "brand_created":
      return "◆";
    case "operator_added":
      return "+";
    case "api_key_created":
      return "⌖";
    default:
      return "•";
  }
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

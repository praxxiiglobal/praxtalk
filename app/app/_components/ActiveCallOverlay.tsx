"use client";

import { useAction, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

/**
 * Floating "Call in progress" overlay. Watches the current operator's
 * activeCalls (Convex reactive — no polling needed) and renders a
 * fixed-position card top-right with hangup + status. Quietly absent
 * when there are no live calls.
 */
export function ActiveCallOverlay() {
  const { sessionToken } = useDashboardAuth();
  const calls = useQuery(api.voiceIntegrations.listActive, { sessionToken });
  const hangup = useAction(api.voiceIntegrations.hangupCall);

  if (!calls || calls.length === 0) return null;

  return (
    <div className="fixed top-20 right-4 z-40 flex w-[320px] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {calls.map((c) => (
        <CallCard
          key={c._id}
          call={c}
          onHangup={() => hangup({ sessionToken, activeCallId: c._id })}
        />
      ))}
    </div>
  );
}

function CallCard({
  call,
  onHangup,
}: {
  call: {
    _id: string;
    conversationId: string;
    visitorName: string | null;
    toPhone: string;
    provider: string;
    status: "initiating" | "ringing" | "in_progress" | "completed" | "failed";
    startedAt: number;
  };
  onHangup: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    const update = () => {
      const sec = Math.floor((Date.now() - call.startedAt) / 1000);
      const m = Math.floor(sec / 60).toString().padStart(2, "0");
      const s = (sec % 60).toString().padStart(2, "0");
      setElapsed(`${m}:${s}`);
    };
    update();
    const handle = setInterval(update, 1000);
    return () => clearInterval(handle);
  }, [call.startedAt]);

  const onHangupClick = async () => {
    setBusy(true);
    try {
      await onHangup();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-rule bg-paper p-3 shadow-2xl">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-good/15 text-good">
        <PhoneIcon />
      </div>
      <Link
        href={`/app?conversation=${call.conversationId}`}
        className="min-w-0 flex-1"
      >
        <div className="text-[13px] font-medium text-ink">
          {call.visitorName ?? "Unknown caller"}
        </div>
        <div className="font-mono text-[11px] text-muted">
          {call.toPhone} · {call.provider} ·{" "}
          <StatusBadge status={call.status} /> · {elapsed}
        </div>
      </Link>
      <button
        type="button"
        onClick={onHangupClick}
        disabled={busy}
        title="Hang up"
        className="shrink-0 inline-flex size-9 items-center justify-center rounded-full bg-red-600 text-white shadow transition hover:-translate-y-px disabled:opacity-50"
      >
        <HangupIcon />
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const label =
    status === "initiating"
      ? "starting"
      : status === "in_progress"
        ? "live"
        : status;
  const color =
    status === "in_progress"
      ? "text-good"
      : status === "ringing"
        ? "text-warn"
        : "text-muted";
  return <span className={cn("font-mono", color)}>{label}</span>;
}

function PhoneIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function HangupIcon() {
  // 180° flipped phone — universal "end call" glyph.
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ transform: "rotate(135deg)" }}
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

"use client";

import { useAction } from "convex/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

export function DialPadButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Dial a number"
        title="Dial a number"
        className="inline-flex size-9 items-center justify-center rounded-full border border-rule-2 bg-paper text-ink transition hover:bg-paper-2"
      >
        <PhoneIcon />
      </button>
      {open && <DialPadModal onClose={() => setOpen(false)} />}
    </>
  );
}

function DialPadModal({ onClose }: { onClose: () => void }) {
  const { sessionToken } = useDashboardAuth();
  const router = useRouter();
  const originateCall = useAction(api.voiceIntegrations.originateCall);

  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const press = (digit: string) => {
    setPhone((cur) => cur + digit);
    setError(null);
  };
  const back = () => {
    setPhone((cur) => cur.slice(0, -1));
    setError(null);
  };

  const dial = async () => {
    const trimmed = phone.trim();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const result = await originateCall({
        sessionToken,
        toPhone: trimmed,
        name: name.trim() || undefined,
      });
      if (!result.ok) {
        setError(result.error ?? "Call failed.");
        setBusy(false);
        return;
      }
      onClose();
      if (result.conversationId) {
        router.push(`/app?conversation=${result.conversationId}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call failed.");
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dial a number"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[360px] rounded-2xl border border-rule bg-paper p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold tracking-[-0.01em]">
            Dial a number
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

        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+1 555 123 4567"
          autoFocus
          className="mb-2 h-12 w-full rounded-xl border border-rule-2 bg-paper px-4 text-center font-mono text-[20px] tracking-wider outline-none focus:border-ink"
        />

        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="mb-4 h-9 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
        />

        <div className="grid grid-cols-3 gap-2">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "+", "0", "⌫"].map(
            (k) => (
              <button
                key={k}
                type="button"
                onClick={() => (k === "⌫" ? back() : press(k))}
                className="h-12 rounded-xl border border-rule-2 bg-paper-2/40 font-mono text-[18px] text-ink transition hover:bg-paper-2"
              >
                {k}
              </button>
            ),
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mt-3 rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-2 text-[12px] text-red-900"
          >
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={dial}
          disabled={!phone.trim() || busy}
          className={cn(
            "mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-ink text-sm font-medium text-paper transition hover:-translate-y-px disabled:cursor-progress disabled:opacity-60",
          )}
        >
          {busy ? "Dialling…" : "Call"}
        </button>

        <p className="mt-3 text-center text-[11px] leading-[1.4] text-muted">
          The provider will ring your registered number first, then connect
          you to the customer.
        </p>
      </div>
    </div>
  );
}

function PhoneIcon() {
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
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

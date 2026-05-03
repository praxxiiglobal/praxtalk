"use client";

import { useAction, useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { cn } from "@/lib/cn";

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Calendar",
  microsoft: "Microsoft / Outlook Calendar",
  caldav: "Apple iCloud / Fastmail (CalDAV)",
};

/**
 * Per-operator calendar OAuth connections. Slice 1 — connect / list /
 * disconnect. Event sync + booking write-back layer in slice 2.
 */
export function CalendarsSection() {
  const { sessionToken } = useDashboardAuth();
  const connections = useQuery(api.calendarConnections.listMine, {
    sessionToken,
  });
  const config = useQuery(api.calendarConnections.providerConfig, {
    sessionToken,
  });
  const startOauth = useAction(api.calendarConnections.startOauth);
  const disconnect = useMutation(api.calendarConnections.disconnect);

  const [busy, setBusy] = useState<"google" | "microsoft" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = async (provider: "google" | "microsoft") => {
    setBusy(provider);
    setError(null);
    try {
      const { url } = await startOauth({ sessionToken, provider });
      window.location.href = url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't start OAuth.");
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {connections && connections.length > 0 && (
        <ul className="flex flex-col gap-2">
          {connections.map((c) => (
            <li
              key={c._id}
              className="flex items-center justify-between gap-3 rounded-xl border border-rule bg-paper-2/30 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink">
                  {PROVIDER_LABELS[c.provider] ?? c.provider}
                </div>
                <div className="font-mono text-[11px] text-muted">
                  {c.accountEmail || "Connected"}
                  {c.lastSyncedAt
                    ? ` · last synced ${new Date(c.lastSyncedAt).toLocaleString()}`
                    : " · not synced yet"}
                  {c.lastSyncError && ` · ${c.lastSyncError}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (
                    confirm(
                      "Disconnect this calendar? Booking pages stop excluding events from it.",
                    )
                  ) {
                    void disconnect({ sessionToken, connectionId: c._id });
                  }
                }}
                className="shrink-0 rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-ink"
              >
                Disconnect
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            { value: "google" as const, label: "Connect Google" },
            { value: "microsoft" as const, label: "Connect Microsoft" },
          ] satisfies { value: "google" | "microsoft"; label: string }[]
        ).map((p) => {
          const configured =
            p.value === "google"
              ? config?.googleConfigured
              : config?.microsoftConfigured;
          const alreadyConnected = connections?.some(
            (c) => c.provider === p.value,
          );
          return (
            <button
              key={p.value}
              type="button"
              onClick={() => connect(p.value)}
              disabled={!configured || busy === p.value || alreadyConnected}
              title={
                !configured
                  ? "OAuth not yet configured on this deployment"
                  : alreadyConnected
                    ? "Already connected"
                    : undefined
              }
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-4 text-xs font-medium transition",
                configured && !alreadyConnected
                  ? "bg-ink text-paper hover:-translate-y-px"
                  : "border border-rule-2 text-muted",
                busy === p.value && "opacity-60",
              )}
            >
              {busy === p.value
                ? "Starting…"
                : alreadyConnected
                  ? `${p.label} ✓`
                  : p.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-2 text-xs text-red-900"
        >
          {error}
        </div>
      )}

      {(!config?.googleConfigured && !config?.microsoftConfigured) && (
        <p className="text-[11px] leading-[1.5] text-muted">
          Calendar OAuth isn't configured on this deployment yet — admin
          needs to register an OAuth app with Google / Microsoft, set the
          redirect URI to <code>/api/oauth/calendar/&lt;provider&gt;/callback</code>{" "}
          on the prod Convex host, and set GOOGLE_OAUTH_CLIENT_ID +
          GOOGLE_OAUTH_CLIENT_SECRET (and the Microsoft equivalents) as
          Convex env vars. Google's verification process gates production
          use beyond a handful of test users — start it early.
        </p>
      )}

      <p className="text-[11px] leading-[1.5] text-muted">
        <strong className="text-ink">Phase 3 status:</strong> OAuth + connection
        management is live (slice 1). Event-availability sync and writing
        new bookings back to your calendar arrive in slice 2 — until then,
        connecting just persists the credentials so you can validate the
        OAuth flow end-to-end.
      </p>
    </div>
  );
}

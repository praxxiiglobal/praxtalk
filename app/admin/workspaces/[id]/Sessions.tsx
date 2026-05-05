"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Props = {
  sessionToken: string;
  workspaceId: Id<"workspaces">;
  initialCap: number | null;
};

/**
 * Active-session visibility + revocation panel for one workspace.
 * Reactive: useQuery means new logins show up live without a reload.
 */
export function Sessions({ sessionToken, workspaceId, initialCap }: Props) {
  const data = useQuery(api._admin.listWorkspaceSessions, {
    sessionToken,
    workspaceId,
  });
  const revokeOne = useMutation(api._admin.revokeSession);
  const revokeOperator = useMutation(api._admin.revokeAllOperatorSessions);
  const revokeAll = useMutation(api._admin.revokeAllWorkspaceSessions);
  const setCap = useMutation(api._admin.setMaxSessionsPerOperator);

  const [capInput, setCapInput] = useState<string>(
    initialCap ? String(initialCap) : "",
  );
  const [savingCap, setSavingCap] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  if (data === undefined) {
    return (
      <p className="text-sm text-muted">Loading sessions…</p>
    );
  }

  const onSaveCap = async () => {
    const trimmed = capInput.trim();
    setSavingCap(true);
    try {
      if (trimmed === "") {
        await setCap({ sessionToken, workspaceId, cap: null });
      } else {
        const n = Number(trimmed);
        if (!Number.isFinite(n) || n < 1) {
          alert("Cap must be a positive integer (or empty to clear).");
          return;
        }
        await setCap({ sessionToken, workspaceId, cap: Math.floor(n) });
      }
    } finally {
      setSavingCap(false);
    }
  };

  const onRevokeAll = async () => {
    if (
      !confirm(
        `Force-logout every operator in this workspace? (${data.totalActive} active session${
          data.totalActive === 1 ? "" : "s"
        })`,
      )
    )
      return;
    setBulkBusy(true);
    try {
      await revokeAll({ sessionToken, workspaceId });
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-rule-2 bg-paper-2/30 p-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="session-cap"
            className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted"
          >
            Max sessions per operator
          </label>
          <input
            id="session-cap"
            type="number"
            min={1}
            placeholder="No cap"
            value={capInput}
            onChange={(e) => setCapInput(e.target.value)}
            className="h-9 w-32 rounded-lg border border-rule bg-paper px-2.5 font-mono text-[13px] text-ink outline-none focus:border-ink"
          />
        </div>
        <button
          type="button"
          onClick={onSaveCap}
          disabled={savingCap}
          className="h-9 rounded-full bg-ink px-4 text-[12px] font-semibold text-paper transition disabled:opacity-50"
        >
          {savingCap ? "Saving…" : "Save cap"}
        </button>
        <p className="ml-auto max-w-xs text-[11px] leading-[1.4] text-muted">
          Empty = no cap. When set, the oldest sessions are evicted on
          login so the operator never holds more than this many at once.
        </p>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          <span className="font-semibold">{data.totalActive}</span> active
          session{data.totalActive === 1 ? "" : "s"} across{" "}
          <span className="font-semibold">
            {data.operators.filter((o) => o.sessions.length > 0).length}
          </span>{" "}
          operator(s).
        </p>
        <button
          type="button"
          onClick={onRevokeAll}
          disabled={bulkBusy || data.totalActive === 0}
          className="h-8 rounded-full border border-rule-2 px-3 text-[11px] uppercase tracking-[0.06em] text-ink transition hover:border-ink hover:bg-paper-2 disabled:opacity-50"
          title="Force-logout every operator in this workspace."
        >
          {bulkBusy ? "Revoking…" : "Revoke all"}
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-rule-2">
        <table className="w-full text-sm">
          <thead className="bg-paper-2/60 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            <tr>
              <th className="px-3 py-2.5">Operator</th>
              <th className="px-3 py-2.5">Sessions</th>
              <th className="px-3 py-2.5">Device</th>
              <th className="px-3 py-2.5">Location · IP</th>
              <th className="px-3 py-2.5">Newest started</th>
              <th className="px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {data.operators.map((op) => (
              <OperatorRow
                key={op.operatorId}
                op={op}
                sessionToken={sessionToken}
                onRevokeSession={(sessionId) =>
                  revokeOne({ sessionToken, sessionId })
                }
                onRevokeAllForOperator={() =>
                  revokeOperator({ sessionToken, operatorId: op.operatorId })
                }
              />
            ))}
            {data.operators.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-[12.5px] text-muted"
                >
                  No operators in this workspace.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type SessionRow = {
  _id: Id<"sessions">;
  startedAt: number;
  expiresAt: number;
  userAgent: string | null;
  ipAddress: string | null;
  ipCountry: string | null;
  ipRegion: string | null;
  ipCity: string | null;
};

function OperatorRow({
  op,
  onRevokeSession,
  onRevokeAllForOperator,
}: {
  op: {
    operatorId: Id<"operators">;
    email: string;
    name: string;
    role: string;
    sessions: SessionRow[];
  };
  sessionToken: string;
  onRevokeSession: (id: Id<"sessions">) => Promise<unknown>;
  onRevokeAllForOperator: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Id<"sessions"> | "all" | null>(null);

  const newest = op.sessions[0];
  const handleRevoke = async (id: Id<"sessions">) => {
    setBusy(id);
    try {
      await onRevokeSession(id);
    } finally {
      setBusy(null);
    }
  };
  const handleRevokeAll = async () => {
    if (
      !confirm(`Force-logout every device for ${op.email}?`)
    )
      return;
    setBusy("all");
    try {
      await onRevokeAllForOperator();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <tr>
        <td className="px-3 py-2.5">
          <div className="flex flex-col">
            <span>{op.name}</span>
            <span className="font-mono text-[11px] text-muted">{op.email}</span>
          </div>
        </td>
        <td className="px-3 py-2.5 font-mono text-[12px]">
          {op.sessions.length === 0 ? (
            <span className="text-muted">— signed out —</span>
          ) : (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="font-mono text-[12px] text-ink hover:underline"
            >
              {op.sessions.length} {open ? "▾" : "▸"}
            </button>
          )}
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
          {newest ? describeDevice(newest.userAgent) : "—"}
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
          {newest ? describeLocation(newest) : "—"}
        </td>
        <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
          {newest ? formatRelative(newest.startedAt) : "—"}
        </td>
        <td className="px-3 py-2.5 text-right">
          {op.sessions.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAll}
              disabled={busy !== null}
              className="rounded-full border border-rule-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink transition hover:border-ink hover:bg-paper-2 disabled:opacity-50"
            >
              {busy === "all" ? "…" : "Logout all"}
            </button>
          )}
        </td>
      </tr>
      {open &&
        op.sessions.map((s) => (
          <tr key={s._id} className="bg-paper-2/30">
            <td className="px-3 py-2 pl-8 font-mono text-[11px] text-muted">
              session
            </td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">
              expires {formatRelative(s.expiresAt)}
            </td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">
              {describeDevice(s.userAgent)}
            </td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">
              {describeLocation(s)}
            </td>
            <td className="px-3 py-2 font-mono text-[11px] text-muted">
              started {formatRelative(s.startedAt)}
            </td>
            <td className="px-3 py-2 text-right">
              <button
                type="button"
                onClick={() => handleRevoke(s._id)}
                disabled={busy !== null}
                className="rounded-full border border-rule-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-ink transition hover:border-ink hover:bg-paper-2 disabled:opacity-50"
              >
                {busy === s._id ? "…" : "Revoke"}
              </button>
            </td>
          </tr>
        ))}
    </>
  );
}

/**
 * Lightweight user-agent → "OS · device · browser" parser. We
 * intentionally avoid pulling in a UA library — the standard tokens
 * iOS / Android / Macintosh / Windows / Linux + the browser banners
 * are stable enough for an admin readout. Returns "Unknown device"
 * if the UA is missing (legacy session pre-capture).
 */
function describeDevice(ua: string | null): string {
  if (!ua) return "Unknown device";
  const isiPad = /iPad/.test(ua);
  const isiPhone = /iPhone/.test(ua);
  const isAndroid = /Android/.test(ua);
  const isMobile = /Mobile/.test(ua) || isiPhone || (isAndroid && /Mobile/.test(ua));
  const isMac = /Macintosh|Mac OS X/.test(ua) && !isiPhone && !isiPad;
  const isWindows = /Windows NT/.test(ua);
  const isLinux = /Linux/.test(ua) && !isAndroid;

  let os = "Unknown OS";
  if (isiPad) os = "iPadOS";
  else if (isiPhone) os = "iOS";
  else if (isAndroid) os = "Android";
  else if (isMac) os = "macOS";
  else if (isWindows) os = "Windows";
  else if (isLinux) os = "Linux";

  let device = "Desktop";
  if (isiPad) device = "Tablet";
  else if (isAndroid && !isMobile) device = "Tablet";
  else if (isMobile) device = "Mobile";

  let browser = "Browser";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = "Safari";

  return `${os} · ${device} · ${browser}`;
}

function describeLocation(s: SessionRow): string {
  const parts = [s.ipCity, s.ipRegion, s.ipCountry].filter(Boolean);
  const place = parts.length > 0 ? parts.join(", ") : null;
  if (place && s.ipAddress) return `${place} · ${s.ipAddress}`;
  if (place) return place;
  if (s.ipAddress) return s.ipAddress;
  return "—";
}

function formatRelative(ts: number): string {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  const future = diff > 0;
  let value: string;
  if (abs < min) value = "just now";
  else if (abs < hr) value = `${Math.round(abs / min)}m`;
  else if (abs < day) value = `${Math.round(abs / hr)}h`;
  else value = `${Math.round(abs / day)}d`;
  if (abs < min) return value;
  return future ? `in ${value}` : `${value} ago`;
}

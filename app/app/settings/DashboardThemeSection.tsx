"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../_components/DashboardShell";

const PRESETS: { name: string; color: string }[] = [
  { name: "PraxTalk default", color: "" },
  { name: "Indigo", color: "#4F46E5" },
  { name: "Cobalt", color: "#1D4ED8" },
  { name: "Crimson", color: "#DC2626" },
  { name: "Emerald", color: "#047857" },
  { name: "Slate", color: "#334155" },
  { name: "Plum", color: "#7E22CE" },
];

/**
 * Workspace-wide dashboard accent color. Changes the primary-action
 * surfaces (buttons, active-state pills) so the operator dashboard
 * looks like an extension of the customer's own product. Body text
 * and borders stay PraxTalk default regardless of the picked color
 * for readability.
 */
export function DashboardThemeSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const accent = useQuery(api.workspaces.getDashboardAccent, { sessionToken });
  const setAccent = useMutation(api.workspaces.setDashboardAccent);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (operator.role === "agent") return null;

  const onPick = async (color: string) => {
    setBusy(true);
    setError(null);
    try {
      await setAccent({ sessionToken, accent: color || null });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => {
          const isActive = (accent ?? "") === p.color;
          return (
            <button
              key={p.name}
              type="button"
              onClick={() => onPick(p.color)}
              disabled={busy}
              title={p.name}
              className="group flex flex-col items-center gap-1.5"
            >
              <span
                className={
                  isActive
                    ? "block size-9 rounded-full ring-2 ring-offset-2 ring-offset-paper transition"
                    : "block size-9 rounded-full ring-1 ring-rule-2 transition group-hover:ring-rule"
                }
                style={{
                  backgroundColor: p.color || "var(--color-ink)",
                  // @ts-expect-error custom prop
                  "--tw-ring-color": p.color || "var(--color-ink)",
                }}
              />
              <span className="font-mono text-[9px] uppercase tracking-[0.06em] text-muted">
                {p.name === "PraxTalk default" ? "Default" : p.name}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <label className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          Custom hex
        </label>
        <input
          type="color"
          value={accent ?? "#0F1A12"}
          onChange={(e) => onPick(e.target.value)}
          disabled={busy}
          className="h-8 w-16 cursor-pointer rounded border border-rule-2 bg-transparent"
        />
        <span className="font-mono text-[12px] text-ink">
          {accent ?? "#0F1A12 (default)"}
        </span>
        {accent && (
          <button
            type="button"
            onClick={() => onPick("")}
            disabled={busy}
            className="ml-auto inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[11px] font-medium text-ink hover:bg-paper-2"
          >
            Reset to default
          </button>
        )}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-2 text-xs text-red-900"
        >
          {error}
        </div>
      )}

      <p className="text-[11px] leading-[1.4] text-muted">
        Affects only this dashboard for everyone in your workspace —
        visitor-facing widget colors are configured per-brand in{" "}
        <a href="/app/brands" className="underline-offset-2 hover:underline">
          /app/brands
        </a>
        . Pick a color with enough contrast against white text — buttons
        with light backgrounds may be hard to read.
      </p>
    </div>
  );
}

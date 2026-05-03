"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../../DashboardShell";
import { Card } from "../../PageHeader";
import { cn } from "@/lib/cn";

type Window = { startMin: number; endMin: number };
type DayWindows = { windows: Window[] };
type DateOverride = { date: string; windows: Window[] };

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function BookingPageEditor({ id }: { id: Id<"bookingPages"> }) {
  const { sessionToken } = useDashboardAuth();
  const page = useQuery(api.bookingPages.getById, { sessionToken, id });
  const teamOps = useQuery(api.operators.list, { sessionToken });
  const update = useMutation(api.bookingPages.update);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [bufferMin, setBufferMin] = useState(0);
  const [weekly, setWeekly] = useState<DayWindows[]>(() =>
    Array.from({ length: 7 }, () => ({ windows: [] })),
  );
  const [overrides, setOverrides] = useState<DateOverride[]>([]);
  const [additionalOwners, setAdditionalOwners] = useState<
    Id<"operators">[]
  >([]);
  const [enabled, setEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (!page) return;
    setTitle(page.title);
    setDescription(page.description ?? "");
    setDurationMin(page.durationMin);
    setBufferMin(page.bufferMin ?? 0);
    setWeekly(
      page.weekly.length === 7
        ? page.weekly
        : Array.from({ length: 7 }, () => ({ windows: [] })),
    );
    setOverrides(page.dateOverrides ?? []);
    setAdditionalOwners(page.additionalOwnerOperatorIds ?? []);
    setEnabled(page.enabled);
  }, [page?._id]);

  if (page === undefined) {
    return (
      <Card title="">
        <div className="py-8 text-center text-xs text-muted">Loading…</div>
      </Card>
    );
  }
  if (page === null) {
    return (
      <Card title="Not found">
        <p className="text-sm text-muted">
          This booking page doesn't exist or you don't have access.{" "}
          <Link
            href="/app/booking-pages"
            className="text-ink underline-offset-2 hover:underline"
          >
            Back to list
          </Link>
        </p>
      </Card>
    );
  }

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await update({
        sessionToken,
        id,
        title,
        description: description || undefined,
        durationMin,
        bufferMin,
        weekly,
        dateOverrides: overrides,
        additionalOwnerOperatorIds: additionalOwners,
        enabled,
      });
      setMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setMsg({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't save.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card title="Basics">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Slug">
            <input
              type="text"
              value={page.slug}
              disabled
              className="h-10 rounded-xl border border-rule-2 bg-paper-2/40 px-3 text-[13px] font-mono text-muted"
            />
          </Field>
          <Field label="Duration">
            <select
              value={durationMin}
              onChange={(e) => setDurationMin(Number(e.target.value))}
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            >
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
            </select>
          </Field>
          <Field label="Buffer between bookings (min)">
            <input
              type="number"
              value={bufferMin}
              onChange={(e) => setBufferMin(Number(e.target.value))}
              min={0}
              max={120}
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
        </div>
        <div className="mt-3">
          <Field label="Description (shown on the public page)">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="resize-none rounded-xl border border-rule-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink"
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            id="enabled"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="size-4"
          />
          <label htmlFor="enabled" className="text-[12px] text-ink">
            Enabled (visitors can book at /book/{page.slug})
          </label>
        </div>
      </Card>

      <Card
        title="Weekly availability"
        description="Set the regular hours you're open for bookings each day."
      >
        <div className="flex flex-col gap-3">
          {DAY_LABELS.map((label, dow) => (
            <DayRow
              key={dow}
              label={label}
              windows={weekly[dow]?.windows ?? []}
              onChange={(windows) =>
                setWeekly((cur) =>
                  cur.map((d, i) => (i === dow ? { windows } : d)),
                )
              }
            />
          ))}
        </div>
      </Card>

      <Card
        title="Round-robin (additional owners)"
        description="Add other operators to share this booking page. Each slot opens if at least one owner is free; bookings auto-assign to whichever owner is available."
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-1.5">
            {additionalOwners.length === 0 ? (
              <span className="text-[12px] text-muted">
                Just you for now. Add operators below to round-robin.
              </span>
            ) : (
              additionalOwners.map((opId) => {
                const op = teamOps?.find((o) => o._id === opId);
                return (
                  <span
                    key={opId}
                    className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2.5 py-1 text-[12px] text-ink"
                  >
                    {op?.name ?? "Unknown"}
                    <button
                      type="button"
                      onClick={() =>
                        setAdditionalOwners((cur) =>
                          cur.filter((x) => x !== opId),
                        )
                      }
                      className="ml-0.5 rounded-full px-1 text-muted hover:text-ink"
                    >
                      ×
                    </button>
                  </span>
                );
              })
            )}
          </div>
          {teamOps && (
            <select
              value=""
              onChange={(e) => {
                const v = e.target.value as Id<"operators">;
                if (!v) return;
                if (additionalOwners.includes(v)) return;
                if (page.ownerOperatorId === v) return;
                setAdditionalOwners((cur) => [...cur, v]);
              }}
              className="h-9 max-w-xs rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            >
              <option value="">+ Add an operator…</option>
              {teamOps
                .filter(
                  (op) =>
                    op._id !== page.ownerOperatorId &&
                    !additionalOwners.includes(
                      op._id as Id<"operators">,
                    ),
                )
                .map((op) => (
                  <option key={op._id} value={op._id}>
                    {op.name} · {op.role}
                  </option>
                ))}
            </select>
          )}
        </div>
      </Card>

      <Card
        title="Date overrides"
        description="Override the weekly schedule for specific dates — block holidays, vacation, or open special hours."
      >
        <div className="flex flex-col gap-3">
          {overrides.map((o, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border border-rule-2 bg-paper-2/40 px-3 py-2"
            >
              <input
                type="date"
                value={o.date}
                onChange={(e) =>
                  setOverrides((cur) =>
                    cur.map((x, idx) =>
                      idx === i ? { ...x, date: e.target.value } : x,
                    ),
                  )
                }
                className="h-9 shrink-0 rounded-lg border border-rule-2 bg-paper px-2 text-[12px] font-mono outline-none focus:border-ink"
              />
              <div className="flex-1">
                <DayRow
                  label=""
                  windows={o.windows}
                  emptyLabel="Blocked all day"
                  onChange={(windows) =>
                    setOverrides((cur) =>
                      cur.map((x, idx) =>
                        idx === i ? { ...x, windows } : x,
                      ),
                    )
                  }
                />
              </div>
              <button
                type="button"
                onClick={() =>
                  setOverrides((cur) => cur.filter((_, idx) => idx !== i))
                }
                className="shrink-0 rounded-full border border-rule-2 px-2 py-0.5 text-[11px] text-muted hover:text-ink"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => {
              const today = new Date();
              const yyyy = today.getFullYear();
              const mm = (today.getMonth() + 1).toString().padStart(2, "0");
              const dd = today.getDate().toString().padStart(2, "0");
              setOverrides((cur) => [
                ...cur,
                { date: `${yyyy}-${mm}-${dd}`, windows: [] },
              ]);
            }}
            className="self-start rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-ink"
          >
            + Add date override
          </button>
        </div>
      </Card>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={busy || !title.trim()}
          className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save changes"}
        </button>
        <Link
          href="/app/booking-pages"
          className="text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline"
        >
          Back to list
        </Link>
        {msg && (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[12px]",
              msg.kind === "ok"
                ? "bg-good/15 text-good"
                : "bg-red-50 text-red-700",
            )}
          >
            {msg.text}
          </span>
        )}
      </div>
    </>
  );
}

function DayRow({
  label,
  windows,
  emptyLabel = "Closed",
  onChange,
}: {
  label: string;
  windows: Window[];
  emptyLabel?: string;
  onChange: (windows: Window[]) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      {label && (
        <span className="w-12 shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          {label}
        </span>
      )}
      <div className="flex flex-1 flex-wrap items-center gap-1.5">
        {windows.length === 0 ? (
          <span className="text-[12px] text-muted">{emptyLabel}</span>
        ) : (
          windows.map((w, i) => (
            <div
              key={i}
              className="inline-flex items-center gap-1 rounded-full border border-rule-2 bg-paper px-2 py-0.5"
            >
              <input
                type="time"
                value={minutesToHHMM(w.startMin)}
                onChange={(e) =>
                  onChange(
                    windows.map((x, idx) =>
                      idx === i
                        ? { ...x, startMin: hhmmToMinutes(e.target.value) }
                        : x,
                    ),
                  )
                }
                className="bg-transparent text-[12px] font-mono outline-none"
              />
              <span className="text-[11px] text-muted">→</span>
              <input
                type="time"
                value={minutesToHHMM(w.endMin)}
                onChange={(e) =>
                  onChange(
                    windows.map((x, idx) =>
                      idx === i
                        ? { ...x, endMin: hhmmToMinutes(e.target.value) }
                        : x,
                    ),
                  )
                }
                className="bg-transparent text-[12px] font-mono outline-none"
              />
              <button
                type="button"
                onClick={() => onChange(windows.filter((_, idx) => idx !== i))}
                className="ml-0.5 rounded-full px-1 text-[11px] text-muted hover:text-ink"
                title="Remove"
              >
                ×
              </button>
            </div>
          ))
        )}
        <button
          type="button"
          onClick={() =>
            onChange([...windows, { startMin: 9 * 60, endMin: 17 * 60 }])
          }
          className="rounded-full border border-rule-2 px-2 py-0.5 text-[11px] text-muted hover:text-ink"
        >
          + Window
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

function minutesToHHMM(m: number): string {
  const hh = Math.floor(m / 60)
    .toString()
    .padStart(2, "0");
  const mm = (m % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function hhmmToMinutes(s: string): number {
  const [hh = "0", mm = "0"] = s.split(":");
  return Number(hh) * 60 + Number(mm);
}

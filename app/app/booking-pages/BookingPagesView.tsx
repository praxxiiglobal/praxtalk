"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Channel = "email" | "sms" | "whatsapp";

export function BookingPagesView() {
  const { sessionToken } = useDashboardAuth();
  const pages = useQuery(api.bookingPages.listMine, { sessionToken });
  const create = useMutation(api.bookingPages.create);
  const remove = useMutation(api.bookingPages.remove);

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [durationMin, setDurationMin] = useState(30);
  const [confirmChannel, setConfirmChannel] = useState<Channel>("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      await create({
        sessionToken,
        title,
        slug: slug || undefined,
        durationMin,
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
        confirmChannel,
      });
      setTitle("");
      setSlug("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create.");
    } finally {
      setBusy(false);
    }
  };

  const baseUrl =
    typeof window !== "undefined" ? window.location.origin : "";

  return (
    <>
      <Card title="Create a booking page">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="30-min intro call"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Slug (optional)">
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="auto-derived from title"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
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
          <Field label="Confirm + remind via">
            <select
              value={confirmChannel}
              onChange={(e) => setConfirmChannel(e.target.value as Channel)}
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            >
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </Field>
        </div>
        {error && (
          <div className="mt-3 rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-2 text-[12px] text-red-900">
            {error}
          </div>
        )}
        <div className="mt-3">
          <button
            type="button"
            onClick={onCreate}
            disabled={busy || !title.trim()}
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-xs font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create page"}
          </button>
        </div>
      </Card>

      <Card title="Your booking pages">
        {pages === undefined ? (
          <div className="py-8 text-center text-xs text-muted">Loading…</div>
        ) : pages.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted">
            No booking pages yet. Create your first one above.
          </div>
        ) : (
          <ul className="divide-y divide-rule">
            {pages.map((p) => (
              <li
                key={p._id}
                className="flex items-center justify-between gap-4 py-3"
              >
                <Link
                  href={`/app/booking-pages/${p._id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[13.5px] font-medium text-ink underline-offset-2 hover:underline">
                      {p.title}
                    </span>
                    <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                      {p.durationMin} min
                    </span>
                    {!p.enabled && (
                      <span className="rounded-full bg-paper-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                        disabled
                      </span>
                    )}
                  </div>
                  <span className="mt-1 inline-block font-mono text-[11px] text-muted">
                    {baseUrl}/book/{p.slug}
                  </span>
                </Link>
                <a
                  href={`/book/${p.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-ink"
                  title="Open public page in new tab"
                >
                  Preview ↗
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      confirm(
                        "Delete this booking page? Existing bookings stay; the public URL stops working.",
                      )
                    ) {
                      void remove({ sessionToken, id: p._id });
                    }
                  }}
                  className="shrink-0 rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-ink"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
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

"use client";

import { ConvexProvider, ConvexReactClient, useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/cn";

/**
 * Public booking page — no auth. Visitor picks a slot from the next
 * 14 days, fills name + email, clicks Book. Backend creates a
 * conversation in the operator's inbox + auto-schedules reminders.
 */
export function BookView({ slug }: { slug: string }) {
  const client = useMemo(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!),
    [],
  );
  return (
    <ConvexProvider client={client}>
      <BookInner slug={slug} />
    </ConvexProvider>
  );
}

function BookInner({ slug }: { slug: string }) {
  const page = useQuery(api.bookingPages.getPublicBySlug, { slug });
  const today = new Date();
  const fromDate = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  const slots = useQuery(api.bookingPages.computeSlots, {
    slug,
    fromDate,
    days: 14,
  });
  const book = useMutation(api.bookingPages.book);

  const [picked, setPicked] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (page === undefined) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-muted">Loading…</p>
      </main>
    );
  }
  if (page === null) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            Booking page not found
          </h1>
          <p className="mt-2 text-sm text-muted">
            This link may have been disabled or never existed.
          </p>
        </div>
      </main>
    );
  }

  if (confirmed) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="max-w-md text-center">
          <div
            className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full text-paper"
            style={{ backgroundColor: page.brandColor }}
          >
            {page.requiresApproval ? "⏳" : "✓"}
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em]">
            {page.requiresApproval ? "Request received" : "You're booked"}
          </h1>
          <p className="mt-2 text-sm text-muted">
            {page.requiresApproval ? (
              <>
                Your {page.title} request for{" "}
                {new Date(confirmed).toLocaleString()} is awaiting approval.
                You&apos;ll get an email once {page.ownerName}&apos;s team
                confirms.
              </>
            ) : (
              <>
                Your {page.title} with {page.ownerName} is confirmed for{" "}
                {new Date(confirmed).toLocaleString()}.
              </>
            )}
          </p>
          <p className="mt-2 text-xs text-muted">
            {page.requiresApproval
              ? `If we can't confirm within ${
                  page.approvalTimeoutHours ?? 24
                } hours, we'll let you know so you can pick another slot.`
              : "We'll send a reminder closer to the time."}
          </p>
        </div>
      </main>
    );
  }

  const onBook = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await book({
        slug,
        startsAt: picked,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setConfirmed(picked);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't book.");
    } finally {
      setBusy(false);
    }
  };

  // Group slots by day for display.
  const byDay = new Map<string, number[]>();
  (slots ?? []).forEach((t) => {
    const d = new Date(t);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(t);
  });

  return (
    <main className="min-h-screen bg-paper-2/40 px-4 py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6">
          <span
            className="inline-block rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.06em] text-paper"
            style={{ backgroundColor: page.brandColor }}
          >
            {page.brandName}
          </span>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.02em]">
            {page.title}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {page.durationMin} min with {page.ownerName} · {page.timezone}
          </p>
          {page.description && (
            <p className="mt-3 text-sm text-ink">{page.description}</p>
          )}
          {page.requiresApproval && (
            <div className="mt-4 rounded-xl border border-rule-2 bg-paper-2/60 px-3 py-2 text-[12px] text-ink">
              <span aria-hidden>⏳</span> Bookings on this page require
              approval — you&apos;ll receive an email once a team member
              confirms (usually within{" "}
              {page.approvalTimeoutHours ?? 24} hours).
            </div>
          )}
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Slots */}
          <section className="rounded-2xl border border-rule bg-paper p-5">
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              Pick a slot
            </h2>
            {slots === undefined ? (
              <p className="text-xs text-muted">Loading…</p>
            ) : byDay.size === 0 ? (
              <p className="text-xs text-muted">
                No open slots in the next 14 days. Check back later.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {Array.from(byDay.entries()).map(([day, times]) => (
                  <div key={day}>
                    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                      {new Date(times[0]).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {times.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setPicked(t)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12px] transition",
                            picked === t
                              ? "border-ink bg-ink text-paper"
                              : "border-rule-2 text-ink hover:bg-paper-2",
                          )}
                        >
                          {new Date(t).toLocaleTimeString(undefined, {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Form */}
          <section className="rounded-2xl border border-rule bg-paper p-5">
            <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              Your details
            </h2>
            <div className="flex flex-col gap-3">
              <Field label="Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
                />
              </Field>
              <Field label="Phone (optional)">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+1 555 123 4567"
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
                />
              </Field>
              <Field label="Notes (optional)">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="resize-none rounded-xl border border-rule-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink"
                />
              </Field>
              {picked && (
                <div className="rounded-xl border border-rule-2 bg-paper-2/40 px-3 py-2 text-[12px] text-ink">
                  Picked:{" "}
                  <strong>{new Date(picked).toLocaleString()}</strong>
                </div>
              )}
              {error && (
                <div className="rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-2 text-[12px] text-red-900">
                  {error}
                </div>
              )}
              <button
                type="button"
                onClick={onBook}
                disabled={
                  !picked || !name.trim() || !email.trim() || busy
                }
                className="inline-flex h-10 items-center justify-center rounded-xl text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
                style={{ backgroundColor: page.brandColor }}
              >
                {busy ? "Booking…" : "Confirm booking"}
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
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

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

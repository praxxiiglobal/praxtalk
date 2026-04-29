"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

const ALL_EVENTS = [
  "conversation.created",
  "conversation.status_changed",
  "message.created",
  "lead.created",
  "lead.status_changed",
] as const;
type EventType = (typeof ALL_EVENTS)[number];

export function WebhooksSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const subs = useQuery(api.webhooks.list, { sessionToken });
  const createSub = useMutation(api.webhooks.create);
  const setEnabled = useMutation(api.webhooks.setEnabled);
  const removeSub = useMutation(api.webhooks.remove);

  const canManage = operator.role !== "agent";

  const [showForm, setShowForm] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<Set<EventType>>(
    new Set(ALL_EVENTS),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [minted, setMinted] = useState<{ url: string; secret: string } | null>(
    null,
  );

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { secret } = await createSub({
        sessionToken,
        url: url.trim(),
        events: Array.from(events),
      });
      setMinted({ url: url.trim(), secret });
      setUrl("");
      setEvents(new Set(ALL_EVENTS));
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create webhook.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: Id<"webhookSubscriptions">) => {
    if (!confirm("Delete this webhook? Pending events will not be redelivered.")) {
      return;
    }
    await removeSub({ sessionToken, subscriptionId: id });
  };

  return (
    <Card
      title="Webhooks"
      description="Push events to your CRM the moment they happen. Each request is signed with HMAC-SHA256 — verify with the secret shown when you create the webhook."
    >
      {minted ? (
        <div className="mb-4 rounded-xl border border-good bg-good/10 p-4">
          <div className="text-sm font-medium text-ink">
            Webhook created ✓ — copy the signing secret now
          </div>
          <div className="mt-1 text-[12px] text-muted">
            Endpoint: <code className="font-mono">{minted.url}</code>
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-rule bg-paper p-3">
            <code className="flex-1 break-all font-mono text-[12.5px] text-ink">
              {minted.secret}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(minted.secret)}
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setMinted(null)}
            className="mt-3 text-[12px] font-medium text-muted underline-offset-2 hover:underline"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {subs === undefined ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : subs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          No webhooks yet. Add an endpoint below to start receiving events.
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {subs.map((s) => (
            <li
              key={s._id}
              className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm">
                  <code
                    className={cn(
                      "truncate font-mono text-[13px]",
                      s.enabled ? "text-ink" : "text-muted line-through",
                    )}
                    title={s.url}
                  >
                    {s.url}
                  </code>
                </div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                  events: {s.events.join(", ")}
                </div>
                <div className="mt-0.5 truncate font-mono text-[10px] text-muted">
                  secret {s.secretPreview}
                </div>
              </div>
              {canManage ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setEnabled({
                        sessionToken,
                        subscriptionId: s._id,
                        enabled: !s.enabled,
                      })
                    }
                    className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium"
                  >
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(s._id)}
                    className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium text-warn transition hover:-translate-y-px"
                  >
                    Delete
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-5 border-t border-rule pt-5">
          {showForm ? (
            <form onSubmit={onCreate} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Endpoint URL
                </span>
                <input
                  type="url"
                  required
                  autoFocus
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://crm.acme.com/praxtalk/events"
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                />
              </label>

              <fieldset className="flex flex-col gap-2">
                <legend className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Events to send
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ALL_EVENTS.map((evt) => {
                    const checked = events.has(evt);
                    return (
                      <label
                        key={evt}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition",
                          checked
                            ? "border-ink bg-paper"
                            : "border-rule-2 hover:border-ink",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-ink"
                          checked={checked}
                          onChange={(e) => {
                            setEvents((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(evt);
                              else next.delete(evt);
                              return next;
                            });
                          }}
                        />
                        <span className="font-mono text-[12px] text-ink">
                          {evt}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {error ? <p className="text-[12px] text-warn">{error}</p> : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !url.trim() || events.size === 0}
                  className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
                >
                  {busy ? "Creating…" : "Create webhook"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
            >
              + Add webhook
            </button>
          )}
        </div>
      )}

      <RecentEventsLog />

      <details className="mt-5 rounded-xl border border-rule bg-paper-2/40 p-4 open:bg-paper-2/60">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          How to verify the signature
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-lg border border-rule bg-paper p-3 font-mono text-[12.5px] leading-[1.6] text-ink">{`// Each request includes:
//   X-PraxTalk-Signature: t=<unix>,v1=<hmacHex>
//   X-PraxTalk-Event:     conversation.created | message.created | …
//   X-PraxTalk-Event-Id:  <ksuid>
//
// Compute HMAC-SHA256 over: <timestamp> + "." + <raw body>

import crypto from "crypto";

function verify(secret, signatureHeader, rawBody) {
  const m = signatureHeader.match(/t=(\\d+),v1=([a-f0-9]+)/);
  if (!m) return false;
  const [, ts, sig] = m;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${ts}.\${rawBody}\`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}`}</pre>
      </details>
    </Card>
  );
}

function RecentEventsLog() {
  const { sessionToken, operator } = useDashboardAuth();
  const events = useQuery(api.webhooks.listRecentEvents, {
    sessionToken,
    limit: 25,
  });
  const retry = useMutation(api.webhooks.manualRetry);
  const canManage = operator.role !== "agent";
  const [busy, setBusy] = useState<string | null>(null);

  if (!events || events.length === 0) {
    return null;
  }

  const onRetry = async (id: string) => {
    setBusy(id);
    try {
      await retry({
        sessionToken,
        eventId: id as unknown as Id<"webhookEvents">,
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <details className="mt-5 rounded-xl border border-rule bg-paper-2/40 p-4 open:bg-paper-2/60">
      <summary className="cursor-pointer text-sm font-medium text-ink">
        Recent deliveries ({events.length})
      </summary>
      <ul className="mt-3 divide-y divide-rule">
        {events.map((e) => (
          <li
            key={e._id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
          >
            <EventStatusPill status={e.status} />
            <span className="font-mono text-[12px] text-ink">{e.eventType}</span>
            <span className="font-mono text-[10px] text-muted">
              attempt {e.attempts}
            </span>
            {e.httpStatus ? (
              <span className="font-mono text-[10px] text-muted">
                HTTP {e.httpStatus}
              </span>
            ) : null}
            {e.error ? (
              <span
                className="truncate font-mono text-[10px] text-warn"
                title={e.error}
              >
                {e.error}
              </span>
            ) : null}
            <span className="ml-auto font-mono text-[10px] text-muted">
              {timeAgo(e.createdAt)}
            </span>
            {canManage && (e.status === "failed" || e.status === "retrying") ? (
              <button
                type="button"
                onClick={() => onRetry(String(e._id))}
                disabled={busy === String(e._id)}
                className="inline-flex h-7 items-center rounded-full border border-rule-2 px-3 text-[11px] font-medium transition hover:-translate-y-px disabled:opacity-60"
              >
                {busy === String(e._id) ? "Retrying…" : "Retry now"}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function EventStatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    delivered: "bg-good/15 text-good",
    failed: "bg-warn/15 text-warn",
    retrying: "bg-accent-soft text-accent-deep",
    pending: "bg-paper-2 text-muted",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
        map[status] ?? "bg-paper-2 text-muted",
      )}
    >
      {status}
    </span>
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

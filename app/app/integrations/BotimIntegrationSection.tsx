"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

export function BotimIntegrationSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const integration = useQuery(api.botimIntegrations.get, { sessionToken });
  const upsert = useMutation(api.botimIntegrations.upsert);
  const remove = useMutation(api.botimIntegrations.remove);

  const canManage = operator.role !== "agent";

  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (integration && !editing) {
      setDisplayName(integration.displayName);
      setContactEmail(integration.contactEmail);
      setBusinessAccountId(integration.businessAccountId ?? "");
    }
  }, [integration, editing]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await upsert({
        sessionToken,
        displayName: displayName.trim(),
        contactEmail: contactEmail.trim(),
        businessAccountId: businessAccountId.trim() || undefined,
        apiKey: apiKey.trim() || undefined,
      });
      setApiKey("");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (!confirm("Remove Botim integration?")) return;
    await remove({ sessionToken });
    setEditing(false);
  };

  return (
    <Card
      title="Botim channel (UAE)"
      description="Reach customers on Botim, the UAE's most-used messaging app. Pre-configure your business profile here; we'll activate the channel as soon as Botim's business API is available to your workspace."
    >
      {/* Honest pending-API banner — Botim does not expose a public
          self-serve messaging API as of 2026-04-30. */}
      {(!integration || !integration.apiAvailable) && (
        <div
          role="status"
          className="mb-4 rounded-xl border border-rule-2 bg-paper-2/60 px-4 py-3 text-[13px] leading-[1.5] text-ink"
        >
          <strong className="font-medium">Pending API access.</strong> Botim's
          business messaging API is partnership-only today. Save your details
          here — we&apos;ll reach out the moment your workspace is provisioned.
        </div>
      )}

      {integration && !editing ? (
        <div className="space-y-4">
          <dl className="rounded-xl border border-rule bg-paper-2/40 p-4">
            <Row label="Display name" value={integration.displayName} />
            <Row label="Contact email" value={integration.contactEmail} mono />
            {integration.businessAccountId ? (
              <Row
                label="Business account ID"
                value={integration.businessAccountId}
                mono
              />
            ) : null}
            <Row
              label="API key"
              value={integration.apiKeyPreview ?? "(not provided)"}
              mono
            />
            <Row
              label="Status"
              value={
                integration.apiAvailable
                  ? integration.enabled
                    ? "Active"
                    : "Disabled"
                  : "Pending API access"
              }
            />
          </dl>

          {canManage ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setApiKey("");
                }}
                className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium text-warn"
              >
                Remove
              </button>
            </div>
          ) : null}
        </div>
      ) : canManage ? (
        <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Display name
            </span>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Acme Dubai"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">
              Public name UAE customers will see when they reach you.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Contact email
            </span>
            <input
              type="email"
              required
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              placeholder="ops@yourdomain.com"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">
              Botim&apos;s onboarding team will reach this address.
            </span>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Business account ID (if you have one)
            </span>
            <input
              type="text"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="Provided by Botim's partnership team"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              API key (if provided){" "}
              {integration ? "(leave blank to keep current)" : ""}
            </span>
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                integration
                  ? "Stored — leave blank to keep"
                  : "Once Botim issues credentials"
              }
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
          </label>

          {error ? (
            <p className="text-[12px] text-warn sm:col-span-2">{error}</p>
          ) : null}

          <div
            className={cn(
              "flex items-center gap-2 sm:col-span-2",
              integration ? "justify-between" : "justify-end",
            )}
          >
            {integration ? (
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
              >
                Cancel
              </button>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
            >
              {busy
                ? "Saving…"
                : integration
                  ? "Save changes"
                  : "Save Botim profile"}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          No Botim integration configured. Ask an admin to set it up.
        </div>
      )}
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd
        className={cn(
          "text-[13px] text-ink",
          mono ? "font-mono text-[12.5px]" : "",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

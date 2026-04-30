"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

export function WhatsappIntegrationSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const integration = useQuery(api.whatsappIntegrations.get, { sessionToken });
  const upsert = useMutation(api.whatsappIntegrations.upsert);
  const remove = useMutation(api.whatsappIntegrations.remove);

  const canManage = operator.role !== "agent";

  const [editing, setEditing] = useState(false);
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (integration && !editing) {
      setPhoneNumberId(integration.phoneNumberId);
      setBusinessAccountId(integration.businessAccountId ?? "");
      setDisplayPhoneNumber(integration.displayPhoneNumber ?? "");
    }
  }, [integration, editing]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await upsert({
        sessionToken,
        phoneNumberId: phoneNumberId.trim(),
        businessAccountId: businessAccountId.trim() || undefined,
        displayPhoneNumber: displayPhoneNumber.trim() || undefined,
        accessToken: accessToken.trim() || undefined,
        enabled: true,
      });
      setAccessToken("");
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (
      !confirm(
        "Remove WhatsApp integration? Inbound WhatsApp messages will stop being routed.",
      )
    ) {
      return;
    }
    await remove({ sessionToken });
    setEditing(false);
  };

  const webhookUrl =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_CONVEX_URL
      ? process.env.NEXT_PUBLIC_CONVEX_URL.replace(
          /\.convex\.cloud$/,
          ".convex.site",
        ) + "/api/inbound/whatsapp"
      : "<convex-deployment>/api/inbound/whatsapp";

  return (
    <Card
      title="WhatsApp channel"
      description="Receive WhatsApp Business messages in your inbox and reply with one click. Uses Meta's Cloud API — get the credentials from business.facebook.com → WhatsApp."
    >
      {integration && !editing ? (
        <div className="space-y-4">
          <dl className="rounded-xl border border-rule bg-paper-2/40 p-4">
            <Row
              label="Display number"
              value={integration.displayPhoneNumber ?? "—"}
              mono
            />
            <Row label="Phone number ID" value={integration.phoneNumberId} mono />
            {integration.businessAccountId ? (
              <Row
                label="Business account ID"
                value={integration.businessAccountId}
                mono
              />
            ) : null}
            <Row
              label="Access token"
              value={integration.accessTokenPreview ?? "(none)"}
              mono
            />
            <Row
              label="Status"
              value={integration.enabled ? "Enabled" : "Disabled"}
            />
          </dl>

          <div className="rounded-xl border border-rule bg-paper-2/40 p-4 text-[12.5px] leading-[1.6] text-ink">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              Meta webhook setup
            </div>
            In <em>Meta App Dashboard</em> → WhatsApp → Configuration → Webhooks,
            set:
            <pre className="mt-2 overflow-x-auto rounded-lg border border-rule bg-paper p-3 font-mono text-[12px]">
              {`Callback URL : ${webhookUrl}\nVerify token : ${integration.verifyToken}`}
            </pre>
            <div className="mt-2 text-muted">
              Subscribe to the <code className="font-mono text-ink">messages</code>{" "}
              field. The verify token above is what Meta will check during the
              handshake.
            </div>
          </div>

          {canManage ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setAccessToken("");
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
              Phone number ID
            </span>
            <input
              type="text"
              required
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="e.g. 109876543210987"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">
              From WhatsApp → API Setup → Phone numbers.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Display number (optional)
            </span>
            <input
              type="text"
              value={displayPhoneNumber}
              onChange={(e) => setDisplayPhoneNumber(e.target.value)}
              placeholder="+971 50 123 4567"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Access token {integration ? "(leave blank to keep current)" : ""}
            </span>
            <input
              type="text"
              required={!integration}
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={
                integration
                  ? "Stored — leave blank to keep"
                  : "EAAxxxxxxxxxxxxx (System User permanent token recommended)"
              }
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">
              Long-lived token from a System User. Temporary tokens from Graph
              Explorer also work but expire in ~24 hours.
            </span>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Business account ID (optional)
            </span>
            <input
              type="text"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="WABA ID — for analytics + template management"
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
                  : "Connect WhatsApp"}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          No WhatsApp integration configured. Ask an admin to set it up.
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

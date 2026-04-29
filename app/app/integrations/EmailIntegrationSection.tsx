"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Provider = "postmark" | "sendgrid" | "resend";

const providerInfo: Record<Provider, { label: string; help: string }> = {
  postmark: {
    label: "Postmark",
    help: "Server token from postmarkapp.com → Servers → Default Server → API Tokens",
  },
  sendgrid: {
    label: "SendGrid",
    help: "API key with Mail Send permission from sendgrid.com → Settings → API Keys",
  },
  resend: {
    label: "Resend",
    help: "API key from resend.com → API Keys",
  },
};

export function EmailIntegrationSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const integration = useQuery(api.emailIntegrations.get, { sessionToken });
  const upsert = useMutation(api.emailIntegrations.upsert);
  const remove = useMutation(api.emailIntegrations.remove);

  const canManage = operator.role !== "agent";

  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<Provider>("postmark");
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [inboundAlias, setInboundAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (integration && !editing) {
      setProvider(integration.provider as Provider);
      setFromAddress(integration.fromAddress);
      setFromName(integration.fromName ?? "");
      setInboundAlias(integration.inboundAlias);
    }
  }, [integration, editing]);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await upsert({
        sessionToken,
        provider,
        apiKey: apiKey.trim() || undefined,
        fromAddress: fromAddress.trim(),
        fromName: fromName.trim() || undefined,
        inboundAlias: inboundAlias.trim() || undefined,
        enabled: true,
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
    if (
      !confirm("Remove email integration? Inbound mail will stop being routed.")
    ) {
      return;
    }
    await remove({ sessionToken });
    setEditing(false);
  };

  const inboundUrl =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_CONVEX_URL
      ? process.env.NEXT_PUBLIC_CONVEX_URL.replace(
          /\.convex\.cloud$/,
          ".convex.site",
        ) + "/api/inbound/email"
      : "<convex-deployment>/api/inbound/email";

  return (
    <Card
      title="Email channel"
      description="Receive customer email in your inbox and reply with one click. Configure your ESP's inbound webhook to point at PraxTalk, then drop your API key here for outbound."
    >
      {integration && !editing ? (
        <div className="space-y-4">
          <dl className="rounded-xl border border-rule bg-paper-2/40 p-4">
            <Row
              label="Provider"
              value={providerInfo[integration.provider as Provider].label}
            />
            <Row label="From address" value={integration.fromAddress} mono />
            {integration.fromName ? (
              <Row label="From name" value={integration.fromName} />
            ) : null}
            <Row
              label="Inbound alias"
              value={`${integration.inboundAlias}@inbound.praxtalk.com`}
              mono
            />
            <Row
              label="API key"
              value={integration.apiKeyPreview ?? "(none)"}
              mono
            />
            <Row
              label="Status"
              value={integration.enabled ? "Enabled" : "Disabled"}
            />
          </dl>

          <div className="rounded-xl border border-rule bg-paper-2/40 p-4 text-[12.5px] leading-[1.6] text-ink">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              ESP setup
            </div>
            Point your provider's <em>inbound webhook</em> at:
            <pre className="mt-2 overflow-x-auto rounded-lg border border-rule bg-paper p-3 font-mono text-[12px]">
              {inboundUrl}
            </pre>
            <div className="mt-2 text-muted">
              Then route mail addressed to{" "}
              <code className="font-mono text-ink">
                {integration.inboundAlias}@inbound.praxtalk.com
              </code>{" "}
              into that webhook. The local-part is what we match — so anything
              landing at that alias arrives in this workspace's inbox.
            </div>
          </div>

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
              Provider
            </span>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            >
              {(Object.keys(providerInfo) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {providerInfo[p].label}
                </option>
              ))}
            </select>
            <span className="text-[11px] text-muted">{providerInfo[provider].help}</span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              API key {integration ? "(leave blank to keep current)" : ""}
            </span>
            <input
              type="text"
              required={!integration}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={integration ? "Stored — leave blank to keep" : "Provider API key"}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              From address
            </span>
            <input
              type="email"
              required
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="support@yourdomain.com"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              From name (optional)
            </span>
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Acme Support"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Inbound alias
            </span>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-rule-2 bg-paper px-3">
              <input
                type="text"
                required
                value={inboundAlias}
                onChange={(e) => setInboundAlias(e.target.value)}
                placeholder="support"
                className="flex-1 bg-transparent font-mono text-[13px] outline-none"
              />
              <span className="font-mono text-[12px] text-muted">
                @inbound.praxtalk.com
              </span>
            </div>
            <span className="text-[11px] text-muted">
              Customers email this address; we route it into your inbox.
              Lowercase, alphanumeric, no spaces.
            </span>
          </label>

          {error ? (
            <p className="sm:col-span-2 text-[12px] text-warn">{error}</p>
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
                  : "Connect email"}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          No email integration configured. Ask an admin to set it up.
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

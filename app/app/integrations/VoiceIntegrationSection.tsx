"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Provider = "callhippo" | "telecmi" | "twilio";

// Per-provider UI strings — labels, placeholders, help text. Adding a
// new provider = add an adapter in convex/voiceIntegrations.ts +
// convex/http.ts + an entry here. The user's flow doesn't change.
const providerInfo: Record<
  Provider,
  {
    label: string;
    apiKeyLabel: string;
    apiKeyPlaceholder: string;
    apiKeyHelp: string;
    apiTokenLabel: string;
    apiTokenPlaceholder: string;
    apiTokenHelp: string;
    webhookHint: string;
  }
> = {
  callhippo: {
    label: "CallHippo",
    apiKeyLabel: "Account email",
    apiKeyPlaceholder: "ops@yourdomain.com",
    apiKeyHelp: "The email you use to log into CallHippo.",
    apiTokenLabel: "API token",
    apiTokenPlaceholder: "From CallHippo Settings → Integrations → API",
    apiTokenHelp:
      "Find under Settings → Integrations → API in your CallHippo dashboard.",
    webhookHint:
      "In CallHippo Settings → Webhooks → Add Webhook. Subscribe to Call Ended + Voicemail events.",
  },
  telecmi: {
    label: "TeleCMI",
    apiKeyLabel: "App ID (appid)",
    apiKeyPlaceholder: "Your TeleCMI appid",
    apiKeyHelp: "From your TeleCMI app → API credentials.",
    apiTokenLabel: "Secret",
    apiTokenPlaceholder: "TeleCMI app secret",
    apiTokenHelp: "Issued alongside the appid in your TeleCMI app settings.",
    webhookHint:
      "In your TeleCMI app → Webhooks → Call Status. Method: POST, format: JSON.",
  },
  twilio: {
    label: "Twilio",
    apiKeyLabel: "Account SID",
    apiKeyPlaceholder: "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    apiKeyHelp: "From the Twilio Console homepage (Account → API keys & tokens).",
    apiTokenLabel: "Auth Token",
    apiTokenPlaceholder: "Twilio Auth Token (32 chars)",
    apiTokenHelp:
      "Same Console screen as the Account SID. Treat it like a password.",
    webhookHint:
      "In Twilio Console → Phone Numbers → <your number> → Voice → Status Callback URL. Method: POST.",
  },
};

export function VoiceIntegrationSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const integration = useQuery(api.voiceIntegrations.get, { sessionToken });
  const upsert = useMutation(api.voiceIntegrations.upsert);
  const remove = useMutation(api.voiceIntegrations.remove);

  const canManage = operator.role !== "agent";

  const [editing, setEditing] = useState(false);
  const [provider, setProvider] = useState<Provider>("callhippo");
  const [apiKey, setApiKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [defaultNumber, setDefaultNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (integration && !editing) {
      setProvider(integration.provider as Provider);
      setApiKey(integration.apiKey);
      setDefaultNumber(integration.defaultNumber ?? "");
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
        apiKey: apiKey.trim(),
        apiToken: apiToken.trim() || undefined,
        defaultNumber: defaultNumber.trim() || undefined,
        enabled: true,
      });
      setApiToken("");
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
        "Remove voice integration? Inbound calls will stop being recorded.",
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
        ) + "/api/inbound/voice"
      : "<convex-deployment>/api/inbound/voice";

  const info = providerInfo[provider];

  return (
    <Card
      title="Voice channel"
      description="Receive calls in your inbox alongside chat. Switch providers anytime — pick from the dropdown and paste the new credentials. Each call lands as a conversation with duration, recording link, and (where supported) transcript."
    >
      {integration && !editing ? (
        <div className="space-y-4">
          <dl className="rounded-xl border border-rule bg-paper-2/40 p-4">
            <Row
              label="Provider"
              value={providerInfo[integration.provider as Provider].label}
            />
            <Row
              label={
                providerInfo[integration.provider as Provider].apiKeyLabel
              }
              value={integration.apiKey}
              mono
            />
            <Row
              label="Default number"
              value={integration.defaultNumber ?? "(none)"}
              mono
            />
            <Row
              label={
                providerInfo[integration.provider as Provider].apiTokenLabel
              }
              value={integration.apiTokenPreview ?? "(none)"}
              mono
            />
            <Row
              label="Status"
              value={integration.enabled ? "Enabled" : "Disabled"}
            />
          </dl>

          <div className="rounded-xl border border-rule bg-paper-2/40 p-4 text-[12.5px] leading-[1.6] text-ink">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              Webhook setup
            </div>
            {providerInfo[integration.provider as Provider].webhookHint}
            <pre className="mt-2 overflow-x-auto rounded-lg border border-rule bg-paper p-3 font-mono text-[12px]">
              {`URL    : ${webhookUrl}?secret=${integration.webhookSecret}\nMethod : POST`}
            </pre>
            <div className="mt-2 text-muted">
              Same URL works for every provider — the{" "}
              <code className="font-mono text-ink">?secret=…</code> is what
              routes the call to your workspace. Rotate by removing and
              re-adding the integration.
            </div>
          </div>

          {canManage ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(true);
                  setApiToken("");
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
          <label className="flex flex-col gap-1 sm:col-span-2">
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
            <span className="text-[11px] text-muted">
              Switching providers is just changing this dropdown — your
              workspace and conversation history don&apos;t move.
            </span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              {info.apiKeyLabel}
            </span>
            <input
              type="text"
              required
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={info.apiKeyPlaceholder}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">{info.apiKeyHelp}</span>
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Default outbound number (E.164)
            </span>
            <input
              type="text"
              value={defaultNumber}
              onChange={(e) => setDefaultNumber(e.target.value)}
              placeholder="+919876543210"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">
              Used when operators click-to-call from the inbox.
            </span>
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              {info.apiTokenLabel}{" "}
              {integration ? "(leave blank to keep current)" : ""}
            </span>
            <input
              type="text"
              required={!integration}
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                integration ? "Stored — leave blank to keep" : info.apiTokenPlaceholder
              }
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">{info.apiTokenHelp}</span>
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
                  : `Connect ${info.label}`}
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          No voice integration configured. Ask an admin to set it up.
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

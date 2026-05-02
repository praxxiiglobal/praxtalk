"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Provider = "postmark" | "sendgrid" | "resend";

const PROVIDER_LABELS: Record<Provider, string> = {
  postmark: "Postmark",
  sendgrid: "SendGrid",
  resend: "Resend",
};

/**
 * Per-operator personal mailbox. When set, mail to
 * sarah@inbound.praxtalk.com lands directly in Sarah's inbox
 * (auto-assigned), and her replies go out via her own ESP API key
 * with her own from-address. Falls back to the workspace shared
 * mailbox if not set.
 */
export function PersonalEmailSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const mine = useQuery(api.emailIntegrations.getMine, { sessionToken });
  const team = useQuery(api.emailIntegrations.listTeamPersonalMailboxes, {
    sessionToken,
  });
  const upsert = useMutation(api.emailIntegrations.upsertMine);
  const remove = useMutation(api.emailIntegrations.removeMine);

  const [provider, setProvider] = useState<Provider>("postmark");
  const [apiKey, setApiKey] = useState("");
  const [fromAddress, setFromAddress] = useState("");
  const [fromName, setFromName] = useState("");
  const [inboundAlias, setInboundAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (mine) {
      setProvider(mine.provider);
      setFromAddress(mine.fromAddress);
      setFromName(mine.fromName ?? "");
      setInboundAlias(mine.inboundAlias);
      setApiKey("");
    }
  }, [mine?._id]);

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await upsert({
        sessionToken,
        provider,
        apiKey: apiKey || undefined,
        fromAddress,
        fromName: fromName || undefined,
        inboundAlias: inboundAlias || undefined,
        enabled: true,
      });
      setMsg({ kind: "ok", text: "Personal mailbox saved." });
      setApiKey("");
    } catch (e) {
      setMsg({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't save.",
      });
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (
      !confirm(
        "Remove your personal mailbox? Mail to your alias will stop routing to you.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await remove({ sessionToken });
      setApiKey("");
      setFromAddress("");
      setFromName("");
      setInboundAlias("");
      setMsg({ kind: "ok", text: "Personal mailbox removed." });
    } catch (e) {
      setMsg({
        kind: "error",
        text: e instanceof Error ? e.message : "Couldn't remove.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Your personal mailbox"
      description={`Optional — give ${operator.name} their own inbound address + outbound ESP. Mail to your alias auto-assigns to you, and your replies go out via your own from-address. Falls back to the team mailbox above if not set.`}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Provider">
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            >
              {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="API key">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                mine?.hasApiKey
                  ? `${mine.apiKeyPreview ?? "••••••"} — leave blank to keep`
                  : ""
              }
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="From address (yours)">
            <input
              type="email"
              value={fromAddress}
              onChange={(e) => setFromAddress(e.target.value)}
              placeholder="sarah@acme.com"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="From name (optional)">
            <input
              type="text"
              value={fromName}
              onChange={(e) => setFromName(e.target.value)}
              placeholder="Sarah from Acme"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Inbound alias (your local-part)">
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={inboundAlias}
                onChange={(e) => setInboundAlias(e.target.value)}
                placeholder={operator.name.toLowerCase()}
                className="h-10 flex-1 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
              />
              <span className="font-mono text-[12px] text-muted">
                @inbound.praxtalk.com
              </span>
            </div>
          </Field>
        </div>

        {msg && (
          <div
            role="alert"
            className={cn(
              "rounded-xl px-3 py-2 text-[12px]",
              msg.kind === "ok"
                ? "border border-good/30 bg-good/10 text-good"
                : "border border-red-300/40 bg-red-50/40 text-red-900",
            )}
          >
            {msg.text}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onSave}
            disabled={busy || !fromAddress.trim()}
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-xs font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
          >
            {busy ? "Saving…" : mine ? "Update" : "Set up personal mailbox"}
          </button>
          {mine && (
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-xs font-medium text-ink hover:bg-paper-2 disabled:opacity-50"
            >
              Remove
            </button>
          )}
        </div>

        {team && team.length > 0 && (
          <div className="border-t border-rule pt-4">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              Team's personal mailboxes
            </div>
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {team.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-ink">
                    {t.operatorName}{" "}
                    <span className="text-muted">{t.operatorEmail}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {t.inboundAlias}@inbound.praxtalk.com →{" "}
                    {t.fromAddress}
                    {!t.enabled ? " · disabled" : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Card>
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

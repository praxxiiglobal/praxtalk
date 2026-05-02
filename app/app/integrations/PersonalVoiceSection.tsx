"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Provider = "callhippo" | "telecmi" | "twilio";

const PROVIDER_LABELS: Record<Provider, string> = {
  callhippo: "CallHippo",
  telecmi: "TeleCMI",
  twilio: "Twilio",
};

/**
 * Per-operator voice / SMS integration. Lives on the same page as the
 * workspace-shared one. When an operator configures a personal line
 * here:
 *  - Inbound calls / SMS to their number auto-assign to them
 *  - Outbound dial pad + SMS replies use this row's credentials and
 *    default number
 * Fully optional — operators without one fall back to the workspace
 * shared integration above.
 */
export function PersonalVoiceSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const mine = useQuery(api.voiceIntegrations.getMine, { sessionToken });
  const team = useQuery(api.voiceIntegrations.listTeamPersonalLines, {
    sessionToken,
  });
  const upsert = useMutation(api.voiceIntegrations.upsertMine);
  const remove = useMutation(api.voiceIntegrations.removeMine);

  const [provider, setProvider] = useState<Provider>("twilio");
  const [apiKey, setApiKey] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [defaultNumber, setDefaultNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (mine) {
      setProvider(mine.provider);
      setApiKey(mine.apiKey);
      setDefaultNumber(mine.defaultNumber ?? "");
      setApiToken(""); // never round-trip
    }
  }, [mine?._id]);

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await upsert({
        sessionToken,
        provider,
        apiKey,
        apiToken: apiToken || undefined,
        defaultNumber: defaultNumber || undefined,
        enabled: true,
      });
      setMsg({ kind: "ok", text: "Personal line saved." });
      setApiToken("");
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
    if (!confirm("Remove your personal voice line? Calls to your number will stop routing to you.")) return;
    setBusy(true);
    setMsg(null);
    try {
      await remove({ sessionToken });
      setApiKey("");
      setApiToken("");
      setDefaultNumber("");
      setMsg({ kind: "ok", text: "Personal line removed." });
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
      title="Your personal voice / SMS line"
      description={`Optional — give ${operator.name} their own number. Inbound calls + texts to it auto-assign to you, and your dial pad routes through it. Falls back to the team line above if not set.`}
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
          <Field
            label={
              provider === "twilio"
                ? "Account SID"
                : provider === "callhippo"
                  ? "Account email"
                  : "App ID"
            }
          >
            <input
              type="text"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder=""
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field
            label={
              provider === "twilio"
                ? "Auth Token"
                : provider === "callhippo"
                  ? "API Token"
                  : "Secret"
            }
          >
            <input
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder={
                mine?.hasApiToken
                  ? `${mine.apiTokenPreview ?? "••••••"} — leave blank to keep`
                  : ""
              }
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Your number (E.164)">
            <input
              type="tel"
              value={defaultNumber}
              onChange={(e) => setDefaultNumber(e.target.value)}
              placeholder="+15551234567"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
            />
          </Field>
        </div>

        {mine && mine.webhookSecret && (
          <div className="rounded-xl border border-dashed border-rule-2 bg-paper-2/40 px-3 py-2 text-[11px] text-muted">
            <strong className="text-ink">Inbound webhook URL</strong>
            <div className="mt-1 break-all font-mono text-[10.5px] text-ink">
              {(typeof window !== "undefined"
                ? window.location.origin
                : "")
                .replace("praxtalk.com", "industrious-moose-892.convex.site")
                .replace("localhost:3000", "scintillating-butterfly-213.convex.site")}
              /api/inbound/voice?secret={mine.webhookSecret}
            </div>
            <div className="mt-1">
              Paste this in your provider's webhook config (calls + SMS land
              here when they ring your personal number).
            </div>
          </div>
        )}

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
            disabled={busy || !apiKey.trim()}
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-xs font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
          >
            {busy ? "Saving…" : mine ? "Update" : "Set up personal line"}
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
              Team's personal lines
            </div>
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {team.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-ink">
                    {t.operatorName}{" "}
                    <span className="text-muted">{t.operatorEmail}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {t.defaultNumber ?? "no number set"} ·{" "}
                    {PROVIDER_LABELS[t.provider]}
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

"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Provider = "postmark" | "sendgrid" | "resend" | "smtp_imap";

const PROVIDER_LABELS: Record<Provider, string> = {
  postmark: "Postmark",
  sendgrid: "SendGrid",
  resend: "Resend",
  smtp_imap: "SMTP / IMAP (Zoho, G-Suite, etc.)",
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
  const [smtpHost, setSmtpHost] = useState("smtp.zoho.com");
  const [smtpPort, setSmtpPort] = useState("465");
  const [smtpUser, setSmtpUser] = useState("");
  const [imapHost, setImapHost] = useState("imap.zoho.com");
  const [imapPort, setImapPort] = useState("993");
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
        smtpHost: provider === "smtp_imap" ? smtpHost || undefined : undefined,
        smtpPort:
          provider === "smtp_imap"
            ? Number(smtpPort) || undefined
            : undefined,
        smtpUser:
          provider === "smtp_imap"
            ? smtpUser || fromAddress || undefined
            : undefined,
        imapHost: provider === "smtp_imap" ? imapHost || undefined : undefined,
        imapPort:
          provider === "smtp_imap"
            ? Number(imapPort) || undefined
            : undefined,
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
          {provider !== "smtp_imap" && (
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
          )}
        </div>

        {provider === "smtp_imap" && (
          <div className="rounded-xl border border-rule-2 bg-paper-2/40 p-4">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              SMTP + IMAP connection
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="SMTP host">
                <input
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  placeholder="smtp.zoho.com"
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
                />
              </Field>
              <Field label="SMTP port">
                <input
                  type="number"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  placeholder="465"
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
                />
              </Field>
              <Field label="SMTP username (usually your email)">
                <input
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  placeholder={fromAddress || "you@yourcompany.com"}
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
                />
              </Field>
              <Field label="IMAP host">
                <input
                  type="text"
                  value={imapHost}
                  onChange={(e) => setImapHost(e.target.value)}
                  placeholder="imap.zoho.com"
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
                />
              </Field>
              <Field label="IMAP port">
                <input
                  type="number"
                  value={imapPort}
                  onChange={(e) => setImapPort(e.target.value)}
                  placeholder="993"
                  className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
                />
              </Field>
            </div>
            <p className="mt-3 text-[11px] leading-[1.4] text-muted">
              Use an <strong>app password</strong>, not your account
              password — Zoho/Google/etc. require this when 2FA is on.
              Generate one in your provider's account settings → Security
              → App Passwords. Inbound polls every minute.
            </p>
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

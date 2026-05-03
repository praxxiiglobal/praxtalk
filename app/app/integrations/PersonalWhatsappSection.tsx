"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

/**
 * Per-operator personal WhatsApp Business number. When configured:
 *   - inbound to that number auto-assigns conversations to the owner
 *   - outbound replies (and dial-pad-initiated outbound) use this row's
 *     access token + phoneNumberId
 * Falls back to the workspace-shared WhatsApp integration if not set.
 *
 * Each operator needs their OWN Meta Business / WhatsApp number for
 * this — Meta doesn't allow one number to be shared across multiple
 * Cloud API integrations.
 */
export function PersonalWhatsappSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const mine = useQuery(api.whatsappIntegrations.getMine, { sessionToken });
  const team = useQuery(api.whatsappIntegrations.listTeamPersonalNumbers, {
    sessionToken,
  });
  const upsert = useMutation(api.whatsappIntegrations.upsertMine);
  const remove = useMutation(api.whatsappIntegrations.removeMine);

  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [businessAccountId, setBusinessAccountId] = useState("");
  const [displayPhoneNumber, setDisplayPhoneNumber] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(
    null,
  );

  useEffect(() => {
    if (mine) {
      setPhoneNumberId(mine.phoneNumberId);
      setBusinessAccountId(mine.businessAccountId ?? "");
      setDisplayPhoneNumber(mine.displayPhoneNumber ?? "");
      setAccessToken("");
    }
  }, [mine?._id]);

  const onSave = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await upsert({
        sessionToken,
        phoneNumberId,
        businessAccountId: businessAccountId || undefined,
        displayPhoneNumber: displayPhoneNumber || undefined,
        accessToken: accessToken || undefined,
        enabled: true,
      });
      setMsg({ kind: "ok", text: "Personal WhatsApp number saved." });
      setAccessToken("");
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
        "Remove your personal WhatsApp number? Inbound stops routing to you and outbound falls back to the team number.",
      )
    )
      return;
    setBusy(true);
    setMsg(null);
    try {
      await remove({ sessionToken });
      setPhoneNumberId("");
      setBusinessAccountId("");
      setDisplayPhoneNumber("");
      setAccessToken("");
      setMsg({ kind: "ok", text: "Personal WhatsApp number removed." });
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
      title="Your personal WhatsApp number"
      description={`Optional — give ${operator.name} their own WABA number. Inbound auto-assigns to you; outbound from your dial pad uses this number. You'll need a separate Meta Business app + phone number per operator (Meta doesn't share numbers across Cloud API connections).`}
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Phone Number ID (from Meta)">
            <input
              type="text"
              value={phoneNumberId}
              onChange={(e) => setPhoneNumberId(e.target.value)}
              placeholder="106540352242922"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
            />
          </Field>
          <Field label="WABA ID (optional)">
            <input
              type="text"
              value={businessAccountId}
              onChange={(e) => setBusinessAccountId(e.target.value)}
              placeholder="103906019395066"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
            />
          </Field>
          <Field label="Display number (E.164)">
            <input
              type="tel"
              value={displayPhoneNumber}
              onChange={(e) => setDisplayPhoneNumber(e.target.value)}
              placeholder="+15551234567"
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] font-mono outline-none focus:border-ink"
            />
          </Field>
          <Field label="Access token (System User token)">
            <input
              type="password"
              value={accessToken}
              onChange={(e) => setAccessToken(e.target.value)}
              placeholder={
                mine?.hasAccessToken
                  ? `${mine.accessTokenPreview ?? "••••••"} — leave blank to keep`
                  : ""
              }
              className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
            />
          </Field>
        </div>

        {mine && mine.verifyToken && (
          <div className="rounded-xl border border-dashed border-rule-2 bg-paper-2/40 px-3 py-2 text-[11px] text-muted">
            <strong className="text-ink">Webhook verify token</strong>
            <div className="mt-1 break-all font-mono text-[10.5px] text-ink">
              {mine.verifyToken}
            </div>
            <div className="mt-1">
              Paste this into Meta App → WhatsApp → Webhooks → Verify token.
              Callback URL is the same as the team's WhatsApp webhook
              (workspace-wide route at <code>/api/inbound/whatsapp</code>).
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
            disabled={busy || !phoneNumberId.trim()}
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-xs font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
          >
            {busy
              ? "Saving…"
              : mine
                ? "Update"
                : "Set up personal WhatsApp"}
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
              Team's personal WhatsApp numbers
            </div>
            <ul className="flex flex-col gap-1.5 text-[12px]">
              {team.map((t, i) => (
                <li key={i} className="flex items-center justify-between gap-3">
                  <span className="text-ink">
                    {t.operatorName}{" "}
                    <span className="text-muted">{t.operatorEmail}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted">
                    {t.displayPhoneNumber ?? "no number set"}
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

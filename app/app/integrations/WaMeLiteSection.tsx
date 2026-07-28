"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../_components/DashboardShell";
import { Card } from "../_components/PageHeader";

/**
 * WhatsApp click-to-chat ("wa.me lite") — for workspaces that just
 * want a "Chat on WhatsApp" button on their site without setting up
 * the full WhatsApp Business Cloud API. Stores a phone number per
 * brand and renders the deep-link snippet for embedding.
 *
 * Limitation vs full WhatsApp integration: messages don't flow into
 * the PraxTalk inbox. Visitors land in the brand's WhatsApp account
 * directly. Use this when "fast contact" matters more than unified
 * inbox.
 */
export function WaMeLiteSection() {
  const { sessionToken } = useDashboardAuth();
  const brands = useQuery(api.brands.listMine, { sessionToken });
  return (
    <Card
      title="WhatsApp click-to-chat (wa.me lite)"
      description="One-tap link that opens WhatsApp with your number prefilled. No API setup, no inbox sync — just a fast contact button. Set it per brand."
    >
      {brands === undefined ? (
        <p className="text-sm text-muted">Loading brands…</p>
      ) : brands.length === 0 ? (
        <p className="text-sm text-muted">
          No brands yet. Create one in /app/brands first.
        </p>
      ) : (
        <ul className="m-0 flex flex-col gap-3 p-0">
          {brands.map((b) => (
            <BrandRow
              key={b._id}
              brandId={b._id}
              brandName={b.name}
              currentPhone={b.waMePhone ?? ""}
              currentMsg={b.waMePrefilledMessage ?? ""}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function BrandRow({
  brandId,
  brandName,
  currentPhone,
  currentMsg,
}: {
  brandId: Id<"brands">;
  brandName: string;
  currentPhone: string;
  currentMsg: string;
}) {
  const { sessionToken } = useDashboardAuth();
  const update = useMutation(api.brands.update);
  const [phone, setPhone] = useState(currentPhone);
  const [msg, setMsg] = useState(currentMsg);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    setPhone(currentPhone);
    setMsg(currentMsg);
  }, [currentPhone, currentMsg]);

  const dirty = phone !== currentPhone || msg !== currentMsg;

  const onSave = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await update({
        sessionToken,
        brandId,
        waMePhone: phone,
        waMePrefilledMessage: msg,
      });
      setStatus("Saved.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  // Strip non-digits for the actual link generation (the input may
  // still have spaces/dashes the user typed for readability).
  const digits = phone.replace(/[^\d]/g, "");
  const link =
    digits.length > 0
      ? `https://wa.me/${digits}${
          msg.trim() ? `?text=${encodeURIComponent(msg.trim())}` : ""
        }`
      : null;

  return (
    <li className="rounded-xl border border-rule-2 bg-paper-2/40 p-4">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="text-[13px] font-semibold text-ink">{brandName}</div>
        {currentPhone ? (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-good">
            Active
          </span>
        ) : (
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Not configured
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            WhatsApp number (international)
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="91 98765 43210"
            className="h-9 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Pre-filled message (optional)
          </span>
          <input
            type="text"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Hi, I'd like to know about…"
            className="h-9 rounded-lg border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
          />
        </label>
      </div>

      <p className="mt-1.5 text-[10.5px] leading-[1.5] text-muted">
        Country code + number, no leading + sign. Spaces and dashes are
        ignored. The pre-filled message lands in the visitor&apos;s
        WhatsApp before they tap send.
      </p>

      {link && (
        <div className="mt-3 rounded-lg border border-rule bg-paper p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            Generated link
          </div>
          <a
            href={link}
            target="_blank"
            rel="noreferrer"
            className="mt-1 block break-all font-mono text-[11.5px] text-ink hover:text-accent"
          >
            {link}
          </a>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(() => {
                setStatus("Copied to clipboard.");
              });
            }}
            className="mt-2 inline-flex h-7 items-center rounded-full border border-rule-2 px-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-ink hover:bg-paper-2"
          >
            Copy link
          </button>
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || busy}
          className="inline-flex h-8 items-center rounded-full bg-ink px-3 font-mono text-[10.5px] uppercase tracking-[0.06em] text-paper transition disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save number"}
        </button>
        {status && <span className="text-[11.5px] text-muted">{status}</span>}
      </div>
    </li>
  );
}

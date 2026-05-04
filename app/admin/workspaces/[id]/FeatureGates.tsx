"use client";

import { useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

type Features = {
  channels: {
    chat: boolean;
    email: boolean;
    whatsapp: boolean;
    voice: boolean;
    sms: boolean;
  };
  modules: {
    atlasAi: boolean;
    leads: boolean;
    bookingPages: boolean;
    multiBrand: boolean;
    analytics: boolean;
  };
};

type ChannelKey = keyof Features["channels"];
type ModuleKey = keyof Features["modules"];

const CHANNEL_LABELS: Record<ChannelKey, { name: string; hint: string }> = {
  chat: { name: "Web chat", hint: "The PraxTalk chat widget on the customer's site." },
  email: { name: "Email", hint: "Inbound + outbound email channel (Postmark / SendGrid / Resend)." },
  whatsapp: { name: "WhatsApp", hint: "Meta Business Cloud API channel." },
  voice: { name: "Voice", hint: "Inbound + outbound calling (CallHippo / TeleCMI / Twilio)." },
  sms: { name: "SMS", hint: "SMS messaging via the configured voice provider." },
};

const MODULE_LABELS: Record<ModuleKey, { name: string; hint: string }> = {
  atlasAi: { name: "Atlas AI", hint: "Autonomous reply / draft agent + KB ingest." },
  leads: { name: "Leads", hint: "Save conversations as leads, pipeline + remarks thread." },
  bookingPages: { name: "Booking pages", hint: "Calendly-style booking pages + Schedules." },
  multiBrand: { name: "Multi-brand", hint: "More than one brand per workspace (each with its own widget)." },
  analytics: { name: "Analytics", hint: "Conversation + agent metrics dashboard." },
};

export function FeatureGates({
  workspaceId,
  sessionToken,
  initial,
}: {
  workspaceId: Id<"workspaces">;
  sessionToken: string;
  initial: Features;
}) {
  const setFeatures = useMutation(api._admin.setFeatures);
  const [draft, setDraft] = useState<Features>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);

  const onSave = async () => {
    if (!dirty || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await setFeatures({
        sessionToken,
        workspaceId,
        features: {
          channels: draft.channels,
          ...draft.modules,
        },
      });
      setMsg("Saved.");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const setChannel = (k: ChannelKey, v: boolean) =>
    setDraft((d) => ({ ...d, channels: { ...d.channels, [k]: v } }));
  const setModule = (k: ModuleKey, v: boolean) =>
    setDraft((d) => ({ ...d, modules: { ...d.modules, [k]: v } }));

  const channelOnCount = Object.values(draft.channels).filter(Boolean).length;
  const moduleOnCount = Object.values(draft.modules).filter(Boolean).length;

  return (
    <div className="rounded-2xl border border-rule-2 bg-paper p-5">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <div className="text-[14px] font-semibold tracking-[-0.01em] text-ink">
          Feature gates
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
          {channelOnCount}/5 channels · {moduleOnCount}/5 modules
        </span>
      </div>
      <p className="mb-4 text-[11.5px] leading-[1.45] text-muted">
        Disable a feature to hide it from this workspace&apos;s dashboard
        (nav items, channel tabs, settings sections all gate on these).
        Defaults to all-on for new workspaces. Server enforcement is
        UI-level for now — add to billing-sensitive paths if you want
        a hard gate.
      </p>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Channels">
          {(Object.keys(CHANNEL_LABELS) as ChannelKey[]).map((k) => (
            <ToggleRow
              key={k}
              label={CHANNEL_LABELS[k].name}
              hint={CHANNEL_LABELS[k].hint}
              value={draft.channels[k]}
              onChange={(v) => setChannel(k, v)}
            />
          ))}
        </Section>

        <Section title="Modules">
          {(Object.keys(MODULE_LABELS) as ModuleKey[]).map((k) => (
            <ToggleRow
              key={k}
              label={MODULE_LABELS[k].name}
              hint={MODULE_LABELS[k].hint}
              value={draft.modules[k]}
              onChange={(v) => setModule(k, v)}
            />
          ))}
        </Section>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-rule-2 pt-4">
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || busy}
          className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save feature gates"}
        </button>
        {dirty && !busy && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-warn">
            Unsaved changes
          </span>
        )}
        {msg && <span className="text-[12px] text-muted">{msg}</span>}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        {title}
      </div>
      <ul className="m-0 flex flex-col gap-1 p-0">{children}</ul>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-paper-2/40">
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">{label}</div>
        <div className="mt-0.5 text-[11px] leading-[1.4] text-muted">{hint}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={`${label}: ${value ? "enabled" : "disabled"}`}
        onClick={() => onChange(!value)}
        className={
          "relative mt-1 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition " +
          (value ? "bg-good" : "bg-rule")
        }
      >
        <span
          className={
            "inline-block h-4 w-4 transform rounded-full bg-paper shadow transition " +
            (value ? "translate-x-4" : "translate-x-0.5")
          }
        />
      </button>
    </li>
  );
}

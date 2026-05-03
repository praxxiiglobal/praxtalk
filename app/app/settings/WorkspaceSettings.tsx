"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { DashboardThemeSection } from "./DashboardThemeSection";

const WORKSPACE_LINKS: { href: string; label: string; description: string }[] = [
  {
    href: "/app/integrations",
    label: "Integrations",
    description:
      "Email (Postmark/SendGrid/Resend/SMTP), WhatsApp, Voice/SMS (Twilio/CallHippo/TeleCMI), Botim, REST API keys, webhooks.",
  },
  {
    href: "/app/brands",
    label: "Brands",
    description:
      "Multi-brand widgets, colours, welcome messages — every brand has its own visitor-facing identity.",
  },
  {
    href: "/app/team",
    label: "Team",
    description:
      "Operator roster, roles (owner / admin / agent), and per-brand access control.",
  },
  {
    href: "/app/saved-replies",
    label: "Saved replies",
    description:
      "Workspace-wide canned responses. Operators insert from the conversation composer.",
  },
  {
    href: "/app/billing",
    label: "Plan & billing",
    description:
      "Current plan, AI auto-reply usage, PayPal/Razorpay subscription state, and invoices — upgrade or cancel here.",
  },
];

export function WorkspaceSettings() {
  const { workspace, sessionToken, operator } = useDashboardAuth();
  const updateIdentity = useMutation(api.workspaces.updateIdentity);
  const canEdit = operator.role !== "agent";

  return (
    <Card
      title="Workspace"
      description="Identity, brands, team, billing, and dashboard theme — everything about your workspace."
    >
      <SectionHeader>Identity</SectionHeader>
      <dl className="divide-y divide-rule">
        <EditableRow
          label="Name"
          value={workspace.name}
          editable={canEdit}
          hint="Shown in the dashboard, invite emails, and the visitor widget header."
          onSave={async (next) => {
            await updateIdentity({ sessionToken, name: next });
          }}
        />
        <EditableRow
          label="Slug"
          value={workspace.slug}
          editable={canEdit}
          mono
          hint="Used in invite links. Lowercase letters, numbers, and dashes only."
          onSave={async (next) => {
            await updateIdentity({ sessionToken, slug: next });
          }}
        />
        <ReadOnlyRow label="Workspace ID" value={workspace._id} mono truncate />
      </dl>

      <SectionHeader>Manage</SectionHeader>
      <ul className="divide-y divide-rule">
        {WORKSPACE_LINKS.map((l) => (
          <li key={l.href}>
            <Link
              href={l.href}
              className="flex items-center justify-between gap-3 py-3 transition hover:bg-paper-2"
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-medium text-ink">
                  {l.label}
                </div>
                <div className="mt-0.5 text-[12px] leading-[1.4] text-muted">
                  {l.description}
                </div>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <SectionHeader>Dashboard theme</SectionHeader>
      <p className="-mt-1 mb-3 text-[12px] leading-[1.4] text-muted">
        Match the operator dashboard to your brand colour. Affects every
        operator in your workspace.
      </p>
      <DashboardThemeSection />
    </Card>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-5 mb-2 border-t border-rule pt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted first:mt-0 first:border-t-0 first:pt-0">
      {children}
    </div>
  );
}

function ReadOnlyRow({
  label,
  value,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={[
          "text-sm text-ink",
          mono ? "font-mono text-[13px]" : "",
          truncate ? "truncate sm:max-w-[60%]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

function EditableRow({
  label,
  value,
  mono,
  editable,
  hint,
  onSave,
}: {
  label: string;
  value: string;
  mono?: boolean;
  editable: boolean;
  hint?: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginEdit = () => {
    setDraft(value);
    setError(null);
    setEditing(true);
  };
  const cancel = () => {
    setEditing(false);
    setError(null);
    setDraft(value);
  };
  const save = async () => {
    if (draft.trim() === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <dt className="text-sm text-muted">{label}</dt>
        <dd className="flex items-center gap-3 sm:max-w-[70%]">
          <span
            className={[
              "truncate text-sm text-ink",
              mono ? "font-mono text-[13px]" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {value}
          </span>
          {editable && (
            <button
              type="button"
              onClick={beginEdit}
              className="shrink-0 rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted transition hover:text-ink"
            >
              Edit
            </button>
          )}
        </dd>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 py-3">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-sm text-muted">{label}</dt>
      </div>
      <input
        type="text"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !busy) save();
          if (e.key === "Escape") cancel();
        }}
        disabled={busy}
        className={[
          "h-10 w-full rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink",
          mono ? "font-mono text-[13px]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {hint && (
        <p className="text-[11px] leading-[1.4] text-muted">{hint}</p>
      )}
      {error && (
        <p className="text-[11px] text-warn" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={cancel}
          disabled={busy}
          className="rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy || !draft.trim()}
          className="rounded-full bg-ink px-3 py-1 text-[11px] font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

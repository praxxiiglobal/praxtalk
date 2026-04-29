"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { useSelectedBrand } from "../useSelectedBrand";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Status = "new" | "contacted" | "qualified" | "won" | "lost";

const statuses: { value: Status | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const statusToneMap: Record<Status, string> = {
  new: "bg-accent-soft text-accent-deep",
  contacted: "bg-warn/15 text-warn",
  qualified: "bg-good/15 text-good",
  won: "bg-good text-paper",
  lost: "bg-paper-2 text-muted",
};

export function LeadsView() {
  const { sessionToken } = useDashboardAuth();
  const selectedBrand = useSelectedBrand();
  const [filter, setFilter] = useState<Status | "all">("all");
  const [selectedId, setSelectedId] = useState<Id<"leads"> | null>(null);

  const leads = useQuery(api.leads.list, {
    sessionToken,
    status: filter === "all" ? undefined : filter,
    brandId: selectedBrand ?? undefined,
  });

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          {statuses.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setFilter(s.value)}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                filter === s.value
                  ? "bg-ink text-paper"
                  : "border border-rule-2 text-muted hover:text-ink",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </Card>

      {leads === undefined ? (
        <Card>
          <div className="py-8 text-center text-sm text-muted">Loading…</div>
        </Card>
      ) : leads.length === 0 ? (
        <Card>
          <div className="rounded-xl border border-dashed border-rule p-8 text-center text-sm text-muted">
            No leads yet. Promote a conversation from the{" "}
            <a href="/app" className="text-ink underline-offset-2 hover:underline">
              inbox
            </a>{" "}
            with the <em>Save as Lead</em> button.
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-rule">
            {leads.map((l) => (
              <LeadRow
                key={l._id}
                lead={l}
                expanded={selectedId === l._id}
                onToggle={() =>
                  setSelectedId(selectedId === l._id ? null : l._id)
                }
              />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function LeadRow({
  lead,
  expanded,
  onToggle,
}: {
  lead: {
    _id: Id<"leads">;
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
    status: Status;
    location?: {
      city?: string;
      region?: string;
      country?: string;
    };
    ip?: string;
    conversationId?: Id<"conversations">;
    updatedAt: number;
    brand: { _id: Id<"brands">; name: string; primaryColor: string } | null;
  };
  expanded: boolean;
  onToggle: () => void;
}) {
  const { sessionToken } = useDashboardAuth();
  const updateStatus = useMutation(api.leads.updateStatus);
  const updateLead = useMutation(api.leads.update);

  const [notes, setNotes] = useState(lead.notes ?? "");
  const [busy, setBusy] = useState(false);

  const initials = lead.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const locLabel = lead.location
    ? [lead.location.city, lead.location.country].filter(Boolean).join(", ")
    : "";

  const onStatusChange = async (next: Status) => {
    setBusy(true);
    try {
      await updateStatus({ sessionToken, leadId: lead._id, status: next });
    } finally {
      setBusy(false);
    }
  };

  const onSaveNotes = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updateLead({ sessionToken, leadId: lead._id, notes });
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="py-3">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 text-left transition"
      >
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-2 font-mono text-[11px] font-semibold text-ink">
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {lead.name}
            </span>
            {lead.brand ? (
              <span
                className="inline-flex max-w-[120px] shrink-0 items-center truncate whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] text-paper"
                style={{ backgroundColor: lead.brand.primaryColor }}
                title={lead.brand.name}
              >
                {lead.brand.name}
              </span>
            ) : null}
          </div>
          <div className="truncate font-mono text-[11px] text-muted">
            {[lead.email, lead.phone, locLabel].filter(Boolean).join(" · ") ||
              "no contact info"}
          </div>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
            statusToneMap[lead.status],
          )}
        >
          {lead.status}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 grid gap-3 rounded-xl border border-rule bg-paper-2/40 p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              Update status
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["new", "contacted", "qualified", "won", "lost"] as Status[]).map(
                (s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onStatusChange(s)}
                    disabled={busy || lead.status === s}
                    className={cn(
                      "rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] transition",
                      lead.status === s
                        ? statusToneMap[s] + " ring-1 ring-ink/20"
                        : "border border-rule-2 text-muted hover:text-ink",
                    )}
                  >
                    {s}
                  </button>
                ),
              )}
            </div>
          </div>

          {lead.email ? (
            <Detail label="Email" value={lead.email} link={`mailto:${lead.email}`} />
          ) : null}
          {lead.phone ? (
            <Detail label="Phone" value={lead.phone} link={`tel:${lead.phone}`} />
          ) : null}
          {locLabel ? <Detail label="Location" value={locLabel} /> : null}
          {lead.ip ? <Detail label="IP" value={lead.ip} mono /> : null}

          <form
            onSubmit={onSaveNotes}
            className="flex flex-col gap-2 sm:col-span-2"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              Notes
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full resize-none rounded-lg border border-rule-2 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
            />
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-muted">
                last updated {timeAgo(lead.updatedAt)}
              </span>
              <div className="flex gap-2">
                {lead.conversationId ? (
                  <a
                    href="/app"
                    className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium"
                  >
                    Open conversation
                  </a>
                ) : null}
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-[12px] font-medium text-paper disabled:opacity-60"
                >
                  Save notes
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </li>
  );
}

function Detail({
  label,
  value,
  link,
  mono,
}: {
  label: string;
  value: string;
  link?: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        {label}
      </div>
      {link ? (
        <a
          href={link}
          className={cn(
            "mt-0.5 block truncate text-sm text-ink hover:text-accent",
            mono ? "font-mono text-[12px]" : "",
          )}
        >
          {value}
        </a>
      ) : (
        <div
          className={cn(
            "mt-0.5 truncate text-sm text-ink",
            mono ? "font-mono text-[12px]" : "",
          )}
        >
          {value}
        </div>
      )}
    </div>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

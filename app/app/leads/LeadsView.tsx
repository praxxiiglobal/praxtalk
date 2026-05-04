"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { useSelectedBrand } from "../useSelectedBrand";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Status = "new" | "contacted" | "qualified" | "won" | "lost";

const STATUS_FILTERS: { value: Status | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const STATUS_OPTIONS: Status[] = [
  "new",
  "contacted",
  "qualified",
  "won",
  "lost",
];

export function LeadsView() {
  const { sessionToken, workspace } = useDashboardAuth();
  const selectedBrand = useSelectedBrand();
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [filter, setFilter] = useState("");

  const leads = useQuery(api.leads.list, {
    sessionToken,
    status: statusFilter === "all" ? undefined : statusFilter,
    brandId: selectedBrand ?? undefined,
  });

  const filtered = useMemo(() => {
    if (!leads) return null;
    const q = filter.trim().toLowerCase();
    if (!q) return leads;
    return leads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.email?.toLowerCase().includes(q) ?? false) ||
        (l.phone?.toLowerCase().includes(q) ?? false) ||
        (l.brand?.name.toLowerCase().includes(q) ?? false),
    );
  }, [leads, filter]);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, email, phone, brand…"
            className="h-9 w-72 rounded-full border border-rule-2 bg-paper px-3.5 text-sm outline-none focus:border-ink"
          />
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setStatusFilter(s.value)}
                className={cn(
                  "inline-flex h-7 items-center rounded-full px-3 font-mono text-[10.5px] uppercase tracking-[0.06em] transition",
                  statusFilter === s.value
                    ? "bg-ink text-paper"
                    : "border border-rule-2 text-muted hover:text-ink hover:border-rule",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {filtered && (
            <span className="ml-auto font-mono text-[11px] text-muted">
              {filtered.length} {filtered.length === 1 ? "lead" : "leads"}
            </span>
          )}
        </div>
      </Card>

      {filtered === null ? (
        <Card>
          <div className="py-8 text-center text-sm text-muted">Loading…</div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="rounded-xl border border-dashed border-rule p-8 text-center text-sm text-muted">
            No leads match. Promote a conversation from the{" "}
            <a href="/app" className="text-ink underline-offset-2 hover:underline">
              inbox
            </a>{" "}
            with the <em>Save as Lead</em> button.
          </div>
        </Card>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-rule-2 bg-paper">
          <table className="w-full text-sm">
            <thead className="bg-paper-2/60 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="px-3 py-2.5">Customer name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Phone</th>
                <th className="px-3 py-2.5">Workspace</th>
                <th className="px-3 py-2.5">Brand</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Where</th>
                <th className="px-3 py-2.5">IP</th>
                <th className="px-3 py-2.5">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {filtered.map((l) => (
                <LeadRow
                  key={l._id}
                  workspaceName={workspace.name}
                  workspaceSlug={workspace.slug}
                  lead={l}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function LeadRow({
  lead,
  workspaceName,
  workspaceSlug,
}: {
  lead: {
    _id: Id<"leads">;
    name: string;
    email?: string;
    phone?: string;
    notes?: string;
    status: Status;
    location?: { city?: string; country?: string };
    ip?: string;
    brand: { _id: Id<"brands">; name: string; primaryColor: string } | null;
  };
  workspaceName: string;
  workspaceSlug: string;
}) {
  const { sessionToken } = useDashboardAuth();
  const updateStatus = useMutation(api.leads.updateStatus);
  const [pending, setPending] = useState<Status | null>(null);
  const display = pending ?? lead.status;

  const onChange = async (next: Status) => {
    if (next === lead.status) return;
    setPending(next);
    try {
      await updateStatus({ sessionToken, leadId: lead._id, status: next });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't update status.");
    } finally {
      setPending(null);
    }
  };

  const where =
    [lead.location?.city, lead.location?.country].filter(Boolean).join(", ") ||
    "—";

  return (
    <tr className="hover:bg-paper-2/30">
      <td className="px-3 py-2.5 font-medium text-ink">{lead.name}</td>
      <td className="px-3 py-2.5 font-mono text-[11px]">
        {lead.email ? (
          <a
            href={`mailto:${lead.email}`}
            className="text-ink hover:underline"
          >
            {lead.email}
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 font-mono text-[11px]">
        {lead.phone ? (
          <a href={`tel:${lead.phone}`} className="text-ink hover:underline">
            {lead.phone}
          </a>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="px-3 py-2.5">
        <div className="font-medium text-ink">{workspaceName}</div>
        <div className="font-mono text-[10.5px] text-muted">
          {workspaceSlug}
        </div>
      </td>
      <td className="px-3 py-2.5 text-[13px] text-ink">
        {lead.brand?.name ?? "—"}
      </td>
      <td className="px-3 py-2.5">
        <StatusSelect
          value={display}
          disabled={pending !== null}
          onChange={onChange}
        />
      </td>
      <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted">
        {where}
      </td>
      <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted">
        {lead.ip ?? "—"}
      </td>
      <td className="px-3 py-2.5 max-w-[260px]">
        {lead.notes ? (
          <span
            className="block truncate text-[12px] text-ink"
            title={lead.notes}
          >
            {lead.notes}
          </span>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
    </tr>
  );
}

function StatusSelect({
  value,
  disabled,
  onChange,
}: {
  value: Status;
  disabled: boolean;
  onChange: (s: Status) => void;
}) {
  const tint =
    value === "won"
      ? "bg-good text-paper"
      : value === "qualified"
        ? "bg-good/15 text-good"
        : value === "contacted"
          ? "bg-yellow-100 text-yellow-800"
          : value === "lost"
            ? "bg-paper-2 text-muted"
            : "bg-orange-100 text-orange-800";
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Status)}
      className={cn(
        "h-7 rounded-full px-2.5 font-mono text-[10px] uppercase tracking-[0.06em] outline-none focus:ring-1 focus:ring-ink",
        tint,
      )}
    >
      {STATUS_OPTIONS.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}

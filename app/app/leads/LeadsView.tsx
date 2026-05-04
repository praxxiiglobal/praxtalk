"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
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

type Operator = {
  _id: Id<"operators">;
  name: string;
  email: string;
  role: "owner" | "admin" | "agent";
};

export function LeadsView() {
  const { sessionToken, workspace, operator: me } = useDashboardAuth();
  const selectedBrand = useSelectedBrand();
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [filter, setFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState<
    "all" | "mine" | "unassigned" | string
  >("all");

  const leads = useQuery(api.leads.list, {
    sessionToken,
    status: statusFilter === "all" ? undefined : statusFilter,
    brandId: selectedBrand ?? undefined,
  });
  const operators = useQuery(api.operators.list, { sessionToken });

  const filtered = useMemo(() => {
    if (!leads) return null;
    let list = leads;
    if (assigneeFilter === "mine") {
      list = list.filter((l) => l.assignedTo?._id === me._id);
    } else if (assigneeFilter === "unassigned") {
      list = list.filter((l) => !l.assignedTo);
    } else if (assigneeFilter !== "all") {
      list = list.filter((l) => l.assignedTo?._id === assigneeFilter);
    }
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.email?.toLowerCase().includes(q) ?? false) ||
        (l.phone?.toLowerCase().includes(q) ?? false) ||
        (l.brand?.name.toLowerCase().includes(q) ?? false) ||
        (l.assignedTo?.name.toLowerCase().includes(q) ?? false),
    );
  }, [leads, filter, assigneeFilter, me._id]);

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name, email, phone, brand, assignee…"
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
          <select
            value={assigneeFilter}
            onChange={(e) => setAssigneeFilter(e.target.value)}
            className="h-9 rounded-full border border-rule-2 bg-paper px-3 font-mono text-[11px] uppercase tracking-[0.06em] outline-none focus:border-ink"
          >
            <option value="all">Any assignee</option>
            <option value="mine">Assigned to me</option>
            <option value="unassigned">Unassigned</option>
            {operators?.map((op) => (
              <option key={op._id} value={op._id}>
                {op.name}
              </option>
            ))}
          </select>
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
                <th className="px-3 py-2.5">Assignee</th>
                <th className="px-3 py-2.5">Where</th>
                <th className="px-3 py-2.5">IP</th>
                <th className="px-3 py-2.5 min-w-[260px]">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {filtered.map((l) => (
                <LeadRow
                  key={l._id}
                  workspaceName={workspace.name}
                  workspaceSlug={workspace.slug}
                  operators={operators ?? []}
                  meRole={me.role}
                  meId={me._id as Id<"operators">}
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
  operators,
  meRole,
  meId,
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
    assignedTo: { _id: Id<"operators">; name: string; email: string } | null;
  };
  workspaceName: string;
  workspaceSlug: string;
  operators: Operator[];
  meRole: "owner" | "admin" | "agent";
  meId: Id<"operators">;
}) {
  const { sessionToken } = useDashboardAuth();
  const updateStatus = useMutation(api.leads.updateStatus);
  const assign = useMutation(api.leads.assign);
  const updateLead = useMutation(api.leads.update);

  const [pendingStatus, setPendingStatus] = useState<Status | null>(null);
  const [pendingAssignee, setPendingAssignee] = useState<
    Id<"operators"> | "none" | null
  >(null);

  const onStatusChange = async (next: Status) => {
    if (next === lead.status) return;
    setPendingStatus(next);
    try {
      await updateStatus({ sessionToken, leadId: lead._id, status: next });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't update status.");
    } finally {
      setPendingStatus(null);
    }
  };

  const onAssign = async (next: Id<"operators"> | "none") => {
    setPendingAssignee(next);
    try {
      await assign({
        sessionToken,
        leadId: lead._id,
        operatorId: next === "none" ? null : next,
      });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't assign lead.");
    } finally {
      setPendingAssignee(null);
    }
  };

  const onSaveNotes = async (notes: string) => {
    if (notes === (lead.notes ?? "")) return;
    try {
      await updateLead({ sessionToken, leadId: lead._id, notes });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't save remarks.");
    }
  };

  const where =
    [lead.location?.city, lead.location?.country].filter(Boolean).join(", ") ||
    "—";

  return (
    <tr className="align-top hover:bg-paper-2/30">
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
          value={pendingStatus ?? lead.status}
          disabled={pendingStatus !== null}
          onChange={onStatusChange}
        />
      </td>
      <td className="px-3 py-2.5">
        <AssigneeSelect
          assigned={lead.assignedTo}
          operators={operators}
          meRole={meRole}
          meId={meId}
          pending={pendingAssignee}
          onChange={onAssign}
        />
      </td>
      <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted">
        {where}
      </td>
      <td className="px-3 py-2.5 font-mono text-[10.5px] text-muted">
        {lead.ip ?? "—"}
      </td>
      <td className="px-3 py-2.5 min-w-[260px]">
        <RemarksCell value={lead.notes ?? ""} onSave={onSaveNotes} />
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

function AssigneeSelect({
  assigned,
  operators,
  meRole,
  meId,
  pending,
  onChange,
}: {
  assigned: { _id: Id<"operators">; name: string; email: string } | null;
  operators: Operator[];
  meRole: "owner" | "admin" | "agent";
  meId: Id<"operators">;
  pending: Id<"operators"> | "none" | null;
  onChange: (next: Id<"operators"> | "none") => void;
}) {
  // Agents can only self-claim or unclaim themselves — we narrow the
  // dropdown options accordingly so they don't see options the server
  // would reject.
  const options =
    meRole === "agent"
      ? operators.filter((o) => o._id === meId)
      : operators;

  const value =
    pending !== null
      ? pending === "none"
        ? "none"
        : (pending as string)
      : (assigned?._id ?? "none");

  return (
    <select
      value={value}
      disabled={pending !== null}
      onChange={(e) =>
        onChange(
          e.target.value === "none"
            ? "none"
            : (e.target.value as Id<"operators">),
        )
      }
      className={cn(
        "h-7 max-w-[160px] rounded-full px-2.5 font-mono text-[10.5px] outline-none focus:ring-1 focus:ring-ink",
        assigned
          ? "bg-paper-2 text-ink"
          : "border border-dashed border-rule-2 text-muted",
      )}
      title={assigned ? `${assigned.name} <${assigned.email}>` : "Unassigned"}
    >
      <option value="none">Unassigned</option>
      {options.map((op) => (
        <option key={op._id} value={op._id}>
          {op.name}
          {op._id === meId ? " (me)" : ""}
        </option>
      ))}
    </select>
  );
}

/**
 * Click-to-edit remarks. Renders truncated text by default; clicking
 * reveals a textarea. Save button commits + closes; Esc / blur on
 * empty change closes without committing.
 */
function RemarksCell({
  value,
  onSave,
}: {
  value: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing) taRef.current?.focus();
  }, [editing]);

  const commit = async () => {
    setBusy(true);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="block w-full text-left"
        title={value || "Click to add remarks"}
      >
        {value ? (
          <span className="line-clamp-2 text-[12px] text-ink hover:underline underline-offset-2">
            {value}
          </span>
        ) : (
          <span className="text-[11px] italic text-muted hover:text-ink">
            + add remarks
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={taRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            void commit();
          }
        }}
        className="w-full resize-none rounded-lg border border-rule-2 bg-paper px-2.5 py-1.5 text-[12px] outline-none focus:border-ink"
        placeholder="Notes for the team — context, next steps, links…"
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-muted">
          ⌘↵ to save · Esc to cancel
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
            disabled={busy}
            className="rounded-full border border-rule-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={commit}
            disabled={busy}
            className="rounded-full bg-ink px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-paper disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

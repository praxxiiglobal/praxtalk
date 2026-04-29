"use client";

import { useMutation, useQuery } from "convex/react";
import { useMemo, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Role = "owner" | "admin" | "agent";

type Operator = {
  _id: Id<"operators">;
  email: string;
  name: string;
  role: Role;
  brandAccess: "all" | Id<"brands">[];
};

type Brand = {
  _id: Id<"brands">;
  name: string;
  primaryColor: string;
};

export function TeamView() {
  const { sessionToken, operator: me } = useDashboardAuth();
  const operators = useQuery(api.operators.list, { sessionToken });
  const brands = useQuery(api.brands.listMine, { sessionToken });

  const canManage = me.role !== "agent";

  return (
    <>
      <Card
        title="Operators"
        description="Everyone with access to this workspace. Owners and admins can grant access to specific brands."
      >
        {operators === undefined ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : (
          <ul className="divide-y divide-rule">
            {operators.map((op) => (
              <OperatorRow
                key={op._id}
                op={op as Operator}
                brands={(brands ?? []) as Brand[]}
                isMe={op._id === me._id}
                canManage={canManage}
              />
            ))}
          </ul>
        )}
      </Card>

      {canManage && <PendingInvitesCard />}
      {canManage && <InviteOperatorCard />}
      {canManage && <AddOperatorCard />}
    </>
  );
}

function PendingInvitesCard() {
  const { sessionToken } = useDashboardAuth();
  const invites = useQuery(api.invites.list, { sessionToken });
  const revoke = useMutation(api.invites.revoke);

  if (!invites || invites.length === 0) return null;

  const onRevoke = async (id: Id<"operatorInvites">) => {
    if (!confirm("Revoke this invite? The link will stop working.")) return;
    await revoke({ sessionToken, inviteId: id });
  };

  return (
    <Card
      title="Pending invites"
      description="Sent but not accepted yet. Revoke to invalidate the link."
    >
      <ul className="divide-y divide-rule">
        {invites.map((i) => (
          <li
            key={i._id}
            className="flex flex-wrap items-center gap-3 py-3"
          >
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-2 font-mono text-[11px] font-semibold text-muted">
              ✉
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm">
                <span className="truncate font-medium text-ink">
                  {i.name ?? i.email}
                </span>
                <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                  {i.role}
                </span>
              </div>
              <div className="truncate font-mono text-[11px] text-muted">
                {i.email}
              </div>
              <div className="mt-0.5 font-mono text-[10px] text-muted">
                expires{" "}
                {Math.max(
                  0,
                  Math.ceil(
                    (i.expiresAt - Date.now()) / (24 * 60 * 60 * 1000),
                  ),
                )}
                d
              </div>
            </div>
            <button
              type="button"
              onClick={() => onRevoke(i._id)}
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium text-warn transition hover:-translate-y-px"
            >
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function InviteOperatorCard() {
  const { sessionToken } = useDashboardAuth();
  const sendInvite = useMutation(api.invites.send);
  const brands = useQuery(api.brands.listMine, { sessionToken });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [scope, setScope] = useState<"all" | "scoped">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ email: string; link: string } | null>(
    null,
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const access =
        scope === "all"
          ? ("all" as const)
          : (Array.from(selected) as unknown as Id<"brands">[]);
      const result = await sendInvite({
        sessionToken,
        email: email.trim(),
        name: name.trim() || undefined,
        role,
        brandAccess: access,
      });
      setSent({ email: email.trim(), link: result.inviteLink });
      setName("");
      setEmail("");
      setRole("agent");
      setScope("all");
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send invite.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Invite by email"
      description="Send a one-time link. Recipient sets their own password — no temp credentials passed around."
    >
      {sent ? (
        <div className="rounded-xl border border-good bg-good/10 p-4 text-sm">
          <div className="font-medium text-ink">
            Invite sent to {sent.email} ✓
          </div>
          <div className="mt-2 text-[12px] text-muted">
            If the email never arrives, share this link directly:
          </div>
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-rule bg-paper p-3">
            <code className="flex-1 break-all font-mono text-[12px] text-ink">
              {sent.link}
            </code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(sent.link)}
              className="inline-flex h-8 shrink-0 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium"
            >
              Copy
            </button>
          </div>
          <button
            type="button"
            onClick={() => setSent(null)}
            className="mt-3 text-[12px] font-medium text-muted underline-offset-2 hover:underline"
          >
            Send another →
          </button>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px"
        >
          + Invite teammate
        </button>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Name (optional)
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Maya Acker"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="maya@acme.com"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "agent")}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <div className="sm:col-span-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Brand access
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                  scope === "all"
                    ? "bg-ink text-paper"
                    : "border border-rule-2 text-muted hover:text-ink",
                )}
              >
                All brands
              </button>
              <button
                type="button"
                onClick={() => setScope("scoped")}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                  scope === "scoped"
                    ? "bg-ink text-paper"
                    : "border border-rule-2 text-muted hover:text-ink",
                )}
              >
                Specific brands
              </button>
            </div>
            {scope === "scoped" && brands ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {brands.map((b) => {
                  const checked = selected.has(String(b._id));
                  return (
                    <li key={b._id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition",
                          checked
                            ? "border-ink bg-paper"
                            : "border-rule-2 hover:border-ink",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-ink"
                          checked={checked}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(String(b._id));
                              else next.delete(String(b._id));
                              return next;
                            });
                          }}
                        />
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: b.primaryColor }}
                        />
                        <span className="truncate text-sm text-ink">{b.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {error ? (
            <p className="sm:col-span-2 text-[12px] text-warn">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

function OperatorRow({
  op,
  brands,
  isMe,
  canManage,
}: {
  op: Operator;
  brands: Brand[];
  isMe: boolean;
  canManage: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const initials = (op.name || op.email)
    .split(/\s+|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");

  const accessLabel = useMemo(() => {
    if (op.role === "owner") return "All brands (owner)";
    if (op.brandAccess === "all") return "All brands";
    if (op.brandAccess.length === 0) return "No brands assigned";
    const names = op.brandAccess
      .map((id) => brands.find((b) => b._id === id)?.name)
      .filter(Boolean) as string[];
    if (names.length === 0) return `${op.brandAccess.length} brand(s)`;
    if (names.length <= 2) return names.join(", ");
    return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
  }, [op, brands]);

  const showEdit = canManage && !isMe && op.role !== "owner";

  return (
    <li className="py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-paper-2 font-mono text-[11px] font-semibold text-ink">
          {initials || "?"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm">
            <span className="truncate font-medium text-ink">{op.name}</span>
            {isMe ? (
              <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                you
              </span>
            ) : null}
          </div>
          <div className="truncate text-[12px] text-muted">{op.email}</div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
            <span className="opacity-60">access</span>{" "}
            <span className="text-ink">{accessLabel}</span>
          </div>
        </div>
        <span className="shrink-0 rounded-full border border-rule-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
          {op.role}
        </span>
        {showEdit ? (
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex h-8 shrink-0 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium transition hover:-translate-y-px"
          >
            {editing ? "Close" : "Manage"}
          </button>
        ) : null}
      </div>

      {editing && showEdit ? (
        <ManageOperator op={op} brands={brands} onClose={() => setEditing(false)} />
      ) : null}
    </li>
  );
}

function ManageOperator({
  op,
  brands,
  onClose,
}: {
  op: Operator;
  brands: Brand[];
  onClose: () => void;
}) {
  const { sessionToken } = useDashboardAuth();
  const setBrandAccess = useMutation(api.operators.setBrandAccess);
  const setRole = useMutation(api.operators.setRole);
  const removeOperator = useMutation(api.operators.remove);

  const [scope, setScope] = useState<"all" | "scoped">(
    op.brandAccess === "all" ? "all" : "scoped",
  );
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        op.brandAccess === "all" ? [] : op.brandAccess.map(String),
      ),
  );
  const [role, setRoleLocal] = useState<Role>(op.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (role !== op.role) {
        await setRole({ sessionToken, operatorId: op._id, role });
      }
      const access =
        scope === "all"
          ? ("all" as const)
          : (Array.from(selected) as unknown as Id<"brands">[]);
      await setBrandAccess({
        sessionToken,
        operatorId: op._id,
        brandAccess: access,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (!confirm(`Remove ${op.name} from the workspace?`)) return;
    setBusy(true);
    setError(null);
    try {
      await removeOperator({ sessionToken, operatorId: op._id });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSave}
      className="mt-3 flex flex-col gap-4 rounded-xl border border-rule bg-paper-2/40 p-4"
    >
      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          Role
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(["admin", "agent"] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRoleLocal(r)}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                role === r
                  ? "bg-ink text-paper"
                  : "border border-rule-2 text-muted hover:text-ink",
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          Brand access
        </div>
        <div className="mt-2 flex gap-1.5">
          <button
            type="button"
            onClick={() => setScope("all")}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
              scope === "all"
                ? "bg-ink text-paper"
                : "border border-rule-2 text-muted hover:text-ink",
            )}
          >
            All brands
          </button>
          <button
            type="button"
            onClick={() => setScope("scoped")}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
              scope === "scoped"
                ? "bg-ink text-paper"
                : "border border-rule-2 text-muted hover:text-ink",
            )}
          >
            Specific brands
          </button>
        </div>

        {scope === "scoped" ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {brands.length === 0 ? (
              <li className="rounded-lg border border-dashed border-rule p-3 text-[12px] text-muted">
                No brands yet. Add one in <a href="/app/brands" className="underline-offset-2 hover:underline">/app/brands</a>.
              </li>
            ) : (
              brands.map((b) => {
                const checked = selected.has(String(b._id));
                return (
                  <li key={b._id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition",
                        checked
                          ? "border-ink bg-paper"
                          : "border-rule-2 hover:border-ink",
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-ink"
                        checked={checked}
                        onChange={(e) => {
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(String(b._id));
                            else next.delete(String(b._id));
                            return next;
                          });
                        }}
                      />
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: b.primaryColor }}
                      />
                      <span className="truncate text-sm text-ink">{b.name}</span>
                    </label>
                  </li>
                );
              })
            )}
          </ul>
        ) : null}
      </div>

      {error ? <p className="text-[12px] text-warn">{error}</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="text-[12px] font-medium text-warn underline-offset-2 hover:underline disabled:opacity-60"
        >
          Remove from workspace
        </button>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-9 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}

function AddOperatorCard() {
  const { sessionToken } = useDashboardAuth();
  const createOperator = useMutation(api.operators.create);
  const brands = useQuery(api.brands.listMine, { sessionToken });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "agent">("agent");
  const [scope, setScope] = useState<"all" | "scoped">("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(
    null,
  );

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const access =
        scope === "all"
          ? ("all" as const)
          : (Array.from(selected) as unknown as Id<"brands">[]);
      await createOperator({
        sessionToken,
        name: name.trim(),
        email: email.trim(),
        role,
        temporaryPassword: password,
        brandAccess: access,
      });
      setCreated({ email: email.trim(), password });
      setName("");
      setEmail("");
      setPassword("");
      setRole("agent");
      setScope("all");
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add operator.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Add an operator"
      description="Create a teammate's account directly. Email-based invites land with v1.0 — for now, share the temporary password with them out-of-band."
    >
      {created ? (
        <div className="rounded-xl border border-good bg-good/10 p-4 text-sm">
          <div className="font-medium text-ink">Operator created ✓</div>
          <div className="mt-2 font-mono text-[12px] text-ink">
            <div>email: {created.email}</div>
            <div>password: {created.password}</div>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="inline-flex h-8 items-center rounded-full border border-rule-2 bg-paper px-3 text-[12px] font-medium"
            >
              Add another
            </button>
          </div>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
        >
          + Add operator
        </button>
      ) : (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Name
            </span>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Email
            </span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Temporary password
            </span>
            <input
              type="text"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Role
            </span>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "agent")}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            >
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <div className="sm:col-span-2">
            <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Brand access
            </div>
            <div className="mt-2 flex gap-1.5">
              <button
                type="button"
                onClick={() => setScope("all")}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                  scope === "all"
                    ? "bg-ink text-paper"
                    : "border border-rule-2 text-muted hover:text-ink",
                )}
              >
                All brands
              </button>
              <button
                type="button"
                onClick={() => setScope("scoped")}
                className={cn(
                  "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                  scope === "scoped"
                    ? "bg-ink text-paper"
                    : "border border-rule-2 text-muted hover:text-ink",
                )}
              >
                Specific brands
              </button>
            </div>
            {scope === "scoped" && brands ? (
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {brands.map((b) => {
                  const checked = selected.has(String(b._id));
                  return (
                    <li key={b._id}>
                      <label
                        className={cn(
                          "flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 transition",
                          checked
                            ? "border-ink bg-paper"
                            : "border-rule-2 hover:border-ink",
                        )}
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-ink"
                          checked={checked}
                          onChange={(e) => {
                            setSelected((prev) => {
                              const next = new Set(prev);
                              if (e.target.checked) next.add(String(b._id));
                              else next.delete(String(b._id));
                              return next;
                            });
                          }}
                        />
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: b.primaryColor }}
                        />
                        <span className="truncate text-sm text-ink">{b.name}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {error ? (
            <p className="sm:col-span-2 text-[12px] text-warn">{error}</p>
          ) : null}

          <div className="flex justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
            >
              {busy ? "Adding…" : "Add operator"}
            </button>
          </div>
        </form>
      )}
    </Card>
  );
}

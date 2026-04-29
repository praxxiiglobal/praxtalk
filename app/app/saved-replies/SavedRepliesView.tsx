"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Reply = {
  _id: Id<"savedReplies">;
  brandId: Id<"brands"> | null;
  title: string;
  body: string;
  shortcut: string | null;
};

export function SavedRepliesView() {
  const { sessionToken } = useDashboardAuth();
  const replies = useQuery(api.savedReplies.list, { sessionToken });
  const brands = useQuery(api.brands.listMine, { sessionToken });

  return (
    <>
      <NewReplyCard />
      <Card title="Library">
        {replies === undefined ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : replies.length === 0 ? (
          <div className="rounded-xl border border-dashed border-rule p-8 text-center text-sm text-muted">
            No saved replies yet. Add your first one above.
          </div>
        ) : (
          <ul className="divide-y divide-rule">
            {replies.map((r) => (
              <ReplyRow
                key={r._id}
                reply={r as Reply}
                brands={brands ?? []}
              />
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function ReplyRow({
  reply,
  brands,
}: {
  reply: Reply;
  brands: { _id: Id<"brands">; name: string; primaryColor: string }[];
}) {
  const { sessionToken } = useDashboardAuth();
  const update = useMutation(api.savedReplies.update);
  const remove = useMutation(api.savedReplies.remove);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(reply.title);
  const [body, setBody] = useState(reply.body);
  const [shortcut, setShortcut] = useState(reply.shortcut ?? "");
  const [brandId, setBrandId] = useState<string>(
    reply.brandId ? String(reply.brandId) : "all",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const brand = reply.brandId
    ? brands.find((b) => String(b._id) === String(reply.brandId))
    : null;

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await update({
        sessionToken,
        replyId: reply._id,
        title,
        body,
        shortcut: shortcut || undefined,
        brandId:
          brandId === "all" ? null : (brandId as unknown as Id<"brands">),
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async () => {
    if (!confirm("Delete this saved reply?")) return;
    await remove({ sessionToken, replyId: reply._id });
  };

  if (editing) {
    return (
      <li className="py-3">
        <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </Field>
          <Field label="Shortcut (optional)">
            <input
              type="text"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="/refund"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Body" full>
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="resize-y rounded-lg border border-rule-2 bg-paper p-3 text-sm leading-[1.5] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Brand" full>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            >
              <option value="all">All brands (workspace global)</option>
              {brands.map((b) => (
                <option key={b._id} value={b._id}>
                  Scoped to {b.name}
                </option>
              ))}
            </select>
          </Field>

          {error ? (
            <p className="text-[12px] text-warn sm:col-span-2">{error}</p>
          ) : null}

          <div className="flex items-center justify-between gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={onRemove}
              disabled={busy}
              className="text-[12px] font-medium text-warn underline-offset-2 hover:underline"
            >
              Delete
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditing(false)}
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
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li
      className="-mx-2 cursor-pointer rounded-lg px-2 py-3 transition hover:bg-paper-2"
      onClick={() => setEditing(true)}
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-ink">
              {reply.title}
            </span>
            {reply.shortcut ? (
              <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                {reply.shortcut}
              </span>
            ) : null}
            {brand ? (
              <span
                className="inline-flex max-w-[120px] items-center truncate rounded-full px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-paper"
                style={{ backgroundColor: brand.primaryColor }}
              >
                {brand.name}
              </span>
            ) : (
              <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                all brands
              </span>
            )}
          </div>
          <div className="mt-1 line-clamp-2 text-[13px] leading-[1.5] text-muted">
            {reply.body}
          </div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
          edit
        </span>
      </div>
    </li>
  );
}

function NewReplyCard() {
  const { sessionToken } = useDashboardAuth();
  const create = useMutation(api.savedReplies.create);
  const brands = useQuery(api.brands.listMine, { sessionToken });

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [brandId, setBrandId] = useState<string>("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await create({
        sessionToken,
        title: title.trim(),
        body: body.trim(),
        shortcut: shortcut.trim() || undefined,
        brandId:
          brandId === "all"
            ? undefined
            : (brandId as unknown as Id<"brands">),
      });
      setTitle("");
      setBody("");
      setShortcut("");
      setBrandId("all");
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Add a reply"
      description="Give it a short title and the text to insert. Optionally tag it with a brand or a shortcut."
    >
      {open ? (
        <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Title">
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Refund kicked off"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </Field>
          <Field label="Shortcut (optional)">
            <input
              type="text"
              value={shortcut}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="/refund"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Body" full>
            <textarea
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="Refund is on its way — should land in 3-5 business days. Anything else?"
              className="resize-y rounded-lg border border-rule-2 bg-paper p-3 text-sm leading-[1.5] outline-none focus:border-ink"
            />
          </Field>
          <Field label="Brand" full>
            <select
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            >
              <option value="all">All brands (workspace global)</option>
              {(brands ?? []).map((b) => (
                <option key={b._id} value={b._id}>
                  Scoped to {b.name}
                </option>
              ))}
            </select>
          </Field>

          {error ? (
            <p className="text-[12px] text-warn sm:col-span-2">{error}</p>
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
              {busy ? "Saving…" : "Save reply"}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
        >
          + New saved reply
        </button>
      )}
    </Card>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex flex-col gap-1", full ? "sm:col-span-2" : "")}>
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {label}
      </span>
      {children}
    </label>
  );
}

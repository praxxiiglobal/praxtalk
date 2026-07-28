"use client";

import { useMutation } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../_components/DashboardShell";

/**
 * Self-service profile management — every operator can edit their
 * own name, email, and password. Email + password changes require
 * the current password as a confirmation step (a stolen session
 * cookie shouldn't be enough to lock the real owner out).
 *
 * Hard-refresh after an email change so the navbar + cookies pick
 * up the new value (sessions stay valid; only the displayed email
 * is cached client-side).
 */
export function AccountSection() {
  const { operator } = useDashboardAuth();
  return (
    <div className="flex flex-col gap-6">
      <NameForm currentName={operator.name} />
      <EmailForm currentEmail={operator.email} />
      <PasswordForm />
    </div>
  );
}

function NameForm({ currentName }: { currentName: string }) {
  const { sessionToken } = useDashboardAuth();
  const updateName = useMutation(api.operators.updateMyName);
  const [name, setName] = useState(currentName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const dirty = name.trim() !== currentName && name.trim().length > 0;

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateName({ sessionToken, newName: name.trim() });
      setMsg({ kind: "ok", text: "Name updated. Refresh to see it everywhere." });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Couldn't update name.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <label className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
        Display name
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          className="h-10 flex-1 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        />
        <button
          type="submit"
          disabled={!dirty || busy}
          className="inline-flex h-10 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save name"}
        </button>
      </div>
      <Message msg={msg} />
    </form>
  );
}

function EmailForm({ currentEmail }: { currentEmail: string }) {
  const { sessionToken } = useDashboardAuth();
  const updateEmail = useMutation(api.operators.updateMyEmail);
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setMsg(null);
    try {
      await updateEmail({
        sessionToken,
        newEmail: newEmail.trim(),
        currentPassword,
      });
      setMsg({
        kind: "ok",
        text: `Email changed to ${newEmail.trim()}. Refresh the page to see it everywhere.`,
      });
      setNewEmail("");
      setCurrentPassword("");
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Couldn't update email.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-rule-2 pt-5">
      <label className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
        Email address
      </label>
      <div className="font-mono text-[12.5px] text-ink">
        Current: {currentEmail}
      </div>
      <p className="text-[12px] leading-[1.5] text-muted">
        Used to sign in. Must be unique across all PraxTalk accounts.
      </p>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          placeholder="new@example.com"
          autoComplete="email"
          required
          className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        />
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          required
          className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !newEmail.trim() || !currentPassword}
        className="inline-flex h-10 w-fit items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition disabled:opacity-50"
      >
        {busy ? "Updating…" : "Change email"}
      </button>
      <Message msg={msg} />
    </form>
  );
}

function PasswordForm() {
  const { sessionToken } = useDashboardAuth();
  const updatePassword = useMutation(api.operators.updateMyPassword);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (newPassword !== confirm) {
      setMsg({ kind: "err", text: "New password + confirmation don't match." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await updatePassword({ sessionToken, currentPassword, newPassword });
      setMsg({ kind: "ok", text: "Password changed." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Couldn't update password.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-2 border-t border-rule-2 pt-5"
    >
      <label className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
        Password
      </label>
      <p className="text-[12px] leading-[1.5] text-muted">
        Minimum 8 characters. Existing sessions stay signed in after a change.
      </p>
      <div className="grid gap-2 sm:grid-cols-3">
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="Current password"
          autoComplete="current-password"
          required
          className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        />
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          placeholder="New password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-10 rounded-xl border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        />
      </div>
      <button
        type="submit"
        disabled={busy || !currentPassword || !newPassword || !confirm}
        className="inline-flex h-10 w-fit items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition disabled:opacity-50"
      >
        {busy ? "Updating…" : "Change password"}
      </button>
      <Message msg={msg} />
    </form>
  );
}

function Message({
  msg,
}: {
  msg: { kind: "ok" | "err"; text: string } | null;
}) {
  if (!msg) return null;
  return (
    <p
      className={
        "mt-1 text-[12px] " + (msg.kind === "ok" ? "text-good" : "text-warn")
      }
    >
      {msg.text}
    </p>
  );
}

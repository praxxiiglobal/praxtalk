"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  resetPasswordAction,
  type ResetPasswordState,
} from "./actions";

const initial: ResetPasswordState = { status: "idle" };

export function ResetPasswordForm({
  token,
  email,
}: {
  token: string;
  email: string;
}) {
  const [state, formAction] = useActionState(resetPasswordAction, initial);
  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />

      <Field
        label="Email"
        name="email"
        type="email"
        defaultValue={email}
        readOnly
      />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        autoFocus
        placeholder="At least 8 characters"
      />
      <Field
        label="Confirm password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        placeholder="Repeat your new password"
      />

      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-xl border border-red-300/40 bg-red-50/40 px-4 py-3 text-sm text-red-900"
        >
          {state.message}
        </div>
      )}

      <Submit />
    </form>
  );
}

function Field({
  label,
  ...input
}: {
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow text-muted">{label}</span>
      <input
        {...input}
        className="h-11 rounded-xl border border-rule-2 bg-paper px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-ink focus:shadow-[0_0_0_4px_var(--color-accent-soft)] read-only:bg-paper-2/60 read-only:text-muted"
      />
    </label>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex h-11 items-center justify-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
    >
      {pending ? "Saving…" : "Set new password"}
    </button>
  );
}

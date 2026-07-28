"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  requestPasswordResetAction,
  type ForgotPasswordState,
} from "./actions";

const initial: ForgotPasswordState = { status: "idle" };

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    initial,
  );

  if (state.status === "sent") {
    return (
      <div className="rounded-xl border border-rule-2 bg-paper-2 px-4 py-4 text-sm text-ink">
        <p className="font-medium">Check your inbox.</p>
        <p className="mt-1 text-muted">
          If <strong className="text-ink">{state.email}</strong> matches an
          account, we&apos;ve sent a password-reset link. The link expires in
          1 hour.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@company.com"
        required
        autoFocus
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
        className="h-11 rounded-xl border border-rule-2 bg-paper px-4 text-[15px] text-ink outline-none transition placeholder:text-muted/70 focus:border-ink focus:shadow-[0_0_0_4px_var(--color-accent-soft)]"
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
      className="group inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px disabled:cursor-progress disabled:opacity-70"
    >
      {pending ? "Sending…" : "Send reset link"}
      <span aria-hidden className="transition group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}

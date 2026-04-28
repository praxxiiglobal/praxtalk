"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { loginAction, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm() {
  const [state, formAction] = useActionState(loginAction, initial);
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
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
        required
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
      {pending ? "Signing in…" : "Sign in"}
      <span aria-hidden className="transition group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}

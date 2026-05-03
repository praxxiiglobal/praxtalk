"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createWorkspaceAction, type SetupState } from "./actions";

const initial: SetupState = { status: "idle" };

export function SetupForm() {
  const [state, formAction] = useActionState(createWorkspaceAction, initial);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <Field
        label="Workspace name"
        name="workspaceName"
        autoComplete="organization"
        placeholder="Acme Inc"
        required
        autoFocus
      />
      <Field
        label="Your name"
        name="ownerName"
        autoComplete="name"
        placeholder="Jane Doe"
        required
      />
      <Field
        label="Email"
        name="ownerEmail"
        type="email"
        autoComplete="email"
        placeholder="jane@acme.com"
        required
      />
      <Field
        label="Password"
        name="ownerPassword"
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        required
        minLength={8}
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

      <p className="text-center text-xs text-muted">
        By creating a workspace you agree to our terms and privacy policy.
      </p>
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
      {pending ? "Creating workspace…" : "Create workspace"}
      <span aria-hidden className="transition group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}


"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { confirmSignupAction, type ConfirmState } from "./actions";

const initial: ConfirmState = { status: "idle" };

export function ConfirmForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(confirmSignupAction, initial);
  return (
    <form action={formAction} className="mt-8 flex flex-col gap-4">
      <input type="hidden" name="token" value={token} />
      <Submit />
      {state.status === "error" && (
        <div
          role="alert"
          className="rounded-xl border border-red-300/40 bg-red-50/40 px-4 py-3 text-sm text-red-900"
        >
          {state.message}
        </div>
      )}
    </form>
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
      {pending ? "Verifying…" : "Verify and create workspace"}
      <span aria-hidden className="transition group-hover:translate-x-0.5">
        →
      </span>
    </button>
  );
}

"use client";

import Script from "next/script";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { createWorkspaceAction, type SetupState } from "./actions";

const initial: SetupState = { status: "idle" };
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export function SetupForm() {
  const [state, formAction] = useActionState(createWorkspaceAction, initial);
  const turnstileRef = useRef<HTMLDivElement | null>(null);
  // FingerprintJS visitorId — Murmur3-derived hash of canvas / audio /
  // font / screen signals, stable per browser without cookies. Never
  // blocks a signup in real time; admin /admin/workspaces uses it to
  // surface clusters (one fingerprint creating many workspaces).
  const [fingerprint, setFingerprint] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const FP = await import("@fingerprintjs/fingerprintjs");
        const fp = await FP.load();
        const result = await fp.get();
        if (!cancelled) setFingerprint(result.visitorId);
      } catch {
        // FP load can fail on hostile browsers or strict CSP — leave
        // the field blank; server treats missing as "no signal".
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  // After a server-action error, the Turnstile token is single-use
  // and has already been spent — reset the widget so the next
  // submission has a fresh one.
  useEffect(() => {
    if (state.status !== "error") return;
    const w = (window as unknown as {
      turnstile?: { reset?: (el: HTMLElement) => void };
    }).turnstile;
    if (turnstileRef.current && w?.reset) w.reset(turnstileRef.current);
  }, [state.status]);
  // Stamp form-mount time so the server can refuse <1.5s submissions.
  // useMemo with [] runs once per mount (client-side), the resulting
  // ms timestamp is sent as a hidden field at submit. Bots that POST
  // synthetic FormData without rendering the page won't have it; the
  // server treats a missing/zero stamp as "skip the timing check"
  // since older clients won't have it either, but a stale 1970
  // timestamp would also appear as 50+ years elapsed (always > 1.5s).
  const formStartedAt = useMemo(() => Date.now(), []);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {/* Honeypot — hidden from real users via tabIndex + aria-hidden
          + autocomplete=off + visually hidden. Bots that fill every
          field will fill this too; server rejects on non-empty value.
          Leaves the form behaviour identical for real users. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          left: "-10000px",
          top: "auto",
          width: 1,
          height: 1,
          overflow: "hidden",
        }}
      >
        <label>
          Website (leave empty)
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            defaultValue=""
          />
        </label>
      </div>
      <input type="hidden" name="formStartedAt" value={formStartedAt} />
      <input type="hidden" name="fingerprint" value={fingerprint} />

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

      {TURNSTILE_SITE_KEY ? (
        <>
          <Script
            src="https://challenges.cloudflare.com/turnstile/v0/api.js"
            strategy="afterInteractive"
            async
            defer
          />
          <div
            ref={turnstileRef}
            className="cf-turnstile"
            data-sitekey={TURNSTILE_SITE_KEY}
            data-theme="light"
          />
        </>
      ) : null}

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


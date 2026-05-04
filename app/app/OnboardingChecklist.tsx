"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "./DashboardShell";

type StepKey = "snippet" | "test" | "atlas" | "team";

const STORAGE_PREFIX = "praxtalk.onboarding.v1";

/**
 * First-run helper banner shown above the inbox until the operator
 * has either completed every step or hit "Dismiss". Steps are tracked
 * per-workspace in localStorage — no backend round-trip just to know
 * whether someone copied a snippet, and the checklist disappears
 * permanently once dismissed so existing customers never see it.
 */
export function OnboardingChecklist() {
  const { sessionToken, workspace } = useDashboardAuth();
  const brands = useQuery(api.brands.listMine, { sessionToken });
  const dismissKey = `${STORAGE_PREFIX}.${workspace._id}.dismissed`;
  const stepsKey = `${STORAGE_PREFIX}.${workspace._id}.steps`;

  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [done, setDone] = useState<Record<StepKey, boolean>>({
    snippet: false,
    test: false,
    atlas: false,
    team: false,
  });

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(dismissKey) === "1");
      const raw = localStorage.getItem(stepsKey);
      if (raw) setDone((cur) => ({ ...cur, ...JSON.parse(raw) }));
    } catch {
      setDismissed(false);
    }
  }, [dismissKey, stepsKey]);

  const markDone = (k: StepKey) => {
    setDone((cur) => {
      const next = { ...cur, [k]: true };
      try {
        localStorage.setItem(stepsKey, JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey, "1");
    } catch {}
    setDismissed(true);
  };

  const widgetId = brands?.[0]?.widgetId ?? null;
  const snippet = useMemo(
    () =>
      widgetId
        ? `<script src="https://praxtalk.com/widget.js" data-workspace-id="${widgetId}" defer></script>`
        : null,
    [widgetId],
  );
  const previewUrl = widgetId ? `/widget-demo?ws=${widgetId}` : "/widget-demo";

  // Hidden until we know dismiss state (avoids flash) and after dismiss.
  if (dismissed !== false) return null;

  const completedCount = Object.values(done).filter(Boolean).length;
  const allDone = completedCount === 4;

  return (
    <div className="mx-3 mt-3 rounded-2xl border border-rule-2 bg-paper-2/50 p-5 sm:mx-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[10.5px] uppercase tracking-[0.08em] text-muted">
            Get started · {completedCount}/4 done
          </div>
          <h2 className="mt-1.5 text-lg font-semibold tracking-[-0.015em] text-ink">
            {allDone
              ? "You're all set — you can close this."
              : "Four quick things and you're live."}
          </h2>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="shrink-0 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted transition hover:text-ink"
        >
          {allDone ? "Close ✓" : "Dismiss"}
        </button>
      </div>

      <div className="mt-4 grid gap-2.5 md:grid-cols-2">
        <Step
          n={1}
          done={done.snippet}
          title="Copy your widget snippet"
          body={
            snippet ? (
              <CopySnippet
                snippet={snippet}
                onCopied={() => markDone("snippet")}
              />
            ) : (
              <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
                Loading brand…
              </p>
            )
          }
        />
        <Step
          n={2}
          done={done.test}
          title="Test it on a sample page"
          body={
            <Link
              href={previewUrl}
              target="_blank"
              onClick={() => markDone("test")}
              className="inline-flex h-8 items-center rounded-full border border-rule-2 bg-paper px-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink transition hover:border-ink"
            >
              Open live preview ↗
            </Link>
          }
        />
        <Step
          n={3}
          done={done.atlas}
          title="Tune Atlas (your AI agent)"
          body={
            <Link
              href="/app/atlas"
              onClick={() => markDone("atlas")}
              className="inline-flex h-8 items-center rounded-full border border-rule-2 bg-paper px-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink transition hover:border-ink"
            >
              Open Atlas settings →
            </Link>
          }
        />
        <Step
          n={4}
          done={done.team}
          title="Invite your team"
          body={
            <Link
              href="/app/team"
              onClick={() => markDone("team")}
              className="inline-flex h-8 items-center rounded-full border border-rule-2 bg-paper px-3 font-mono text-[11px] uppercase tracking-[0.06em] text-ink transition hover:border-ink"
            >
              Invite teammates →
            </Link>
          }
        />
      </div>
    </div>
  );
}

function Step({
  n,
  done,
  title,
  body,
}: {
  n: number;
  done: boolean;
  title: string;
  body: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-xl border bg-paper px-4 py-3 transition ${
        done
          ? "border-good/40 bg-good/5"
          : "border-rule-2 hover:border-rule"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums ${
            done
              ? "bg-good text-paper"
              : "bg-paper-2 text-muted ring-1 ring-rule-2"
          }`}
        >
          {done ? "✓" : n}
        </span>
        <span
          className={`text-[13.5px] font-medium ${
            done ? "text-muted line-through" : "text-ink"
          }`}
        >
          {title}
        </span>
      </div>
      <div className="mt-2.5 pl-7">{body}</div>
    </div>
  );
}

function CopySnippet({
  snippet,
  onCopied,
}: {
  snippet: string;
  onCopied: () => void;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1.5">
      <code className="block overflow-x-auto rounded-lg bg-ink px-2.5 py-1.5 font-mono text-[10.5px] leading-relaxed text-paper">
        {snippet}
      </code>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(snippet);
            setCopied(true);
            onCopied();
            setTimeout(() => setCopied(false), 2000);
          } catch {
            onCopied();
          }
        }}
        className="self-start rounded-full bg-ink px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-paper transition hover:opacity-90"
      >
        {copied ? "Copied ✓" : "Copy snippet"}
      </button>
    </div>
  );
}

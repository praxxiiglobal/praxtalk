"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Mark } from "@/components/marketing/Mark";
import { useDashboardAuth } from "./DashboardShell";
import { logoutAction } from "./actions";

export function Topbar() {
  const { operator, workspace } = useDashboardAuth();
  const [pending, start] = useTransition();

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="flex h-14 items-center gap-4 px-5">
        <Link
          href="/app"
          className="flex items-center gap-2 font-semibold tracking-tight text-ink"
        >
          <Mark className="text-ink" size={20} />
          <span>PraxTalk</span>
        </Link>

        <span className="text-rule-2">/</span>

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">
            {workspace.name}
          </span>
          <span className="rounded-full border border-rule-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
            {workspace.plan}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          <div className="hidden text-right text-xs text-muted sm:block">
            <div className="font-medium text-ink">{operator.name}</div>
            <div className="font-mono text-[11px]">{operator.role}</div>
          </div>
          <button
            type="button"
            onClick={() => start(() => logoutAction())}
            disabled={pending}
            className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-xs font-medium transition hover:-translate-y-px disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}

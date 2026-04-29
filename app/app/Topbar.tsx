"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { HamburgerIcon, MobileDrawer } from "@/components/marketing/Nav";
import { BrandSwitcher } from "./BrandSwitcher";
import { useDashboardAuth } from "./DashboardShell";
import { NotificationsBell } from "./Notifications";
import { MobileNavList } from "./SideNav";
import { logoutAction } from "./actions";

export function Topbar() {
  const { operator, workspace } = useDashboardAuth();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/90 backdrop-blur">
      <div className="flex h-16 items-center gap-3 px-4 sm:h-20 sm:gap-4 sm:px-5">
        <Link
          href="/app"
          className="relative flex items-center"
          aria-label="PraxTalk dashboard"
        >
          <Image
            src="/praxtalk-logo.png"
            alt="PraxTalk"
            width={1419}
            height={336}
            priority
            className="h-10 w-auto sm:h-12"
          />
        </Link>

        <span className="hidden text-rule-2 sm:inline">/</span>

        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">
            {workspace.name}
          </span>
          <span className="hidden rounded-full border border-rule-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted sm:inline-flex">
            {workspace.plan}
          </span>
        </div>

        <div className="hidden sm:block">
          <BrandSwitcher variant="topbar" />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <NotificationsBell />
          <div className="hidden text-right text-xs text-muted sm:block">
            <div className="font-medium text-ink">{operator.name}</div>
            <div className="font-mono text-[11px]">{operator.role}</div>
          </div>
          <button
            type="button"
            onClick={() => start(() => logoutAction())}
            disabled={pending}
            className="hidden h-8 items-center rounded-full border border-rule-2 px-3 text-xs font-medium transition hover:-translate-y-px disabled:opacity-60 sm:inline-flex"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            aria-expanded={open}
            className="inline-flex size-9 items-center justify-center rounded-full border border-rule-2 bg-paper text-ink transition hover:bg-paper-2 sm:hidden"
          >
            <HamburgerIcon />
          </button>
        </div>
      </div>

      {open && (
        <MobileDrawer onClose={() => setOpen(false)}>
          <MobileNavList onNavigate={() => setOpen(false)} />
          <div className="mt-6">
            <BrandSwitcher variant="drawer" />
          </div>
          <div className="mt-6 rounded-xl border border-rule bg-paper-2/40 p-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              Workspace
            </div>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-base font-medium text-ink">
                {workspace.name}
              </span>
              <span className="rounded-full border border-rule-2 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                {workspace.plan}
              </span>
            </div>
            <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              Signed in as
            </div>
            <div className="mt-1">
              <div className="text-sm font-medium text-ink">
                {operator.name}
              </div>
              <div className="font-mono text-[11px] text-muted">
                {operator.role}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              start(() => logoutAction());
            }}
            disabled={pending}
            className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border border-rule-2 text-sm font-medium transition disabled:opacity-60"
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
        </MobileDrawer>
      )}
    </header>
  );
}

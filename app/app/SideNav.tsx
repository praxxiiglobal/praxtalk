"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

export const navItems: { href: string; label: string; icon: NavIconName }[] = [
  { href: "/app", label: "Inbox", icon: "inbox" },
  { href: "/app/notifications", label: "Notifications", icon: "bell" },
  { href: "/app/leads", label: "Leads", icon: "lead" },
  { href: "/app/atlas", label: "Atlas AI", icon: "atlas" },
  { href: "/app/analytics", label: "Analytics", icon: "chart" },
  { href: "/app/brands", label: "Brands", icon: "brand" },
  { href: "/app/team", label: "Team", icon: "team" },
  { href: "/app/saved-replies", label: "Saved replies", icon: "reply" },
  { href: "/app/integrations", label: "Integrations", icon: "plug" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
  { href: "/app/billing", label: "Billing", icon: "card" },
];

export function SideNav() {
  const pathname = usePathname();
  const { sessionToken } = useDashboardAuth();
  const summary = useQuery(api.notifications.summary, { sessionToken });
  const unread = summary?.unreadCount ?? 0;

  return (
    <aside className="hidden w-56 shrink-0 border-r border-rule bg-paper-2/40 md:flex md:flex-col">
      <nav className="flex flex-col gap-0.5 p-3">
        {navItems.map((item) => {
          const active =
            item.href === "/app"
              ? pathname === "/app"
              : pathname?.startsWith(item.href);
          const showBadge = item.href === "/app" && unread > 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition",
                active
                  ? "bg-ink text-paper"
                  : "text-ink/85 hover:bg-paper-2 hover:text-ink",
              )}
            >
              <NavIcon name={item.icon} active={active} />
              <span className="flex-1">{item.label}</span>
              {showBadge ? (
                <span
                  className={cn(
                    "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold",
                    active ? "bg-paper text-ink" : "bg-warn text-ink",
                  )}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { sessionToken } = useDashboardAuth();
  const summary = useQuery(api.notifications.summary, { sessionToken });
  const unread = summary?.unreadCount ?? 0;
  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => {
        const active =
          item.href === "/app"
            ? pathname === "/app"
            : pathname?.startsWith(item.href);
        const showBadge = item.href === "/app" && unread > 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-base font-medium transition",
              active
                ? "bg-ink text-paper"
                : "text-ink hover:bg-paper-2",
            )}
          >
            <NavIcon name={item.icon} active={active} />
            <span className="flex-1">{item.label}</span>
            {showBadge ? (
              <span
                className={cn(
                  "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold",
                  active ? "bg-paper text-ink" : "bg-warn text-ink",
                )}
              >
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

type NavIconName =
  | "inbox"
  | "bell"
  | "lead"
  | "atlas"
  | "chart"
  | "brand"
  | "team"
  | "reply"
  | "plug"
  | "settings"
  | "card";

function NavIcon({ name, active }: { name: NavIconName; active?: boolean }) {
  const stroke = active ? "currentColor" : "currentColor";
  const common = {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke,
    strokeWidth: 1.5,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "inbox":
      return (
        <svg {...common} aria-hidden>
          <path d="M2 8.5h3l1 2h4l1-2h3M2 4h12v8H2z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common} aria-hidden>
          <path d="M3 11h10l-1.2-2.4V6a3.8 3.8 0 0 0-7.6 0v2.6L3 11z" />
          <path d="M6.5 12.5a1.5 1.5 0 0 0 3 0" />
        </svg>
      );
    case "lead":
      return (
        <svg {...common} aria-hidden>
          <path d="M8 2v8M5 7l3 3 3-3M3 13h10" />
        </svg>
      );
    case "atlas":
      return (
        <svg {...common} aria-hidden>
          <path d="M8 2L3 5v4c0 3 2 5 5 6 3-1 5-3 5-6V5L8 2z" />
          <path d="M6 8l1.5 1.5L10 7" />
        </svg>
      );
    case "chart":
      return (
        <svg {...common} aria-hidden>
          <path d="M2 13h12M4 13V8M8 13V4M12 13V10" />
        </svg>
      );
    case "brand":
      return (
        <svg {...common} aria-hidden>
          <path d="M2.5 4.5L8 1.5l5.5 3v7L8 14.5 2.5 11.5zM8 1.5v13M2.5 4.5L8 8l5.5-3.5" />
        </svg>
      );
    case "team":
      return (
        <svg {...common} aria-hidden>
          <circle cx="6" cy="6" r="2.5" />
          <path d="M2 13c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" />
          <circle cx="11.5" cy="5" r="2" />
          <path d="M10 12.5c0-1.5 1.4-2.5 3-2.5" />
        </svg>
      );
    case "reply":
      return (
        <svg {...common} aria-hidden>
          <path d="M5 3l-3 3 3 3M3 6h7a4 4 0 0 1 0 8H6" />
        </svg>
      );
    case "plug":
      return (
        <svg {...common} aria-hidden>
          <path d="M5 1v3M11 1v3M3.5 4h9v3.5a4.5 4.5 0 0 1-9 0V4zM8 12v3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common} aria-hidden>
          <circle cx="8" cy="8" r="2" />
          <path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" />
        </svg>
      );
    case "card":
      return (
        <svg {...common} aria-hidden>
          <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
          <path d="M1.5 6.5h13M4 10h2" />
        </svg>
      );
  }
}

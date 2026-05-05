"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

type NavGroup = {
  label: string | null;
  items: { href: string; label: string; icon: NavIconName }[];
};

/**
 * Side nav reorganised into three implicit groups so it scans as
 * categories instead of one flat list of nine.
 *
 * Reminders + Booking pages already live under Schedules.
 * Integrations / Brands / Team / Saved replies / Billing all live
 * under Settings.
 */
export const navGroups: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/app", label: "Inbox", icon: "inbox" },
      { href: "/app/notifications", label: "Notifications", icon: "bell" },
      { href: "/app/leads", label: "Leads", icon: "lead" },
      { href: "/app/calls", label: "Calls", icon: "phone" },
      { href: "/app/emails", label: "Emails", icon: "envelope" },
    ],
  },
  {
    label: "Workflow",
    items: [
      { href: "/app/schedules", label: "Schedules", icon: "calendar" },
      { href: "/app/atlas", label: "Atlas AI", icon: "atlas" },
      { href: "/app/analytics", label: "Analytics", icon: "chart" },
    ],
  },
  {
    label: null,
    items: [
      { href: "/app/settings", label: "Settings", icon: "settings" },
    ],
  },
];

// Flat list kept for any external imports of `navItems`.
export const navItems = navGroups.flatMap((g) => g.items);

/**
 * Decide which row a given href's badge should display, and what
 * count to show. notifications.summary returns split counts so we
 * can put the *right* number on each:
 *  - Inbox row → chatUnreadCount (unread visitor messages)
 *  - Notifications row → activityUnreadCount (system events)
 * Conflating them ends up showing chat traffic next to the bell,
 * which is what the previous fix accidentally did.
 */
function badgeCountFor(
  href: string,
  summary: { chatUnreadCount: number; activityUnreadCount: number } | undefined,
): number {
  if (!summary) return 0;
  if (href === "/app") return summary.chatUnreadCount;
  if (href === "/app/notifications") return summary.activityUnreadCount;
  return 0;
}

/**
 * Filter the static nav groups by the workspace's resolved feature
 * flags. A disabled module → its top-level item disappears. The
 * Calls / Emails entries are also bound to the matching channel
 * flag so a chat-only workspace doesn't see an Emails tab leading
 * to an empty page.
 */
function filterGroupsByFeatures(
  groups: NavGroup[],
  features: {
    channels: { email: boolean; voice: boolean };
    modules: {
      atlasAi: boolean;
      leads: boolean;
      bookingPages: boolean;
      analytics: boolean;
    };
  },
): NavGroup[] {
  const visibleHrefs = new Set<string>();
  // Always-on items that aren't gated.
  visibleHrefs.add("/app");
  visibleHrefs.add("/app/notifications");
  visibleHrefs.add("/app/settings");
  if (features.modules.leads) visibleHrefs.add("/app/leads");
  if (features.channels.email) visibleHrefs.add("/app/emails");
  if (features.channels.voice) visibleHrefs.add("/app/calls");
  if (features.modules.bookingPages) visibleHrefs.add("/app/schedules");
  if (features.modules.atlasAi) visibleHrefs.add("/app/atlas");
  if (features.modules.analytics) visibleHrefs.add("/app/analytics");
  return groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => visibleHrefs.has(i.href)),
    }))
    .filter((g) => g.items.length > 0);
}

export function SideNav() {
  const pathname = usePathname();
  const { sessionToken, workspace } = useDashboardAuth();
  const summary = useQuery(api.notifications.summary, { sessionToken });
  const groups = filterGroupsByFeatures(navGroups, workspace.features);

  return (
    <aside className="hidden w-56 shrink-0 border-r border-rule bg-paper-2/40 md:flex md:flex-col">
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {groups.map((group, gi) => {
          const isLast = gi === groups.length - 1;
          return (
          <div
            key={gi}
            className={cn(
              "flex flex-col gap-0.5",
              gi > 0 && (isLast ? "mt-auto" : "mt-3"),
            )}
          >
            {group.label && (
              <div className="mb-1 px-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-muted">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active =
                item.href === "/app"
                  ? pathname === "/app"
                  : pathname?.startsWith(item.href);
              const count = badgeCountFor(item.href, summary);
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
                  {count > 0 ? (
                    <span
                      className={cn(
                        "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold",
                        active ? "bg-paper text-ink" : "bg-warn text-ink",
                      )}
                    >
                      {count > 99 ? "99+" : count}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          );
        })}
      </nav>
    </aside>
  );
}

export function MobileNavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { sessionToken, workspace } = useDashboardAuth();
  const summary = useQuery(api.notifications.summary, { sessionToken });
  const groups = filterGroupsByFeatures(navGroups, workspace.features);
  return (
    <nav className="flex flex-col gap-1">
      {groups.map((group, gi) => (
        <div key={gi} className={cn("flex flex-col gap-0.5", gi > 0 && "mt-3")}>
          {group.label && (
            <div className="mb-1 px-3 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
              {group.label}
            </div>
          )}
          {group.items.map((item) => {
            const active =
              item.href === "/app"
                ? pathname === "/app"
                : pathname?.startsWith(item.href);
            const count = badgeCountFor(item.href, summary);
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
                {count > 0 ? (
                  <span
                    className={cn(
                      "inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold",
                      active ? "bg-paper text-ink" : "bg-warn text-ink",
                    )}
                  >
                    {count > 99 ? "99+" : count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

type NavIconName =
  | "inbox"
  | "bell"
  | "lead"
  | "phone"
  | "envelope"
  | "calendar"
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
    case "phone":
      return (
        <svg {...common} aria-hidden>
          <path d="M14 11.3v2a1.3 1.3 0 0 1-1.4 1.4 13.2 13.2 0 0 1-5.8-2 13 13 0 0 1-4-4 13.2 13.2 0 0 1-2-5.8A1.3 1.3 0 0 1 2.1 1.5h2a1.3 1.3 0 0 1 1.4 1.1c.1.6.2 1.2.5 1.8a1.3 1.3 0 0 1-.3 1.4l-.8.8a10.7 10.7 0 0 0 4 4l.8-.8a1.3 1.3 0 0 1 1.4-.3c.6.2 1.2.4 1.8.5A1.3 1.3 0 0 1 14 11.3z" />
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
    case "envelope":
      return (
        <svg {...common} aria-hidden>
          <rect x="1.5" y="3.5" width="13" height="9" rx="1" />
          <path d="M2 4l6 5 6-5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common} aria-hidden>
          <rect x="2" y="3" width="12" height="11" rx="1" />
          <path d="M2 7h12M5 1.5v3M11 1.5v3" />
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
          {/* Cog with 8 teeth + inner circle. Teeth as short
              radial nubs around an inner ring; reads as a gear at
              16px better than the prior sunburst-circle pattern. */}
          <circle cx="8" cy="8" r="2.2" />
          <path d="M8 1.5v1.8M8 12.7v1.8M14.5 8h-1.8M3.3 8H1.5M12.6 3.4l-1.3 1.3M4.7 11.3l-1.3 1.3M12.6 12.6l-1.3-1.3M4.7 4.7L3.4 3.4" />
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

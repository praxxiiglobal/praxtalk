"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type Severity = "info" | "success" | "warn" | "error";

type Item = {
  _id: Id<"notifications">;
  kind: string;
  severity: Severity;
  title: string;
  body?: string;
  link?: string;
  readAt?: number;
  createdAt: number;
};

const KIND_LABELS: Record<string, string> = {
  lead_created: "Lead created",
  conversation_assigned: "Conversation assigned",
  webhook_failed: "Webhook failed",
  email_failed: "Email failed",
  atlas_error: "Atlas error",
  brand_created: "Brand created",
  operator_added: "Operator added",
  api_key_created: "API key minted",
  system: "System",
};

export function NotificationsView() {
  const { sessionToken } = useDashboardAuth();
  const items = useQuery(api.notifications.listActivity, {
    sessionToken,
    limit: 200,
  });
  const markRead = useMutation(api.notifications.markActivityRead);
  const markAllRead = useMutation(api.notifications.markAllRead);
  const [filter, setFilter] = useState<"all" | "unread">("unread");

  if (!items) {
    return (
      <Card>
        <div className="py-8 text-center text-sm text-muted">Loading…</div>
      </Card>
    );
  }

  const filtered = filter === "unread" ? items.filter((i) => !i.readAt) : items;
  const unreadCount = items.filter((i) => !i.readAt).length;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                filter === "unread"
                  ? "bg-ink text-paper"
                  : "border border-rule-2 text-muted hover:text-ink",
              )}
            >
              Unread{unreadCount > 0 ? ` · ${unreadCount}` : ""}
            </button>
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={cn(
                "rounded-full px-3 py-1 font-mono text-[11px] uppercase tracking-[0.06em] transition",
                filter === "all"
                  ? "bg-ink text-paper"
                  : "border border-rule-2 text-muted hover:text-ink",
              )}
            >
              All
            </button>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => markAllRead({ sessionToken })}
              className="text-[12px] font-medium text-ink underline-offset-2 hover:underline"
            >
              Mark all read
            </button>
          ) : null}
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <div className="rounded-xl border border-dashed border-rule p-8 text-center text-sm text-muted">
            {filter === "unread"
              ? "No unread notifications. You're all caught up."
              : "No activity yet. New events will land here as they happen."}
          </div>
        </Card>
      ) : (
        <Card>
          <ul className="divide-y divide-rule">
            {filtered.map((n) => (
              <NotificationRow
                key={n._id}
                item={n as Item}
                onMarkRead={() =>
                  markRead({ sessionToken, notificationId: n._id })
                }
              />
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}

function NotificationRow({
  item,
  onMarkRead,
}: {
  item: Item;
  onMarkRead: () => void;
}) {
  const isUnread = !item.readAt;
  const handleClick = () => {
    if (isUnread) onMarkRead();
  };

  const Inner = (
    <div className="flex items-start gap-3 py-3">
      <SeverityDot severity={item.severity} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-ink">
            {item.title}
          </span>
          {isUnread ? (
            <span className="size-1.5 shrink-0 rounded-full bg-warn" />
          ) : null}
        </div>
        {item.body ? (
          <div className="mt-0.5 truncate font-mono text-[11.5px] text-muted">
            {item.body}
          </div>
        ) : null}
        <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
          {KIND_LABELS[item.kind] ?? item.kind} · {timeAgo(item.createdAt)}
        </div>
      </div>
    </div>
  );

  if (item.link) {
    return (
      <li>
        <Link
          href={item.link}
          onClick={handleClick}
          className="-mx-2 block rounded-lg px-2 transition hover:bg-paper-2"
        >
          {Inner}
        </Link>
      </li>
    );
  }
  return (
    <li
      className="-mx-2 cursor-pointer rounded-lg px-2 transition hover:bg-paper-2"
      onClick={handleClick}
    >
      {Inner}
    </li>
  );
}

function SeverityDot({ severity }: { severity: Severity }) {
  const cls =
    severity === "error"
      ? "bg-warn"
      : severity === "warn"
        ? "bg-warn/70"
        : severity === "success"
          ? "bg-good"
          : "bg-rule-2";
  return (
    <span className={cn("mt-2 size-2 shrink-0 rounded-full", cls)} aria-hidden />
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

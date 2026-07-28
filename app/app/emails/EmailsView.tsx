"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../_components/DashboardShell";
import { Card } from "../_components/PageHeader";
import { cn } from "@/lib/cn";

type Folder = "inbox" | "sent" | "drafts" | "all";
type Status = "open" | "snoozed" | "resolved" | "closed";

const FOLDERS: { value: Folder; label: string; icon: string }[] = [
  { value: "inbox", label: "Inbox", icon: "📥" },
  { value: "sent", label: "Sent", icon: "📤" },
  { value: "drafts", label: "Drafts", icon: "📝" },
  { value: "all", label: "All", icon: "📂" },
];

const STATUSES: Status[] = ["open", "snoozed", "resolved", "closed"];

export function EmailsView() {
  const { sessionToken } = useDashboardAuth();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [status, setStatus] = useState<Status>("open");

  const conversations = useQuery(
    api.conversations.listInbox,
    folder === "drafts"
      ? "skip"
      : {
          sessionToken,
          status,
          channel: "email",
          folder: folder === "all" ? "all" : folder,
        },
  );
  const drafts = useQuery(
    api.messageDrafts.listMine,
    folder === "drafts" ? { sessionToken } : "skip",
  );

  return (
    <Card title="">
      {/* Folder tabs */}
      <div className="mb-3 flex items-center gap-1 border-b border-rule pb-3">
        {FOLDERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFolder(f.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition",
              folder === f.value
                ? "bg-ink text-paper"
                : "text-muted hover:text-ink",
            )}
          >
            <span>{f.icon}</span>
            <span>{f.label}</span>
          </button>
        ))}
      </div>

      {/* Status sub-tabs (not for drafts) */}
      {folder !== "drafts" && (
        <div className="mb-3 flex items-center gap-1">
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition",
                status === s
                  ? "bg-paper text-ink ring-1 ring-rule-2"
                  : "text-muted hover:text-ink",
              )}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      {folder === "drafts" ? (
        <DraftsList drafts={drafts} />
      ) : (
        <ConversationsList conversations={conversations} />
      )}
    </Card>
  );
}

type ConversationRow = {
  _id: string;
  lastMessageAt: number;
  status: Status;
  channel: string;
  visitor: { name?: string; email?: string; phone?: string } | null;
  brand: { name: string; primaryColor: string } | null;
};

function ConversationsList({
  conversations,
}: {
  conversations: ConversationRow[] | undefined;
}) {
  if (conversations === undefined) {
    return <div className="py-8 text-center text-xs text-muted">Loading…</div>;
  }
  if (conversations.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted">
        No conversations match this filter.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-rule">
      {conversations.map((c) => (
        <li key={c._id}>
          <Link
            href={`/app?conversation=${c._id}`}
            className="flex items-start justify-between gap-4 py-3 transition hover:bg-paper-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-[13.5px] font-medium text-ink">
                  {c.visitor?.name ?? c.visitor?.email ?? "Anonymous"}
                </span>
                {c.brand && (
                  <span
                    className="shrink-0 rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] text-paper"
                    style={{ backgroundColor: c.brand.primaryColor }}
                  >
                    {c.brand.name}
                  </span>
                )}
              </div>
              {c.visitor?.email && (
                <div className="mt-0.5 font-mono text-[11px] text-muted">
                  {c.visitor.email}
                </div>
              )}
            </div>
            <span className="shrink-0 font-mono text-[11px] text-muted">
              {timeAgo(c.lastMessageAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

type DraftRow = {
  _id: string;
  conversationId: string;
  visitorName: string | null;
  visitorEmail: string | null;
  body: string;
  isInternal: boolean;
  updatedAt: number;
};

function DraftsList({ drafts }: { drafts: DraftRow[] | undefined }) {
  const { sessionToken } = useDashboardAuth();
  const remove = useMutation(api.messageDrafts.remove);
  if (drafts === undefined) {
    return <div className="py-8 text-center text-xs text-muted">Loading…</div>;
  }
  if (drafts.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-muted">
        No drafts. Drafts autosave as you type in the conversation composer.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-rule">
      {drafts.map((d) => (
        <li
          key={d._id}
          className="flex items-start justify-between gap-4 py-3"
        >
          <Link
            href={`/app?conversation=${d.conversationId}`}
            className="min-w-0 flex-1"
          >
            <div className="flex items-center gap-2">
              <span className="text-[13.5px] font-medium text-ink">
                {d.visitorName ?? d.visitorEmail ?? "Anonymous"}
              </span>
              {d.isInternal && (
                <span className="rounded-full bg-warn/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em] text-warn">
                  Internal note
                </span>
              )}
              <span className="font-mono text-[10px] text-muted">
                {timeAgo(d.updatedAt)}
              </span>
            </div>
            <p className="mt-1 line-clamp-2 text-[13px] text-muted">
              {d.body}
            </p>
          </Link>
          <button
            type="button"
            onClick={() => {
              if (confirm("Discard this draft?")) {
                void remove({
                  sessionToken,
                  conversationId: d.conversationId as never,
                });
              }
            }}
            className="shrink-0 rounded-full border border-rule-2 px-3 py-1 text-[11px] font-medium text-muted hover:text-ink"
          >
            Discard
          </button>
        </li>
      ))}
    </ul>
  );
}

function timeAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

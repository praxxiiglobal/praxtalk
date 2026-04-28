"use client";

import { useQuery, useMutation } from "convex/react";
import { useState, useMemo, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

type Status = "open" | "snoozed" | "resolved" | "closed";

const tabs: { value: Status; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "snoozed", label: "Snoozed" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export function Inbox() {
  const { sessionToken, workspace } = useDashboardAuth();
  const [status, setStatus] = useState<Status>("open");
  const [selectedId, setSelectedId] =
    useState<Id<"conversations"> | null>(null);

  const conversations = useQuery(api.conversations.listInbox, {
    sessionToken,
    status,
  });

  // Auto-select the first conversation when list loads.
  const firstId = conversations?.[0]?._id ?? null;
  const activeId =
    selectedId &&
    conversations?.some((c) => c._id === selectedId)
      ? selectedId
      : firstId;

  return (
    <div className="grid h-[calc(100vh-3.5rem)] grid-cols-[320px_1fr]">
      <aside className="flex flex-col border-r border-rule bg-paper-2/60">
        <div className="flex items-center gap-1 border-b border-rule px-3 py-2">
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => {
                setStatus(t.value);
                setSelectedId(null);
              }}
              className={cn(
                "rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.06em] transition",
                status === t.value
                  ? "bg-ink text-paper"
                  : "text-muted hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <ConversationList
          conversations={conversations}
          activeId={activeId}
          onSelect={(id) => setSelectedId(id)}
        />
      </aside>

      <section className="flex min-w-0 flex-col bg-paper">
        {activeId ? (
          <ConversationPane
            conversationId={activeId}
            sessionToken={sessionToken}
          />
        ) : (
          <EmptyState widgetId={workspace.widgetId} />
        )}
      </section>
    </div>
  );
}

function ConversationList({
  conversations,
  activeId,
  onSelect,
}: {
  conversations:
    | Array<{
        _id: Id<"conversations">;
        lastMessageAt: number;
        status: Status;
        visitor: { name?: string; email?: string } | null;
      }>
    | undefined;
  activeId: Id<"conversations"> | null;
  onSelect: (id: Id<"conversations">) => void;
}) {
  if (conversations === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted">
        Loading…
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-5 text-center text-xs text-muted">
        No conversations in this view yet.
      </div>
    );
  }
  return (
    <ul className="no-scrollbar flex-1 overflow-y-auto">
      {conversations.map((c) => (
        <li key={c._id}>
          <button
            type="button"
            onClick={() => onSelect(c._id)}
            className={cn(
              "flex w-full items-center gap-3 border-b border-rule px-4 py-3 text-left transition",
              c._id === activeId
                ? "bg-paper"
                : "hover:bg-paper",
            )}
          >
            <Avatar
              name={c.visitor?.name ?? c.visitor?.email ?? "Anonymous"}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[13px] font-medium tracking-[-0.01em]">
                  {c.visitor?.name ??
                    c.visitor?.email ??
                    "Anonymous visitor"}
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {timeAgo(c.lastMessageAt)}
                </span>
              </div>
              <div className="truncate font-mono text-[11px] text-muted">
                {c.visitor?.email ?? "no email"}
              </div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConversationPane({
  conversationId,
  sessionToken,
}: {
  conversationId: Id<"conversations">;
  sessionToken: string;
}) {
  const convo = useQuery(api.conversations.getById, {
    sessionToken,
    conversationId,
  });
  const messages = useQuery(api.messages.listByConversation, {
    sessionToken,
    conversationId,
  });
  const sendMessage = useMutation(api.messages.send);
  const setStatus = useMutation(api.conversations.setStatus);

  const [body, setBody] = useState("");

  if (convo === undefined || messages === undefined) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted">
        Loading conversation…
      </div>
    );
  }
  if (convo === null) {
    return (
      <div className="flex flex-1 items-center justify-center text-xs text-muted">
        Conversation not found.
      </div>
    );
  }

  const visitorName =
    convo.visitor?.name ?? convo.visitor?.email ?? "Anonymous visitor";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    setBody("");
    await sendMessage({
      sessionToken,
      conversationId,
      body: trimmed,
    });
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-rule px-5 py-3">
        <Avatar name={visitorName} />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold tracking-[-0.01em]">
            {visitorName}
          </div>
          <div className="truncate font-mono text-[11px] text-muted">
            {convo.visitor?.email ?? "no email"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill status={convo.status} />
          {convo.status !== "resolved" && (
            <button
              type="button"
              onClick={() =>
                setStatus({
                  sessionToken,
                  conversationId,
                  status: "resolved",
                })
              }
              className="inline-flex h-7 items-center rounded-full border border-rule-2 px-3 text-[11px] font-medium transition hover:-translate-y-px"
            >
              Mark resolved
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="m-auto text-xs text-muted">
            No messages in this conversation yet.
          </div>
        )}
        {messages.map((m) => (
          <Bubble key={m._id} role={m.role} body={m.body} />
        ))}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex items-end gap-2 border-t border-rule bg-paper-2/60 px-4 py-3"
      >
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit(e as unknown as FormEvent);
            }
          }}
          placeholder="Reply… (⌘+Enter to send)"
          rows={2}
          className="flex-1 resize-none rounded-xl border border-rule bg-paper px-3 py-2 text-[14px] outline-none transition placeholder:text-muted/70 focus:border-ink focus:shadow-[0_0_0_4px_var(--color-accent-soft)]"
        />
        <button
          type="submit"
          disabled={!body.trim()}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-40"
        >
          Send <span aria-hidden>↵</span>
        </button>
      </form>
    </div>
  );
}

function EmptyState({ widgetId }: { widgetId: string }) {
  const snippet = `<script src="https://cdn.praxtalk.com/widget.js" data-workspace-id="${widgetId}" defer></script>`;
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="eyebrow mb-3 text-muted">Inbox is empty</div>
        <h2 className="mb-2 text-2xl font-semibold tracking-[-0.02em]">
          Embed your widget to receive your first message.
        </h2>
        <p className="mb-5 text-sm text-muted">
          Paste this snippet into any page on your site, just before
          {" "}<code className="font-mono">&lt;/body&gt;</code>.
        </p>
        <pre className="overflow-x-auto rounded-xl border border-rule bg-ink p-4 text-left font-mono text-[11.5px] leading-relaxed text-paper">
          {snippet}
        </pre>
      </div>
    </div>
  );
}

function Bubble({
  role,
  body,
}: {
  role: "visitor" | "operator" | "atlas" | "system";
  body: string;
}) {
  const base =
    "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-[1.45] whitespace-pre-wrap break-words";
  if (role === "operator") {
    return (
      <div className={cn(base, "self-end rounded-tr-[4px] bg-ink text-paper")}>
        {body}
      </div>
    );
  }
  if (role === "atlas") {
    return (
      <div
        className={cn(
          base,
          "self-start rounded-tl-[4px] border border-accent/30 bg-accent-soft",
        )}
      >
        {body}
      </div>
    );
  }
  if (role === "system") {
    return (
      <div className="self-center rounded-full bg-paper-2 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
        {body}
      </div>
    );
  }
  return (
    <div className={cn(base, "self-start rounded-tl-[4px] bg-paper-2")}>
      {body}
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = useMemo(() => {
    const parts = name.trim().split(/\s+/);
    return (parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "");
  }, [name]);
  return (
    <div className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-semibold uppercase text-paper">
      {initials}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  const map: Record<Status, string> = {
    open: "bg-good text-white",
    snoozed: "bg-warn text-ink",
    resolved: "bg-paper-2 text-muted border border-rule-2",
    closed: "bg-paper-2 text-muted border border-rule-2",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em]",
        map[status],
      )}
    >
      {status}
    </span>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

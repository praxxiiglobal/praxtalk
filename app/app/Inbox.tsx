"use client";

import { useQuery, useMutation } from "convex/react";
import { useEffect, useState, useMemo, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "./DashboardShell";
import { useSelectedBrand } from "./useSelectedBrand";
import { cn } from "@/lib/cn";

type Status = "open" | "snoozed" | "resolved" | "closed";
type Channel = "web_chat" | "email" | "whatsapp" | "voice";

const tabs: { value: Status; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "snoozed", label: "Snoozed" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

export function Inbox() {
  const { sessionToken, workspace } = useDashboardAuth();
  const selectedBrand = useSelectedBrand();
  const [status, setStatus] = useState<Status>("open");
  const [selectedId, setSelectedId] =
    useState<Id<"conversations"> | null>(null);

  const conversations = useQuery(api.conversations.listInbox, {
    sessionToken,
    status,
    brandId: selectedBrand ?? undefined,
  });

  // Auto-select the first conversation when list loads.
  const firstId = conversations?.[0]?._id ?? null;
  const activeId =
    selectedId &&
    conversations?.some((c) => c._id === selectedId)
      ? selectedId
      : firstId;

  return (
    <div className="grid flex-1 min-h-0 grid-cols-1 md:grid-cols-[320px_1fr]">
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
          <EmptyState />
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
        channel: Channel;
        visitor: { name?: string; email?: string; phone?: string } | null;
        brand: { _id: Id<"brands">; name: string; primaryColor: string } | null;
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
                <span className="flex min-w-0 items-center gap-1.5">
                  <ChannelGlyph channel={c.channel} />
                  <span className="truncate text-[13px] font-medium tracking-[-0.01em]">
                    {c.visitor?.name ??
                      c.visitor?.email ??
                      "Anonymous visitor"}
                  </span>
                </span>
                <span className="font-mono text-[10px] text-muted">
                  {timeAgo(c.lastMessageAt)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                {c.brand ? (
                  <span
                    className="inline-flex max-w-[110px] shrink-0 items-center gap-1 truncate whitespace-nowrap rounded-full px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.04em] text-paper"
                    style={{ backgroundColor: c.brand.primaryColor }}
                    title={c.brand.name}
                  >
                    {c.brand.name}
                  </span>
                ) : null}
                <span className="truncate font-mono text-[11px] text-muted">
                  {c.visitor?.email ?? "no email"}
                </span>
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
  const markRead = useMutation(api.notifications.markRead);
  // Mark the conversation as read whenever the operator views it.
  // Re-fires when the visitor sends another message inside the same
  // open pane so the bell badge stays accurate.
  const lastMessageAt = convo?.lastMessageAt;
  useEffect(() => {
    if (!conversationId) return;
    void markRead({ sessionToken, conversationId });
  }, [conversationId, lastMessageAt, markRead, sessionToken]);
  const messages = useQuery(api.messages.listByConversation, {
    sessionToken,
    conversationId,
  });
  const sendMessage = useMutation(api.messages.send);
  const setStatus = useMutation(api.conversations.setStatus);
  const savedReplies = useQuery(api.savedReplies.list, { sessionToken });

  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [showReplies, setShowReplies] = useState(false);

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
    const wasInternal = internal;
    setInternal(false);
    await sendMessage({
      sessionToken,
      conversationId,
      body: trimmed,
      internal: wasInternal,
    });
  };

  const insertReply = (text: string) => {
    setBody((cur) => (cur ? cur + (cur.endsWith("\n") ? "" : "\n") + text : text));
    setShowReplies(false);
  };

  const visitor = convo.visitor;
  const location = visitor?.location;
  const locationLabel = location
    ? [location.city, location.region, location.country]
        .filter(Boolean)
        .join(", ") || undefined
    : undefined;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-3 border-b border-rule px-5 py-3">
        <Avatar name={visitorName} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold tracking-[-0.01em]">
              {visitorName}
            </span>
            {convo.brand ? (
              <span
                className="inline-flex max-w-[160px] shrink-0 items-center gap-1 truncate whitespace-nowrap rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.04em] text-paper"
                style={{ backgroundColor: convo.brand.primaryColor }}
                title={convo.brand.name}
              >
                {convo.brand.name}
              </span>
            ) : null}
          </div>
          <div className="truncate font-mono text-[11px] text-muted">
            {visitor?.email ?? "no email"}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <StatusPill status={convo.status} />
          <SaveAsLeadButton
            conversationId={conversationId}
            visitor={visitor}
            sessionToken={sessionToken}
          />
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

      {(visitor?.phone || visitor?.ip || locationLabel) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-rule bg-paper-2/40 px-5 py-2 font-mono text-[11px] text-muted">
          {visitor?.phone ? (
            <span>
              <span className="opacity-60">phone</span>{" "}
              <a
                href={`tel:${visitor.phone}`}
                className="text-ink hover:text-accent"
              >
                {visitor.phone}
              </a>
            </span>
          ) : null}
          {locationLabel ? (
            <span title="IP-based — approximate, often resolves to the ISP's POP rather than the visitor's exact city">
              <span className="opacity-60">loc (approx)</span>{" "}
              <span className="text-ink">{locationLabel}</span>
              {location?.timezone ? (
                <span className="opacity-60"> · {location.timezone}</span>
              ) : null}
            </span>
          ) : null}
          {visitor?.ip ? (
            <span>
              <span className="opacity-60">ip</span>{" "}
              <span className="text-ink">{visitor.ip}</span>
            </span>
          ) : null}
        </div>
      )}

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="m-auto text-xs text-muted">
            No messages in this conversation yet.
          </div>
        )}
        {messages.map((m) => (
          <Bubble
            key={m._id}
            role={m.role}
            body={m.body}
            emailDelivery={
              m.role === "operator" || m.role === "atlas"
                ? m.emailDelivery
                : undefined
            }
          />
        ))}
      </div>

      <AtlasSuggestionPanel
        conversationId={conversationId}
        sessionToken={sessionToken}
      />

      <form
        onSubmit={onSubmit}
        className={cn(
          "flex flex-col gap-2 border-t border-rule px-4 py-3 transition",
          internal ? "bg-warn/10" : "bg-paper-2/60",
        )}
      >
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.06em]">
          <button
            type="button"
            onClick={() => setInternal(false)}
            className={cn(
              "rounded-full px-2.5 py-1 transition",
              !internal
                ? "bg-ink text-paper"
                : "border border-rule-2 text-muted hover:text-ink",
            )}
          >
            Reply
          </button>
          <button
            type="button"
            onClick={() => setInternal(true)}
            className={cn(
              "rounded-full px-2.5 py-1 transition",
              internal
                ? "bg-warn text-ink"
                : "border border-rule-2 text-muted hover:text-ink",
            )}
            title="Internal note — only your team sees this"
          >
            Internal note
          </button>
          <div className="ml-auto relative">
            {savedReplies && savedReplies.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowReplies((v) => !v)}
                className="rounded-full border border-rule-2 px-2.5 py-1 text-muted transition hover:text-ink"
                aria-haspopup="listbox"
                aria-expanded={showReplies}
              >
                Saved replies ▾
              </button>
            ) : (
              <a
                href="/app/saved-replies"
                className="rounded-full border border-rule-2 px-2.5 py-1 text-muted transition hover:text-ink"
                title="No saved replies yet — create one"
              >
                + Saved reply
              </a>
            )}
            {showReplies && savedReplies && savedReplies.length > 0 ? (
              <div
                role="listbox"
                className="absolute right-0 bottom-full z-20 mb-2 w-72 max-h-60 overflow-y-auto rounded-xl border border-rule bg-paper p-1 shadow-2xl"
              >
                {savedReplies.map((r) => (
                  <button
                    key={r._id}
                    type="button"
                    role="option"
                    onClick={() => insertReply(r.body)}
                    className="flex w-full flex-col items-start gap-0.5 rounded-lg px-3 py-2 text-left transition hover:bg-paper-2"
                  >
                    <span className="text-sm font-medium text-ink">
                      {r.title}
                      {r.shortcut ? (
                        <span className="ml-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                          {r.shortcut}
                        </span>
                      ) : null}
                    </span>
                    <span className="line-clamp-2 text-[12px] leading-[1.4] text-muted">
                      {r.body}
                    </span>
                  </button>
                ))}
                <div className="border-t border-rule">
                  <a
                    href="/app/saved-replies"
                    className="block px-3 py-2 text-[11px] font-medium text-muted hover:text-ink"
                  >
                    Manage saved replies →
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onSubmit(e as unknown as FormEvent);
              }
            }}
            placeholder={
              internal
                ? "Internal note — only the team sees this. (⌘+Enter to save)"
                : "Reply… (⌘+Enter to send)"
            }
            rows={2}
            className={cn(
              "flex-1 resize-none rounded-xl border bg-paper px-3 py-2 text-[14px] outline-none transition placeholder:text-muted/70",
              internal
                ? "border-warn/40 focus:border-warn focus:shadow-[0_0_0_4px_rgba(255,200,80,0.18)]"
                : "border-rule focus:border-ink focus:shadow-[0_0_0_4px_var(--color-accent-soft)]",
            )}
          />
          <button
            type="submit"
            disabled={!body.trim()}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium transition hover:-translate-y-px disabled:opacity-40",
              internal ? "bg-warn text-ink" : "bg-ink text-paper",
            )}
          >
            {internal ? "Save note" : "Send"}{" "}
            <span aria-hidden>↵</span>
          </button>
        </div>
      </form>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="eyebrow mb-3 text-muted">Inbox is empty</div>
        <h2 className="mb-2 text-2xl font-semibold tracking-[-0.02em]">
          Embed a brand widget to receive your first message.
        </h2>
        <p className="mb-5 text-sm text-muted">
          Each brand has its own snippet. Open{" "}
          <a
            href="/app/brands"
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            /app/brands
          </a>{" "}
          to copy the embed code, then paste it just before{" "}
          <code className="font-mono">&lt;/body&gt;</code> on your site.
        </p>
      </div>
    </div>
  );
}

type EmailDelivery = {
  status: "pending" | "retrying" | "delivered" | "failed";
  attempts: number;
  error?: string;
  nextRetryAt?: number;
  deliveredAt?: number;
};

function Bubble({
  role,
  body,
  emailDelivery,
}: {
  role: "visitor" | "operator" | "atlas" | "system" | "internal_note";
  body: string;
  emailDelivery?: EmailDelivery;
}) {
  if (role === "internal_note") {
    return (
      <div className="flex max-w-[78%] flex-col items-end self-end gap-1">
        <div className="rounded-2xl border border-warn/40 bg-warn/15 px-3.5 py-2.5 text-[14px] leading-[1.45] text-ink whitespace-pre-wrap break-words">
          {body}
        </div>
        <span className="px-1 font-mono text-[10px] uppercase tracking-[0.08em] text-warn">
          ⓘ Internal note · only your team sees this
        </span>
      </div>
    );
  }
  const base =
    "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-[1.45] whitespace-pre-wrap break-words";
  if (role === "operator") {
    return (
      <div className="flex max-w-[78%] flex-col items-end self-end gap-1">
        <div className={cn(base, "max-w-full rounded-tr-[4px] bg-ink text-paper")}>
          {body}
        </div>
        {emailDelivery ? <EmailDeliveryStatus d={emailDelivery} /> : null}
      </div>
    );
  }
  if (role === "atlas") {
    return (
      <div className="flex max-w-[78%] flex-col items-start self-start gap-1">
        <div
          className={cn(
            base,
            "max-w-full rounded-tl-[4px] border border-accent/30 bg-accent-soft",
          )}
        >
          {body}
        </div>
        {emailDelivery ? <EmailDeliveryStatus d={emailDelivery} /> : null}
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

function AtlasSuggestionPanel({
  conversationId,
  sessionToken,
}: {
  conversationId: Id<"conversations">;
  sessionToken: string;
}) {
  const run = useQuery(api.atlas.latestRun, { sessionToken, conversationId });
  const accept = useMutation(api.atlas.acceptSuggestion);
  const dismiss = useMutation(api.atlas.dismissSuggestion);
  const [busy, setBusy] = useState(false);

  if (!run) return null;

  if (run.status === "skipped_no_config") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-rule bg-paper-2/40 px-5 py-2 text-[12px]">
        <span className="text-muted">
          Atlas isn't configured yet — visitors won't get AI replies until you
          add a key.
        </span>
        <a
          href="/app/atlas"
          className="font-medium text-ink underline-offset-2 hover:underline"
        >
          Configure →
        </a>
      </div>
    );
  }

  if (run.status === "drafted" && run.reply) {
    const onAccept = async () => {
      setBusy(true);
      try {
        await accept({ sessionToken, runId: run._id });
      } finally {
        setBusy(false);
      }
    };
    const onDismiss = async () => {
      setBusy(true);
      try {
        await dismiss({ sessionToken, runId: run._id });
      } finally {
        setBusy(false);
      }
    };
    const pct = run.confidence ? Math.round(run.confidence * 100) : null;
    return (
      <div className="border-t border-rule bg-accent-soft/40 px-5 py-3">
        <div className="mb-1 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          <span>✦ Atlas suggests</span>
          {pct !== null ? <span className="text-ink/70">{pct}% confident</span> : null}
        </div>
        <div className="text-[14px] leading-[1.5] text-ink">{run.reply}</div>
        {run.reasoning ? (
          <div className="mt-1 text-[11px] italic text-muted">
            why: {run.reasoning}
          </div>
        ) : null}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-full bg-ink px-3 text-[12px] font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
          >
            Use this reply
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={busy}
            className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (run.status === "auto_replied") {
    const pct = run.confidence ? Math.round(run.confidence * 100) : null;
    return (
      <div className="flex items-center gap-2 border-t border-rule bg-good/10 px-5 py-2 text-[12px] text-good">
        <span>✦ Atlas auto-replied</span>
        {pct !== null ? (
          <span className="text-good/70">· {pct}% confident</span>
        ) : null}
      </div>
    );
  }

  if (run.status === "failed") {
    return (
      <div className="border-t border-rule bg-warn/10 px-5 py-2 font-mono text-[11px] text-warn">
        Atlas error: {run.error ?? "unknown"}
      </div>
    );
  }

  return null;
}

function ChannelGlyph({ channel }: { channel: Channel }) {
  const map: Record<Channel, { icon: string; label: string; color: string }> = {
    web_chat: { icon: "💬", label: "Web chat", color: "text-ink/70" },
    email: { icon: "✉", label: "Email", color: "text-accent-deep" },
    whatsapp: { icon: "🟢", label: "WhatsApp", color: "text-good" },
    voice: { icon: "📞", label: "Voice", color: "text-warn" },
  };
  const info = map[channel];
  return (
    <span
      title={info.label}
      aria-label={info.label}
      className={cn(
        "inline-flex size-4 shrink-0 items-center justify-center text-[11px]",
        info.color,
      )}
    >
      {info.icon}
    </span>
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

function SaveAsLeadButton({
  conversationId,
  visitor,
  sessionToken,
}: {
  conversationId: Id<"conversations">;
  visitor: {
    name?: string;
    email?: string;
    phone?: string;
  } | null | undefined;
  sessionToken: string;
}) {
  const existing = useQuery(api.leads.findByConversation, {
    sessionToken,
    conversationId,
  });
  const createLead = useMutation(api.leads.create);

  const [open, setOpen] = useState(false);
  const [name, setName] = useState(visitor?.name ?? "");
  const [email, setEmail] = useState(visitor?.email ?? "");
  const [phone, setPhone] = useState(visitor?.phone ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When the modal opens fresh, prefill from the latest visitor data.
  const openModal = () => {
    setName(visitor?.name ?? "");
    setEmail(visitor?.email ?? "");
    setPhone(visitor?.phone ?? "");
    setNotes("");
    setError(null);
    setOpen(true);
  };

  if (existing) {
    return (
      <a
        href="/app/leads"
        className="inline-flex h-7 items-center rounded-full border border-good px-3 text-[11px] font-medium text-good transition hover:-translate-y-px"
      >
        ✓ Saved as lead
      </a>
    );
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createLead({
        sessionToken,
        conversationId,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save lead.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex h-7 items-center rounded-full bg-ink px-3 text-[11px] font-medium text-paper transition hover:-translate-y-px"
      >
        Save as Lead
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Close"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => !busy && setOpen(false)}
          />
          <div className="relative w-full max-w-[440px] rounded-2xl bg-paper p-6 shadow-2xl">
            <header className="mb-4">
              <h3 className="text-lg font-semibold tracking-[-0.01em]">
                Save as Lead
              </h3>
              <p className="mt-1 text-[12px] text-muted">
                Capture this visitor's details for follow-up. They'll show up
                in <a href="/app/leads" className="underline-offset-2 hover:underline">/app/leads</a>.
              </p>
            </header>

            <form onSubmit={onSubmit} className="flex flex-col gap-3">
              <Field label="Name" required>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="h-10 w-full rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 w-full rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 w-full rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                />
              </Field>
              <Field label="Notes">
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="What did they want? Next steps?"
                  className="w-full resize-none rounded-lg border border-rule-2 bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
                />
              </Field>

              {error ? (
                <p className="text-[12px] text-warn">{error}</p>
              ) : null}

              <div className="mt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
                >
                  {busy ? "Saving…" : "Save lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
        {label}
        {required ? <span className="ml-1 text-warn">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function EmailDeliveryStatus({ d }: { d: EmailDelivery }) {
  const map: Record<
    EmailDelivery["status"],
    { label: string; className: string }
  > = {
    pending: {
      label: "✉ sending…",
      className: "text-muted",
    },
    retrying: {
      label: `✉ retrying (attempt ${d.attempts})`,
      className: "text-warn",
    },
    delivered: {
      label: "✉ delivered",
      className: "text-good",
    },
    failed: {
      label: `✉ failed${d.attempts > 1 ? ` after ${d.attempts} attempts` : ""}`,
      className: "text-warn",
    },
  };
  const info = map[d.status];
  return (
    <div
      className={cn(
        "px-1 font-mono text-[10px] uppercase tracking-[0.06em]",
        info.className,
      )}
      title={d.error ?? undefined}
    >
      {info.label}
    </div>
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

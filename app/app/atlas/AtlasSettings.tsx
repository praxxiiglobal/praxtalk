"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";

const MODELS = [
  { value: "claude-haiku-4-5-20251001", label: "Haiku 4.5 (fast, cheap)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 (most capable)" },
];

const DEFAULT_PROMPT = `You are Atlas, the AI agent for the brand. Reply directly, briefly, and warmly — like a senior teammate who knows the product. If you genuinely don't know, say so and indicate the conversation should go to a human. Never invent product details, prices, policies, or commitments. Keep replies under 4 sentences unless the customer's question requires more.`;

export function AtlasSettings() {
  const { sessionToken, operator } = useDashboardAuth();
  const config = useQuery(api.atlas.getConfig, { sessionToken });
  const upsert = useMutation(api.atlas.upsertConfig);

  const canManage = operator.role !== "agent";

  const [enabled, setEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(MODELS[0].value);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_PROMPT);
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [voyageApiKey, setVoyageApiKey] = useState("");
  const [autoReplyThreshold, setAutoReplyThreshold] = useState(0.8);
  const [maxTokens, setMaxTokens] = useState(512);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!config) return;
    setEnabled(config.enabled);
    setModel(config.model);
    setSystemPrompt(config.systemPrompt);
    setKnowledgeBase(config.knowledgeBase ?? "");
    setAutoReplyThreshold(config.autoReplyThreshold);
    setMaxTokens(config.maxTokens);
  }, [config]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      await upsert({
        sessionToken,
        enabled,
        apiKey: apiKey.trim() || undefined,
        model,
        systemPrompt,
        knowledgeBase: knowledgeBase.trim() || undefined,
        voyageApiKey: voyageApiKey.trim() || undefined,
        autoReplyThreshold,
        maxTokens,
      });
      setApiKey("");
      setVoyageApiKey("");
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const isConfigured = config?.hasApiKey;

  return (
    <>
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-base font-semibold text-ink">
              {isConfigured && enabled ? "Atlas is live" : "Atlas is off"}
              <span
                className={
                  "rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] " +
                  (isConfigured && enabled
                    ? "bg-good/15 text-good"
                    : "bg-paper-2 text-muted")
                }
              >
                {isConfigured && enabled ? "ON" : "OFF"}
              </span>
            </div>
            <p className="mt-1 max-w-[60ch] text-sm leading-[1.55] text-muted">
              {isConfigured
                ? enabled
                  ? "Every visitor message triggers an Atlas evaluation. Replies above the threshold auto-send; below it, they appear as drafts in the inbox."
                  : "Configured but disabled. Visitor messages flow straight into the inbox without an AI pass."
                : "No API key yet. Configure one below to start drafting replies."}
            </p>
          </div>
        </div>
      </Card>

      {canManage ? (
        <Card title="Configuration">
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="size-4 accent-ink"
              />
              <span className="text-sm font-medium text-ink">
                Enable Atlas for this workspace
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                Anthropic API key{" "}
                {isConfigured ? "(stored — leave blank to keep current)" : ""}
              </span>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  isConfigured ? "Stored — leave blank to keep" : "sk-ant-…"
                }
                className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
              />
              <span className="text-[11px] text-muted">
                Get one at{" "}
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink underline-offset-2 hover:underline"
                >
                  console.anthropic.com
                </a>
                . Stored encrypted at rest; never round-tripped to your browser
                after save.
              </span>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Model
                </span>
                <select
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                >
                  {MODELS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Auto-reply threshold ({autoReplyThreshold.toFixed(2)})
                </span>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={autoReplyThreshold}
                  onChange={(e) =>
                    setAutoReplyThreshold(Number(e.target.value))
                  }
                  className="accent-ink"
                />
                <span className="text-[11px] text-muted">
                  Replies at or above this confidence auto-send. Below it,
                  Atlas saves a draft for an operator to review.
                </span>
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                Max tokens per reply
              </span>
              <input
                type="number"
                min={64}
                max={4096}
                value={maxTokens}
                onChange={(e) =>
                  setMaxTokens(Math.max(64, Math.min(4096, Number(e.target.value))))
                }
                className="h-10 w-32 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                System prompt (brand voice + business rules)
              </span>
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                rows={6}
                className="resize-y rounded-lg border border-rule-2 bg-paper p-3 font-mono text-[12.5px] leading-[1.55] outline-none focus:border-ink"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                Knowledge base (optional)
              </span>
              <textarea
                value={knowledgeBase}
                onChange={(e) => setKnowledgeBase(e.target.value)}
                rows={6}
                placeholder="Paste FAQ entries, product details, pricing — anything Atlas should cite."
                className="resize-y rounded-lg border border-rule-2 bg-paper p-3 font-mono text-[12.5px] leading-[1.55] outline-none focus:border-ink"
              />
              <span className="text-[11px] text-muted">
                {config?.hasVoyageKey
                  ? `Vector retrieval is on. ${config.chunkCount ?? 0} chunk${
                      (config.chunkCount ?? 0) === 1 ? "" : "s"
                    } indexed (v${config.knowledgeBaseVersion ?? 0}). The KB is re-embedded automatically when you save changes here.`
                  : "Plain text injected as-is into the system prompt. Add a Voyage AI key below to switch to vector retrieval (better for large KBs)."}
              </span>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                Voyage AI key (optional — enables RAG)
                {config?.hasVoyageKey ? (
                  <span className="ml-2 normal-case text-good">
                    configured ({config.voyageKeyPreview})
                  </span>
                ) : null}
              </span>
              <input
                type="text"
                value={voyageApiKey}
                onChange={(e) => setVoyageApiKey(e.target.value)}
                placeholder={
                  config?.hasVoyageKey
                    ? "Stored — leave blank to keep"
                    : "pa-… (from voyageai.com)"
                }
                className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
              />
              <span className="text-[11px] text-muted">
                When set, the KB is chunked + embedded with{" "}
                <code className="font-mono">voyage-3-lite</code> on save, and
                Atlas retrieves the top 4 most relevant chunks per visitor
                message instead of injecting the whole KB. Voyage is
                Anthropic&apos;s recommended embeddings partner.
              </span>
            </label>

            {error ? <p className="text-[12px] text-warn">{error}</p> : null}
            {saved ? (
              <p className="text-[12px] text-good">Saved ✓</p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
              >
                {busy ? "Saving…" : isConfigured ? "Save changes" : "Connect Atlas"}
              </button>
            </div>
          </form>
        </Card>
      ) : (
        <Card>
          <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
            Ask an admin to configure Atlas.
          </div>
        </Card>
      )}
    </>
  );
}

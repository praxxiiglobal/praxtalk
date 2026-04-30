"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "ar", label: "Arabic" },
  { code: "es", label: "Spanish" },
  { code: "fr", label: "French" },
  { code: "pt_BR", label: "Portuguese (BR)" },
];

export function WhatsappTemplatesSection() {
  const { sessionToken, operator } = useDashboardAuth();
  const integration = useQuery(api.whatsappIntegrations.get, { sessionToken });
  const templates = useQuery(api.whatsappIntegrations.listTemplates, {
    sessionToken,
  });
  const addTemplate = useMutation(api.whatsappIntegrations.addTemplate);
  const removeTemplate = useMutation(
    api.whatsappIntegrations.removeTemplate,
  );

  const canManage = operator.role !== "agent";
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("en");
  const [category, setCategory] = useState("utility");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await addTemplate({
        sessionToken,
        name: name.trim(),
        language: language.trim(),
        category,
        body: body.trim(),
      });
      setName("");
      setBody("");
      setAdding(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (id: Id<"whatsappTemplates">, templateName: string) => {
    if (!confirm(`Remove template "${templateName}"?`)) return;
    await removeTemplate({ sessionToken, templateId: id });
  };

  // Don't show the templates section if there's no WhatsApp integration
  // configured at all — there's nothing to send templates from.
  if (!integration) return null;

  return (
    <Card
      title="WhatsApp templates"
      description="Templates approved on the Meta side (Business Manager → Message Templates) — required for messages outside the 24h customer-service window. Add the name + language + body preview here so operators can pick them from the inbox."
    >
      {templates === undefined ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : templates.length === 0 ? (
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          No templates yet. Approve one in Meta Business Manager, then mirror
          it here so operators can use it.
        </div>
      ) : (
        <ul className="divide-y divide-rule">
          {templates.map((t) => (
            <li key={t._id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-mono text-[13px] text-ink">
                    {t.name}
                  </span>
                  <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                    {t.language}
                  </span>
                  {t.category ? (
                    <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                      {t.category}
                    </span>
                  ) : null}
                  <span className="rounded-full border border-rule-2 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                    {t.variableCount} {t.variableCount === 1 ? "var" : "vars"}
                  </span>
                </div>
                <pre className="mt-1.5 whitespace-pre-wrap break-words rounded-lg border border-rule bg-paper-2/40 p-2 font-mono text-[12px] text-ink">
                  {t.body}
                </pre>
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => onRemove(t._id, t.name)}
                  className="inline-flex h-8 shrink-0 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium text-warn transition hover:-translate-y-px"
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <div className="mt-5 border-t border-rule pt-5">
          {adding ? (
            <form onSubmit={onSave} className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Template name (must match Meta exactly)
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="appointment_reminder"
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 font-mono text-[13px] outline-none focus:border-ink"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Language
                </span>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label} ({l.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Category
                </span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
                >
                  <option value="utility">Utility</option>
                  <option value="marketing">Marketing</option>
                  <option value="authentication">Authentication</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Body preview (use {"{{1}}"}, {"{{2}}"}, … for variables)
                </span>
                <textarea
                  required
                  rows={4}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Hi {{1}}, your appointment is on {{2}} at {{3}}."
                  className="rounded-lg border border-rule-2 bg-paper p-3 font-mono text-[12.5px] outline-none focus:border-ink"
                />
                <span className="text-[11px] text-muted">
                  This is what operators see when picking the template. The
                  actual approved content lives on Meta — keep this in sync.
                </span>
              </label>
              {error ? (
                <p className="sm:col-span-2 text-[12px] text-warn">{error}</p>
              ) : null}
              <div className="flex items-center justify-end gap-2 sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setAdding(false)}
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
                  {busy ? "Saving…" : "Add template"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
            >
              + Add template
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

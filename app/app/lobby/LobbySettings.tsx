"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";
import { cn } from "@/lib/cn";

type FieldType = "text" | "textarea" | "select" | "email" | "phone";
type Field = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  placeholder?: string;
};

const STARTER_FIELDS: Field[] = [
  {
    id: "topic",
    label: "What can we help with?",
    type: "select",
    required: true,
    options: ["Sales", "Support", "Billing", "Other"],
  },
  {
    id: "urgency",
    label: "How urgent is this?",
    type: "select",
    required: false,
    options: ["Low", "Medium", "High"],
  },
];

export function LobbySettings() {
  const { sessionToken, operator } = useDashboardAuth();
  const configs = useQuery(api.lobby.list, { sessionToken });
  const brands = useQuery(api.brands.listMine, { sessionToken });
  const upsert = useMutation(api.lobby.upsert);
  const remove = useMutation(api.lobby.remove);

  const canManage = operator.role !== "agent";

  // Selected scope: "all" = workspace default, otherwise a brand id.
  const [scope, setScope] = useState<"all" | string>("all");
  const [enabled, setEnabled] = useState(true);
  const [title, setTitle] = useState("Help us route you");
  const [json, setJson] = useState<string>(
    JSON.stringify(STARTER_FIELDS, null, 2),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Sync editor state when scope changes or configs reload.
  useEffect(() => {
    if (!configs) return;
    const match = configs.find((c) =>
      scope === "all" ? c.brandId === null : c.brandId === scope,
    );
    if (match) {
      setEnabled(match.enabled);
      setTitle(match.title);
      setJson(JSON.stringify(match.fields, null, 2));
    } else {
      setEnabled(true);
      setTitle("Help us route you");
      setJson(JSON.stringify(STARTER_FIELDS, null, 2));
    }
    setError(null);
  }, [scope, configs]);

  const onSave = async () => {
    setBusy(true);
    setError(null);
    let parsed: Field[];
    try {
      parsed = JSON.parse(json);
      if (!Array.isArray(parsed)) {
        throw new Error("Fields must be a JSON array.");
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? `Invalid JSON: ${e.message}`
          : "Invalid JSON.",
      );
      setBusy(false);
      return;
    }
    try {
      await upsert({
        sessionToken,
        brandId:
          scope === "all" ? undefined : (scope as unknown as Id<"brands">),
        enabled,
        title,
        fields: parsed,
      });
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!configs) return;
    const match = configs.find((c) =>
      scope === "all" ? c.brandId === null : c.brandId === scope,
    );
    if (!match) return;
    if (
      !confirm(
        scope === "all"
          ? "Delete the workspace-default lobby? Brands without their own config will fall back to no lobby."
          : "Delete this brand's lobby override? It'll inherit the workspace default.",
      )
    ) {
      return;
    }
    await remove({ sessionToken, configId: match._id });
  };

  if (!canManage) {
    return (
      <Card title="Lobby intake">
        <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
          Only admins and owners can configure the lobby.
        </div>
      </Card>
    );
  }

  return (
    <>
      <Card
        title="Scope"
        description="Set a workspace-wide default, or override per brand. Brand-specific configs win when both exist."
      >
        <select
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
        >
          <option value="all">Workspace default (all brands)</option>
          {(brands ?? []).map((b) => (
            <option key={b._id} value={b._id}>
              {b.name} — brand override
            </option>
          ))}
        </select>
      </Card>

      <Card
        title="Form"
        description="Title shown above the form, plus the fields. Field IDs are stable identifiers — keep them lowercase + alphanumeric. Field types: text, textarea, select (needs options), email, phone."
      >
        <div className="grid gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4"
            />
            Enabled — render this form in the widget
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Title
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Help us route you"
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Fields (JSON array)
            </span>
            <textarea
              value={json}
              onChange={(e) => setJson(e.target.value)}
              rows={16}
              spellCheck={false}
              className="rounded-lg border border-rule-2 bg-paper p-3 font-mono text-[12.5px] leading-[1.5] text-ink outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">
              Each field needs:{" "}
              <code className="font-mono">
                id, label, type, required
              </code>
              . Selects also need <code className="font-mono">options</code>.
              Optional: <code className="font-mono">placeholder</code>.
            </span>
          </label>

          {error ? (
            <p className="text-[12px] text-warn">{error}</p>
          ) : savedAt ? (
            <p className="text-[12px] text-good">Saved.</p>
          ) : null}

          <div className="flex items-center justify-between">
            {configs?.some((c) =>
              scope === "all" ? c.brandId === null : c.brandId === scope,
            ) ? (
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium text-warn"
              >
                Delete this scope
              </button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={onSave}
              disabled={busy}
              className={cn(
                "inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60",
              )}
            >
              {busy ? "Saving…" : "Save lobby"}
            </button>
          </div>
        </div>
      </Card>
    </>
  );
}

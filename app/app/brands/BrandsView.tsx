"use client";

import { useMutation, useQuery } from "convex/react";
import { useState, type FormEvent } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";

type Brand = {
  _id: Id<"brands">;
  slug: string;
  name: string;
  widgetId: string;
  primaryColor: string;
  welcomeMessage: string;
  position: "br" | "bl";
  avatarUrl?: string;
  bubbleIcon?: "logo" | "glyph";
  launcherSize?: number;
  launcherText?: string;
  askIdentityInChat?: boolean;
};

// Launcher-size slider bounds (px). Mirror of LAUNCHER_SIZE_MIN/MAX in
// convex/brands.ts (the server re-clamps, so these stay purely UI).
const LAUNCHER_SIZE_MIN = 48;
const LAUNCHER_SIZE_MAX = 88;
const LAUNCHER_SIZE_DEFAULT = 64;
// Mirror of LAUNCHER_TEXT_MAX in convex/brands.ts.
const LAUNCHER_TEXT_MAX = 20;
const LAUNCHER_TEXT_DEFAULT = "Talk to us";

export function BrandsView() {
  const { sessionToken, operator } = useDashboardAuth();
  const brands = useQuery(api.brands.listMine, { sessionToken });
  const createBrand = useMutation(api.brands.create);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage = operator.role !== "agent";

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await createBrand({ sessionToken, name: name.trim() });
      setName("");
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create brand.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card
        title="Brands"
        description="Each brand has its own widget snippet, theming, and welcome message. Conversations are tagged with the brand they came from."
      >
        {brands === undefined ? (
          <div className="text-sm text-muted">Loading…</div>
        ) : brands.length === 0 ? (
          <div className="rounded-xl border border-dashed border-rule p-6 text-center text-sm text-muted">
            No brands yet. Create your first one below.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {brands.map((b) => (
              <BrandRow key={b._id} brand={b as Brand} canManage={canManage} />
            ))}
          </ul>
        )}
      </Card>

      {canManage && (
        <Card
          title="Add a brand"
          description="Pick a name and we'll generate a fresh widget snippet for you."
        >
          {creating ? (
            <form onSubmit={onCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex flex-1 flex-col gap-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
                  Brand name
                </span>
                <input
                  type="text"
                  required
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Acme Pets"
                  className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm text-ink outline-none focus:border-ink"
                />
              </label>
              <div className="flex gap-2 sm:self-end">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setName("");
                    setError(null);
                  }}
                  disabled={busy}
                  className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
                >
                  {busy ? "Creating…" : "Create brand"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex h-10 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
            >
              + Add a brand
            </button>
          )}
          {error ? (
            <p className="mt-3 text-[12px] text-warn">{error}</p>
          ) : null}
        </Card>
      )}
    </>
  );
}

function BrandRow({ brand, canManage }: { brand: Brand; canManage: boolean }) {
  const { sessionToken } = useDashboardAuth();
  const update = useMutation(api.brands.update);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(brand.name);
  const [primaryColor, setPrimaryColor] = useState(brand.primaryColor);
  const [welcomeMessage, setWelcomeMessage] = useState(brand.welcomeMessage);
  const [position, setPosition] = useState<"br" | "bl">(brand.position);
  const [logoUrl, setLogoUrl] = useState(brand.avatarUrl ?? "");
  const [bubbleIcon, setBubbleIcon] = useState<"logo" | "glyph">(
    brand.bubbleIcon ?? "logo",
  );
  const [launcherSize, setLauncherSize] = useState<number>(
    brand.launcherSize ?? LAUNCHER_SIZE_DEFAULT,
  );
  const [launcherText, setLauncherText] = useState<string>(
    brand.launcherText ?? "",
  );
  // Default-on: when the brand row has no value yet, treat as enabled.
  const [askIdentityInChat, setAskIdentityInChat] = useState<boolean>(
    brand.askIdentityInChat ?? true,
  );
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://www.praxtalk.com";
  const snippet = `<script src="${origin}/widget.js" data-widget-id="${brand.widgetId}" defer></script>`;

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const onSave = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await update({
        sessionToken,
        brandId: brand._id,
        name,
        primaryColor,
        welcomeMessage,
        position,
        avatarUrl: logoUrl,
        bubbleIcon,
        launcherSize,
        launcherText,
        askIdentityInChat,
      });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-xl border border-rule bg-paper-2/40 p-4">
      <div className="flex items-start gap-4">
        <div
          className="grid size-12 shrink-0 place-items-center rounded-xl text-base font-semibold text-paper"
          style={{ backgroundColor: brand.primaryColor }}
        >
          {brand.name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-base font-medium text-ink">
              {brand.name}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              /{brand.slug}
            </span>
          </div>
          <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
            widget {brand.widgetId}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={onCopy}
            className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium transition hover:-translate-y-px"
          >
            {copied ? "Copied ✓" : "Copy snippet"}
          </button>
          {canManage && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              className="inline-flex h-8 items-center rounded-full border border-rule-2 px-3 text-[12px] font-medium transition hover:-translate-y-px"
            >
              {editing ? "Close" : "Edit"}
            </button>
          )}
        </div>
      </div>

      <pre className="mt-3 overflow-x-auto rounded-lg border border-rule bg-paper px-3 py-2 font-mono text-[12px] leading-[1.5] text-ink">
        {snippet}
      </pre>

      {editing && canManage && (
        <form onSubmit={onSave} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Name
            </span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Primary color
            </span>
            <div className="flex h-10 items-center gap-2 rounded-lg border border-rule-2 bg-paper px-2">
              <input
                type="color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-7 w-10 cursor-pointer rounded border-0 bg-transparent p-0"
              />
              <input
                type="text"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-7 flex-1 bg-transparent font-mono text-[12px] outline-none"
              />
            </div>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Logo URL
            </span>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={logoUrl}
                onChange={(e) => setLogoUrl(e.target.value)}
                placeholder="https://yoursite.com/logo.png"
                className="h-10 min-w-0 flex-1 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
              />
              {logoUrl.trim() !== "" && (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: primaryColor }}
                  title="Bubble preview"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={logoUrl.trim()}
                    alt=""
                    className="h-8 w-8 rounded-full bg-white object-contain p-0.5"
                    onError={(e) => {
                      e.currentTarget.style.visibility = "hidden";
                    }}
                    onLoad={(e) => {
                      e.currentTarget.style.visibility = "visible";
                    }}
                  />
                </span>
              )}
            </div>
            <span className="text-[11px] text-muted">
              Shown on the chat bubble, panel header, and beside agent
              replies. Leave empty for the default chat icon.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Bubble icon
            </span>
            <select
              value={bubbleIcon}
              onChange={(e) =>
                setBubbleIcon(e.target.value as "logo" | "glyph")
              }
              disabled={logoUrl.trim() === ""}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink disabled:opacity-50"
            >
              <option value="logo">Brand logo</option>
              <option value="glyph">Classic chat icon</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              <span>Launcher size</span>
              <span className="tabular-nums text-ink">{launcherSize}px</span>
            </span>
            <input
              type="range"
              min={LAUNCHER_SIZE_MIN}
              max={LAUNCHER_SIZE_MAX}
              step={2}
              value={launcherSize}
              onChange={(e) => setLauncherSize(Number(e.target.value))}
              style={{ accentColor: primaryColor }}
              className="h-10 w-full cursor-pointer"
              aria-label="Launcher bubble size in pixels"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Launcher text
            </span>
            <input
              type="text"
              value={launcherText}
              onChange={(e) => setLauncherText(e.target.value)}
              maxLength={LAUNCHER_TEXT_MAX}
              placeholder={LAUNCHER_TEXT_DEFAULT}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
            <span className="text-[11px] text-muted">
              Curves over the bubble. Leave blank for “{LAUNCHER_TEXT_DEFAULT}”.
            </span>
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Welcome message
            </span>
            <input
              type="text"
              value={welcomeMessage}
              onChange={(e) => setWelcomeMessage(e.target.value)}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
              Position
            </span>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value as "br" | "bl")}
              className="h-10 rounded-lg border border-rule-2 bg-paper px-3 text-sm outline-none focus:border-ink"
            >
              <option value="br">Bottom right</option>
              <option value="bl">Bottom left</option>
            </select>
          </label>
          <label className="flex items-start gap-2 sm:col-span-2 rounded-lg border border-rule-2 bg-paper p-3">
            <input
              type="checkbox"
              checked={askIdentityInChat}
              onChange={(e) => setAskIdentityInChat(e.target.checked)}
              className="mt-0.5 h-4 w-4"
            />
            <span className="flex flex-col gap-0.5 text-sm">
              <span className="font-medium text-ink">
                Ask for visitor identity in chat
              </span>
              <span className="text-[12px] leading-[1.4] text-muted">
                After the visitor sends their first message, drop in a card
                asking for name + email + phone (all optional, dismissable).
                Turn off for fully anonymous chat.
              </span>
            </span>
          </label>
          <div className="flex items-end justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              onClick={() => setEditing(false)}
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
              {busy ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      )}
    </li>
  );
}

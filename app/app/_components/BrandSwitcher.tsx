"use client";

import { useQuery } from "convex/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "./DashboardShell";
import { cn } from "@/lib/cn";

/**
 * Dropdown that filters the dashboard to a single brand. Writes to the
 * URL (`?brand=<id>`) so the selection persists across refreshes and is
 * shareable. Renders nothing until brands load — the empty state is
 * uglier than the half-second spinner.
 */
export function BrandSwitcher({
  variant = "topbar",
}: {
  variant?: "topbar" | "drawer";
}) {
  const { sessionToken } = useDashboardAuth();
  const brands = useQuery(api.brands.listMine, { sessionToken });
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("brand") ?? "all";

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const setBrand = (next: "all" | Id<"brands">) => {
    const sp = new URLSearchParams(params.toString());
    if (next === "all") sp.delete("brand");
    else sp.set("brand", next as string);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  };

  if (!brands || brands.length === 0) return null;

  const active =
    selected === "all"
      ? null
      : brands.find((b) => (b._id as string) === selected) ?? null;

  // The drawer variant renders inline (no popover) for the mobile menu,
  // so it shows full-width buttons instead of a click-to-open dropdown.
  if (variant === "drawer") {
    return (
      <div className="rounded-xl border border-rule bg-paper-2/40 p-3">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-muted">
          Brand filter
        </div>
        <div className="flex flex-col gap-1">
          <BrandOption
            active={selected === "all"}
            onClick={() => setBrand("all")}
            label="All brands"
          />
          {brands.map((b) => (
            <BrandOption
              key={b._id}
              active={selected === b._id}
              onClick={() => setBrand(b._id)}
              color={b.primaryColor}
              label={b.name}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-8 items-center gap-2 rounded-full border border-rule-2 bg-paper px-3 text-[12px] font-medium text-ink transition hover:-translate-y-px"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {active ? (
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: active.primaryColor }}
            aria-hidden
          />
        ) : (
          <span className="size-2 rounded-full bg-rule-2" aria-hidden />
        )}
        <span className="max-w-[140px] truncate">
          {active ? active.name : "All brands"}
        </span>
        <span className="text-[9px] opacity-60" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          role="listbox"
          className="absolute left-0 top-full z-30 mt-2 w-56 overflow-hidden rounded-xl border border-rule bg-paper p-1 shadow-2xl"
        >
          <BrandOption
            active={selected === "all"}
            onClick={() => setBrand("all")}
            label="All brands"
          />
          <div className="my-1 h-px bg-rule" />
          {brands.map((b) => (
            <BrandOption
              key={b._id}
              active={selected === b._id}
              onClick={() => setBrand(b._id)}
              color={b.primaryColor}
              label={b.name}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function BrandOption({
  active,
  onClick,
  label,
  color,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
        active ? "bg-ink text-paper" : "text-ink hover:bg-paper-2",
      )}
    >
      <span
        className={cn(
          "size-2 shrink-0 rounded-full",
          color ? "" : active ? "bg-paper" : "bg-rule-2",
        )}
        style={color ? { backgroundColor: color } : undefined}
        aria-hidden
      />
      <span className="flex-1 truncate">{label}</span>
      {active ? (
        <span className="text-[11px]" aria-hidden>
          ✓
        </span>
      ) : null}
    </button>
  );
}

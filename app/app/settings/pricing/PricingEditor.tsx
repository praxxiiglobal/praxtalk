"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "../../_components/DashboardShell";
import { Card } from "../../_components/PageHeader";

type PlanKey = "spark" | "team" | "scale" | "enterprise";

type Override = {
  planKey: PlanKey;
  name: string | null;
  price: string | null;
  priceSub: string | null;
  lede: string | null;
  features: string[] | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  ribbon: string | null;
  updatedAt: number | null;
};

const PLAN_LABELS: Record<PlanKey, { defaultName: string; defaultPrice: string }> = {
  spark: { defaultName: "Spark", defaultPrice: "$0" },
  team: { defaultName: "Team", defaultPrice: "$29" },
  scale: { defaultName: "Scale", defaultPrice: "$89" },
  enterprise: { defaultName: "Enterprise", defaultPrice: "Custom" },
};

export function PricingEditor() {
  const { sessionToken, operator } = useDashboardAuth();
  const overrides = useQuery(api.pricing.getForAdmin, { sessionToken });

  if (operator.role === "agent") {
    return (
      <Card>
        <p className="text-sm text-muted">
          Owners and admins only.
        </p>
      </Card>
    );
  }
  if (overrides === undefined) {
    return (
      <Card>
        <p className="text-sm text-muted">Loading…</p>
      </Card>
    );
  }

  return (
    <>
      <Card title="How this works">
        <div className="prose prose-sm max-w-none text-[13.5px] leading-[1.6] text-ink">
          <p>
            Each field below <strong>overrides</strong> the hardcoded
            default in the marketing site. Leave a field blank to fall
            back to the default. Edits are live within ~10 seconds of
            saving (no redeploy needed).
          </p>
          <p className="rounded-xl border border-warn/40 bg-warn/10 px-3 py-2">
            <strong>⚠ Display only.</strong> Changing the displayed
            price here does <strong>not</strong> change what new
            subscribers are billed on PayPal or Razorpay — those plan
            prices are locked at create-time via{" "}
            <code>scripts/setup-paypal-plans.mjs</code> /{" "}
            <code>scripts/setup-razorpay-plans.mjs</code>. To actually
            change billing, mint a new plan + update the env var.
            Existing subscribers keep their old price either way (both
            providers price-lock at subscription create-time).
          </p>
        </div>
      </Card>

      {(["spark", "team", "scale", "enterprise"] as const).map((key) => {
        const o = overrides.find((x) => x.planKey === key);
        return <PlanForm key={key} planKey={key} initial={o ?? null} />;
      })}
    </>
  );
}

function PlanForm({
  planKey,
  initial,
}: {
  planKey: PlanKey;
  initial: Override | null;
}) {
  const { sessionToken } = useDashboardAuth();
  const update = useMutation(api.pricing.updatePlan);
  const labels = PLAN_LABELS[planKey];

  const [name, setName] = useState(initial?.name ?? "");
  const [price, setPrice] = useState(initial?.price ?? "");
  const [priceSub, setPriceSub] = useState(initial?.priceSub ?? "");
  const [lede, setLede] = useState(initial?.lede ?? "");
  const [features, setFeatures] = useState(
    (initial?.features ?? []).join("\n"),
  );
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? "");
  const [ctaHref, setCtaHref] = useState(initial?.ctaHref ?? "");
  const [ribbon, setRibbon] = useState(initial?.ribbon ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initial) return;
    setName(initial.name ?? "");
    setPrice(initial.price ?? "");
    setPriceSub(initial.priceSub ?? "");
    setLede(initial.lede ?? "");
    setFeatures((initial.features ?? []).join("\n"));
    setCtaLabel(initial.ctaLabel ?? "");
    setCtaHref(initial.ctaHref ?? "");
    setRibbon(initial.ribbon ?? "");
  }, [initial?.updatedAt]);

  const onSave = async () => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await update({
        sessionToken,
        planKey,
        name: name || undefined,
        price: price || undefined,
        priceSub: priceSub || undefined,
        lede: lede || undefined,
        features: features
          .split("\n")
          .map((f) => f.trim())
          .filter((f) => f.length > 0),
        ctaLabel: ctaLabel || undefined,
        ctaHref: ctaHref || undefined,
        ribbon: ribbon || undefined,
      });
      setMsg("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title={`Tier · ${labels.defaultName}`}
      description={`Default: ${labels.defaultPrice}. Leave fields blank to keep the default.`}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Tier name" value={name} onChange={setName} placeholder={labels.defaultName} />
        <Field label="Price" value={price} onChange={setPrice} placeholder={labels.defaultPrice} />
        <Field label="Price suffix" value={priceSub} onChange={setPriceSub} placeholder="/seat / mo" />
        <Field label="Ribbon (e.g. Most popular)" value={ribbon} onChange={setRibbon} />
        <div className="sm:col-span-2">
          <Label>Lede (one sentence)</Label>
          <textarea
            value={lede}
            onChange={(e) => setLede(e.target.value)}
            rows={2}
            className="w-full rounded-xl border border-rule-2 bg-paper px-3 py-2 text-[13px] outline-none focus:border-ink"
          />
        </div>
        <div className="sm:col-span-2">
          <Label>Feature bullets (one per line)</Label>
          <textarea
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-rule-2 bg-paper px-3 py-2 font-mono text-[12.5px] leading-[1.55] outline-none focus:border-ink"
          />
        </div>
        <Field label="CTA label" value={ctaLabel} onChange={setCtaLabel} />
        <Field label="CTA URL" value={ctaHref} onChange={setCtaHref} />
      </div>

      {error && <p className="mt-3 text-[12px] text-warn">{error}</p>}
      {msg && <p className="mt-3 text-[12px] text-good">{msg}</p>}

      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-[10.5px] text-muted">
          {initial?.updatedAt
            ? `Last edited ${new Date(initial.updatedAt).toLocaleString()}`
            : "Never overridden — using default"}
        </span>
        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Card>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-xl border border-rule-2 bg-paper px-3 text-[13px] outline-none focus:border-ink"
      />
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
      {children}
    </div>
  );
}

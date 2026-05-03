"use client";

import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDashboardAuth } from "../DashboardShell";
import { cn } from "@/lib/cn";

type IntegrationType = "voice" | "email" | "whatsapp";

/**
 * Per-integration "Sharing" panel. Shows the grants the current
 * operator has issued for this integration type and lets them grant
 * read or write access to other operators in the workspace.
 *
 * Hidden when the form is being managed on behalf of another
 * operator — only the integration owner can manage their own grants
 * (admins skip this concept entirely since they have implicit access).
 */
export function SharingPanel({
  integrationType,
  hideWhenManagingOther,
  isManagingOther,
}: {
  integrationType: IntegrationType;
  hideWhenManagingOther?: boolean;
  isManagingOther?: boolean;
}) {
  const { sessionToken, operator } = useDashboardAuth();
  const grants = useQuery(api.integrationGrants.listForOwner, {
    sessionToken,
    integrationType,
  });
  const teamOps = useQuery(api.operators.list, { sessionToken });
  const grant = useMutation(api.integrationGrants.grant);
  const revoke = useMutation(api.integrationGrants.revoke);

  const [picked, setPicked] = useState<Id<"operators"> | "">("");
  const [scope, setScope] = useState<"read" | "write">("read");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hideWhenManagingOther && isManagingOther) return null;

  const eligible =
    teamOps?.filter(
      (op) =>
        op._id !== operator._id &&
        !grants?.some((g) => g.grantedToOperatorId === op._id),
    ) ?? [];

  const onGrant = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      await grant({
        sessionToken,
        integrationType,
        grantedToOperatorId: picked,
        scope,
      });
      setPicked("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't grant.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-t border-rule pt-4">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        Share access with teammates
      </div>
      {grants && grants.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5 text-[12px]">
          {grants.map((g) => (
            <li
              key={g._id}
              className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-paper-2/30 px-3 py-1.5"
            >
              <span className="text-ink">
                {g.grantedToOperatorName}{" "}
                <span className="text-muted">{g.grantedToOperatorEmail}</span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]",
                    g.scope === "write"
                      ? "bg-warn/15 text-warn"
                      : "bg-paper-2 text-muted",
                  )}
                >
                  {g.scope}
                </span>
                <button
                  type="button"
                  onClick={() => revoke({ sessionToken, grantId: g._id })}
                  className="rounded-full border border-rule-2 px-2 py-0.5 text-[10px] text-muted hover:text-ink"
                >
                  Revoke
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {eligible.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={picked}
            onChange={(e) => setPicked(e.target.value as Id<"operators">)}
            className="h-9 rounded-lg border border-rule-2 bg-paper px-2 text-[12px] outline-none focus:border-ink"
          >
            <option value="">Select operator…</option>
            {eligible.map((op) => (
              <option key={op._id} value={op._id}>
                {op.name} · {op.role}
              </option>
            ))}
          </select>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value as "read" | "write")}
            className="h-9 rounded-lg border border-rule-2 bg-paper px-2 text-[12px] outline-none focus:border-ink"
          >
            <option value="read">Read only</option>
            <option value="write">Read + write</option>
          </select>
          <button
            type="button"
            onClick={onGrant}
            disabled={!picked || busy}
            className="inline-flex h-9 items-center rounded-full bg-ink px-3 text-[11px] font-medium text-paper hover:-translate-y-px disabled:opacity-50"
          >
            {busy ? "Granting…" : "Grant access"}
          </button>
        </div>
      ) : (
        <p className="text-[11px] text-muted">
          {grants && grants.length > 0
            ? "No more teammates left to grant access to."
            : "No teammates yet to grant access to."}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="mt-2 rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-1.5 text-[11px] text-red-900"
        >
          {error}
        </div>
      )}
      <p className="mt-2 text-[10.5px] leading-[1.4] text-muted">
        Admins/owners always have implicit full access — no grant
        needed. <strong>Read</strong> = view only. <strong>Write</strong>{" "}
        = view + edit + delete.
      </p>
    </div>
  );
}

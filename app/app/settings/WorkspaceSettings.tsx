"use client";

import { useDashboardAuth } from "../DashboardShell";
import { Card } from "../PageHeader";

export function WorkspaceSettings() {
  const { workspace } = useDashboardAuth();

  return (
    <Card title="Workspace" description="Top-level identity for your team.">
      <dl className="divide-y divide-rule">
        <Row label="Name" value={workspace.name} />
        <Row label="Slug" value={workspace.slug} mono />
        <Row label="Plan" value={workspace.plan} mono uppercase />
        <Row
          label="Workspace ID"
          value={workspace._id}
          mono
          truncate
        />
      </dl>
    </Card>
  );
}

function Row({
  label,
  value,
  mono,
  uppercase,
  truncate,
}: {
  label: string;
  value: string;
  mono?: boolean;
  uppercase?: boolean;
  truncate?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={[
          "text-sm text-ink",
          mono ? "font-mono text-[13px]" : "",
          uppercase ? "uppercase tracking-[0.04em]" : "",
          truncate ? "truncate sm:max-w-[60%]" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}

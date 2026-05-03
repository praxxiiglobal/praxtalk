import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";
import { WorkspacesTable } from "./WorkspacesTable";

export const dynamic = "force-dynamic"; // always live (admin view)

export default async function WorkspacesAdminPage() {
  const sessionToken = (await readSessionToken()) ?? "";
  const workspaces = await convexServer.query(
    api._admin.listWorkspaces,
    { sessionToken },
  );

  const totals = workspaces.reduce(
    (acc, w) => {
      acc.operators += w.operatorCount;
      acc.brands += w.brandCount;
      acc.conversations += w.conversationCount;
      acc.atlasRunsThisMonth += w.atlasRunsThisMonth;
      if (w.subscriptionStatus === "active") acc.activeSubs++;
      return acc;
    },
    {
      operators: 0,
      brands: 0,
      conversations: 0,
      atlasRunsThisMonth: 0,
      activeSubs: 0,
    },
  );

  return (
    <>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-[-0.025em]">
          Workspaces
        </h1>
        <p className="mt-2 max-w-[60ch] text-sm text-muted">
          Every PraxTalk workspace on this Convex deployment, with
          per-workspace counts. Click a row to drill into operators,
          brands, and recent activity.
        </p>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Workspaces" value={workspaces.length.toString()} />
        <Stat label="Active subs" value={totals.activeSubs.toString()} />
        <Stat label="Operators" value={totals.operators.toString()} />
        <Stat label="Brands" value={totals.brands.toString()} />
        <Stat
          label="Atlas runs (mo)"
          value={totals.atlasRunsThisMonth.toLocaleString()}
        />
      </div>

      <WorkspacesTable workspaces={workspaces} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-rule-2 bg-paper-2/40 px-4 py-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.02em]">
        {value}
      </div>
    </div>
  );
}

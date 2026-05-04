import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";
import { WorkspacesTable } from "./WorkspacesTable";

export const dynamic = "force-dynamic"; // always live (admin view)

export default async function WorkspacesAdminPage() {
  const sessionToken = (await readSessionToken()) ?? "";

  // Wrap the SSR query in try/catch — if Convex throws (commonly:
  // a new schema index hasn't been deployed yet, or auth gate
  // refused), surface a useful error instead of crashing into
  // Vercel's generic 500 / Chrome's "This page couldn't load".
  let workspaces: Awaited<
    ReturnType<typeof convexServer.query<typeof api._admin.listWorkspaces>>
  > | null = null;
  let queryError: string | null = null;
  try {
    workspaces = await convexServer.query(api._admin.listWorkspaces, {
      sessionToken,
    });
  } catch (e) {
    queryError = e instanceof Error ? e.message : String(e);
  }

  if (queryError || !workspaces) {
    return (
      <>
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-[-0.025em]">
            Workspaces
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm text-muted">
            Couldn&apos;t load workspaces. The Convex backend rejected
            the call — most likely the latest schema / index hasn&apos;t
            been deployed to production yet.
          </p>
        </header>
        <div className="rounded-2xl border border-red-300/40 bg-red-50/30 p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-red-700">
            Convex error
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-all text-[12.5px] text-red-900">
            {queryError ?? "Unknown error."}
          </pre>
          <div className="mt-4 text-[13px] text-ink">
            <strong>Fix:</strong> from a local checkout of the repo, run:
          </div>
          <pre className="mt-2 rounded-lg bg-paper-2 p-3 font-mono text-[12.5px] text-ink">
            npx convex deploy --yes
          </pre>
          <p className="mt-3 text-[12px] text-muted">
            That force-pushes the current <code>convex/</code> schema
            + every function to prod. Then reload this page.
          </p>
        </div>
      </>
    );
  }

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
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.025em]">
            Workspaces
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm text-muted">
            Every PraxTalk workspace on this Convex deployment, with
            per-workspace counts. Click a row to drill in for billing
            override, payment, or audit log — or grab a full export
            below.
          </p>
        </div>
        <a
          href="/admin/workspaces/export.csv"
          download
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-rule-2 bg-paper px-4 font-mono text-[11px] uppercase tracking-[0.06em] text-ink transition hover:border-ink hover:bg-paper-2"
          title="One row per workspace, every key metric — perfect for Sheets / Excel / CRM imports."
        >
          Download all workspaces (CSV) ↓
        </a>
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

      <WorkspacesTable
        workspaces={workspaces}
        sessionToken={sessionToken}
      />
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

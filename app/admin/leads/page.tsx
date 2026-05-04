import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";
import { LeadsTable } from "./LeadsTable";

export const dynamic = "force-dynamic";
export const metadata = { title: "All leads · admin" };

type Status = "new" | "contacted" | "qualified" | "won" | "lost";
const STATUSES: Status[] = ["new", "contacted", "qualified", "won", "lost"];

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sessionToken = (await readSessionToken()) ?? "";
  const sp = await searchParams;
  const status = STATUSES.includes(sp.status as Status)
    ? (sp.status as Status)
    : undefined;

  let leads: Awaited<
    ReturnType<typeof convexServer.query<typeof api._admin.listAllLeads>>
  > | null = null;
  let queryError: string | null = null;
  try {
    leads = await convexServer.query(api._admin.listAllLeads, {
      sessionToken,
      status,
      limit: 1000,
    });
  } catch (e) {
    queryError = e instanceof Error ? e.message : String(e);
  }

  if (queryError || !leads) {
    return (
      <>
        <header className="mb-8">
          <h1 className="text-3xl font-semibold tracking-[-0.025em]">
            Leads
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm text-muted">
            Couldn&apos;t load leads. Most likely the latest schema /
            functions haven&apos;t been deployed to prod yet.
          </p>
        </header>
        <div className="rounded-2xl border border-red-300/40 bg-red-50/30 p-5">
          <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-red-700">
            Convex error
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-all text-[12.5px] text-red-900">
            {queryError ?? "Unknown error."}
          </pre>
          <pre className="mt-3 rounded-lg bg-paper-2 p-3 font-mono text-[12.5px] text-ink">
            npx convex deploy --yes
          </pre>
        </div>
      </>
    );
  }

  const totals = leads.reduce(
    (acc, l) => {
      acc.all++;
      acc[l.status]++;
      return acc;
    },
    { all: 0, new: 0, contacted: 0, qualified: 0, won: 0, lost: 0 } as Record<
      "all" | Status,
      number
    >,
  );

  const downloadHref = status
    ? `/admin/leads/export.csv?status=${status}`
    : "/admin/leads/export.csv";

  return (
    <>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.025em]">
            Leads — every workspace
          </h1>
          <p className="mt-2 max-w-[60ch] text-sm text-muted">
            Cross-tenant view of every lead captured on PraxTalk.
            Workspace name is stamped on each row so the same person
            can show up multiple times across different brands.
          </p>
        </div>
        <a
          href={downloadHref}
          download
          className="inline-flex h-9 shrink-0 items-center rounded-full border border-rule-2 bg-paper px-4 font-mono text-[11px] uppercase tracking-[0.06em] text-ink transition hover:border-ink hover:bg-paper-2"
          title="One row per lead, every key field, current filters applied."
        >
          Download leads (CSV) ↓
        </a>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-6">
        <Stat label="Total" value={totals.all.toString()} />
        <Stat label="New" value={totals.new.toString()} />
        <Stat label="Contacted" value={totals.contacted.toString()} />
        <Stat label="Qualified" value={totals.qualified.toString()} />
        <Stat label="Won" value={totals.won.toString()} />
        <Stat label="Lost" value={totals.lost.toString()} />
      </div>

      <LeadsTable leads={leads} activeStatus={status ?? null} />
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

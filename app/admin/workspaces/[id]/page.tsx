import Link from "next/link";
import { notFound } from "next/navigation";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";
import { WorkspaceManagement } from "./WorkspaceManagement";

export const dynamic = "force-dynamic";

export default async function WorkspaceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const sessionToken = (await readSessionToken()) ?? "";
  let data: Awaited<
    ReturnType<typeof convexServer.query<typeof api._admin.getWorkspace>>
  > | null = null;
  let queryError: string | null = null;
  try {
    data = await convexServer.query(api._admin.getWorkspace, {
      sessionToken,
      workspaceId: id as Id<"workspaces">,
    });
  } catch (e) {
    queryError = e instanceof Error ? e.message : String(e);
  }
  if (queryError) {
    return (
      <div className="rounded-2xl border border-red-300/40 bg-red-50/30 p-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-red-700">
          Convex error
        </div>
        <pre className="mt-2 whitespace-pre-wrap break-all text-[12.5px] text-red-900">
          {queryError}
        </pre>
        <p className="mt-3 text-[12px] text-muted">
          Run <code>npx convex deploy --yes</code> from a local
          checkout, then reload.
        </p>
        <Link
          href="/admin/workspaces"
          className="mt-3 inline-block font-mono text-[11px] text-muted hover:text-ink"
        >
          ← Back to list
        </Link>
      </div>
    );
  }
  if (!data) notFound();
  const { workspace, operators, brands, recentConvos } = data;

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3 font-mono text-[11px] text-muted">
        <Link href="/admin/workspaces" className="hover:underline">
          ← All workspaces
        </Link>
        <a
          href={`/admin/workspaces/${id}/export.json`}
          download
          className="inline-flex h-7 items-center rounded-full border border-rule-2 px-3 text-[10.5px] uppercase tracking-[0.06em] text-ink transition hover:border-ink hover:bg-paper-2"
          title="Download a complete JSON dump of every record for this workspace (secrets redacted)."
        >
          Download full export (JSON) ↓
        </a>
      </div>
      <header className="mb-8">
        <h1 className="text-3xl font-semibold tracking-[-0.025em]">
          {workspace.name}
        </h1>
        <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted">
          <span>slug · {workspace.slug}</span>
          <span>·</span>
          <span>plan · {workspace.plan}</span>
          <span>·</span>
          <span>
            joined ·{" "}
            {new Date(workspace.createdAt).toLocaleString()}
          </span>
          {workspace.subscriptionStatus && (
            <>
              <span>·</span>
              <span>
                sub · {workspace.subscriptionStatus}
                {workspace.subscriptionProvider
                  ? ` (${workspace.subscriptionProvider})`
                  : ""}
              </span>
            </>
          )}
        </div>
      </header>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          Manage
        </h2>
        <WorkspaceManagement
          sessionToken={sessionToken}
          workspace={workspace}
        />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          Operators ({operators.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-rule-2">
          <table className="w-full text-sm">
            <thead className="bg-paper-2/60 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Email</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Joined</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {operators.map((op) => (
                <tr key={op._id}>
                  <td className="px-3 py-2.5">{op.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">
                    {op.email}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                    {op.role}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {new Date(op.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          Brands ({brands.length})
        </h2>
        <div className="overflow-x-auto rounded-2xl border border-rule-2">
          <table className="w-full text-sm">
            <thead className="bg-paper-2/60 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              <tr>
                <th className="px-3 py-2.5">Name</th>
                <th className="px-3 py-2.5">Slug</th>
                <th className="px-3 py-2.5">Widget id</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {brands.map((b) => (
                <tr key={b._id}>
                  <td className="px-3 py-2.5">{b.name}</td>
                  <td className="px-3 py-2.5 font-mono text-[12px]">
                    {b.slug}
                  </td>
                  <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                    {b.widgetId}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 font-mono text-[11px] uppercase tracking-[0.06em] text-muted">
          Recent conversations (last 20)
        </h2>
        {recentConvos.length === 0 ? (
          <p className="text-sm text-muted">No conversations yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-rule-2">
            <table className="w-full text-sm">
              <thead className="bg-paper-2/60 text-left font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                <tr>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Channel</th>
                  <th className="px-3 py-2.5">Last message</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule">
                {recentConvos.map((c) => (
                  <tr key={c._id}>
                    <td className="px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                      {c.status}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px]">
                      {c.channel}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-muted">
                      {new Date(c.lastMessageAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

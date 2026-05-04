import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Status = "new" | "contacted" | "qualified" | "won" | "lost";
const STATUSES: Status[] = ["new", "contacted", "qualified", "won", "lost"];

/**
 * Cross-workspace leads as a single CSV. One row per lead, workspace
 * name + brand stamped on every row so the same person can show up
 * multiple times across different workspaces and stay distinguishable.
 */
export async function GET(req: Request) {
  const sessionToken = (await readSessionToken()) ?? "";
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status");
  const status = STATUSES.includes(statusParam as Status)
    ? (statusParam as Status)
    : undefined;

  let leads: Awaited<
    ReturnType<typeof convexServer.query<typeof api._admin.listAllLeads>>
  >;
  try {
    leads = await convexServer.query(api._admin.listAllLeads, {
      sessionToken,
      status,
      limit: 5000,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }

  const columns = [
    "leadId",
    "workspaceId",
    "workspaceSlug",
    "workspaceName",
    "brandId",
    "brandName",
    "name",
    "email",
    "phone",
    "status",
    "country",
    "city",
    "ip",
    "notes",
    "remarksCount",
    "remarks",
    "assignedToName",
    "assignedToEmail",
    "assignedAt",
    "createdByName",
    "createdByEmail",
    "createdAt",
    "updatedAt",
    "conversationId",
  ] as const;

  const csv = [
    columns.join(","),
    ...leads.map((l) =>
      columns
        .map((c) => {
          const v = (l as unknown as Record<string, unknown>)[
            c === "leadId" ? "_id" : c
          ];
          if (c === "createdAt" || c === "updatedAt" || c === "assignedAt") {
            return csvCell(
              typeof v === "number" ? new Date(v).toISOString() : "",
            );
          }
          return csvCell(v);
        })
        .join(","),
    ),
  ].join("\n");

  const filename = `praxtalk-leads-${
    status ?? "all"
  }-${new Date().toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Cross-workspace summary as a single CSV — one row per workspace,
 * same headers for every row, perfect for piping into Sheets / Excel
 * / a CRM. The collation customers ask for ("everyone using PraxTalk
 * in one file"). Uses the Convex `exportAllWorkspacesSummary` query
 * which is platform-admin gated.
 */
export async function GET() {
  const sessionToken = (await readSessionToken()) ?? "";

  let rows: Awaited<
    ReturnType<
      typeof convexServer.query<typeof api._admin.exportAllWorkspacesSummary>
    >
  >;
  try {
    rows = await convexServer.query(api._admin.exportAllWorkspacesSummary, {
      sessionToken,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }

  // Lock the column order so the file stays diffable across exports
  // and downstream consumers (Sheets imports, Power BI sources) don't
  // break when the Convex query happens to return fields in a
  // different key order.
  const columns = [
    "workspaceId",
    "workspaceSlug",
    "workspaceName",
    "plan",
    "platformStatus",
    "platformStatusReason",
    "subscriptionStatus",
    "subscriptionProvider",
    "paypalSubscriptionId",
    "razorpaySubscriptionId",
    "currentPeriodEnd",
    "createdAt",
    "ownerName",
    "ownerEmail",
    "ownerCreatedAt",
    "operatorCount",
    "brandCount",
    "conversationCount",
    "atlasRunsTotal",
    "atlasRunsThisMonth",
    "lastActivityAt",
  ] as const;

  const csv = [
    columns.join(","),
    ...rows.map((row) =>
      columns
        .map((c) => csvCell((row as Record<string, unknown>)[c]))
        .join(","),
    ),
  ].join("\n");

  const filename = `praxtalk-all-workspaces-${
    new Date().toISOString().slice(0, 10)
  }.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * RFC 4180-ish CSV cell escape: wrap in quotes if the value contains
 * a comma, double-quote, or newline; double-up internal quotes.
 * Numbers and booleans get stringified; null/undefined become empty.
 */
function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Customer-facing self-serve export. Streams a complete JSON dump of
 * the operator's OWN workspace — gated by the regular session cookie
 * + an owner/admin role check inside the Convex query.
 *
 * Mirrors /admin/workspaces/[id]/export.json byte-for-byte (same
 * helper, same redaction). The differences are:
 *   - No workspaceId path param — taken from the session.
 *   - Owner/admin only (not platform-admin). Agents get 403.
 */
export async function GET() {
  const sessionToken = (await readSessionToken()) ?? "";

  let core: Awaited<
    ReturnType<typeof convexServer.query<typeof api.workspaces.exportMine>>
  >;
  try {
    core = await convexServer.query(api.workspaces.exportMine, {
      sessionToken,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }

  const messages: unknown[] = [];
  let cursor: number | null = null;
  for (let page = 0; page < 200; page++) {
    const res: {
      messages: unknown[];
      nextCursor: number | null;
      done: boolean;
    } = await convexServer.query(api.workspaces.exportMineMessagesPage, {
      sessionToken,
      cursor,
      pageSize: 5000,
    });
    messages.push(...res.messages);
    if (res.done || res.nextCursor === null) break;
    cursor = res.nextCursor;
  }

  const filename = `praxtalk-${core.meta.workspaceSlug}-${
    new Date().toISOString().slice(0, 10)
  }.json`;

  const body = JSON.stringify(
    {
      ...core,
      messages,
      messagesMeta: {
        count: messages.length,
        truncated: messages.length === 200 * 5000,
        truncatedNote:
          messages.length === 200 * 5000
            ? "Hit the 1M-message safety cap. Email hello@praxtalk.com if you need older data."
            : null,
      },
    },
    null,
    2,
  );

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

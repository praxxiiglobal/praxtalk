import { NextResponse } from "next/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";

export const dynamic = "force-dynamic";
// Exports can be large — 5 minutes is the platform default and plenty
// of headroom for paginating millions of messages.
export const maxDuration = 300;

/**
 * Streams a complete JSON dump of a single workspace. Hits the
 * Convex `exportWorkspaceCore` query for everything except messages,
 * then paginates `exportWorkspaceMessagesPage` until exhausted.
 *
 * Auth: relies on the same session cookie / platform-admin email
 * allowlist as the rest of /admin — the Convex queries already
 * gate via `requirePlatformAdmin`, so an unauthenticated caller
 * gets a clean ConvexError → 500 here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionToken = (await readSessionToken()) ?? "";

  let core: Awaited<
    ReturnType<typeof convexServer.query<typeof api._admin.exportWorkspaceCore>>
  >;
  try {
    core = await convexServer.query(api._admin.exportWorkspaceCore, {
      sessionToken,
      workspaceId: id as Id<"workspaces">,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 401 },
    );
  }

  // Paginate messages — 5k per page; loop until done. Hard cap at
  // 1M messages per export so a runaway loop can't DoS the route.
  const messages: unknown[] = [];
  let cursor: number | null = null;
  for (let page = 0; page < 200; page++) {
    const res: {
      messages: unknown[];
      nextCursor: number | null;
      done: boolean;
    } = await convexServer.query(api._admin.exportWorkspaceMessagesPage, {
      sessionToken,
      workspaceId: id as Id<"workspaces">,
      cursor,
      pageSize: 5000,
    });
    messages.push(...res.messages);
    if (res.done || res.nextCursor === null) break;
    cursor = res.nextCursor;
  }

  const filename = `praxtalk-workspace-${core.meta.workspaceSlug}-${
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
            ? "Hit the 1M-message safety cap. Export the remaining messages " +
              "via repeated calls to exportWorkspaceMessagesPage with cursor."
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

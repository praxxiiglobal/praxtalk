import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import {
  clearSessionCookie,
  readSessionToken,
} from "@/lib/session";
import { ActiveCallOverlay } from "./ActiveCallOverlay";
import { DashboardShell } from "./DashboardShell";
import { DialPadButton } from "./DialPad";
import { PendingReviewScreen } from "./PendingReviewScreen";
import { SessionGuard } from "./SessionGuard";
import { SideNav } from "./SideNav";
import { Topbar } from "./Topbar";

export const metadata = {
  title: "Inbox · PraxTalk",
  robots: { index: false, follow: false },
};

export default async function AppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const sessionToken = await readSessionToken();
  if (!sessionToken) redirect("/login");

  // api.auth.me returns null on missing/expired session — but it can
  // also THROW if the Convex deployment is unreachable, the schema /
  // function code is out of step (e.g. just-rotated CONVEX_DEPLOY_KEY
  // pointing at a deployment without the latest push), or the session
  // cookie is from a different deployment than the one this build
  // talks to. Catching here turns a generic 500 into a friendly
  // re-login instead of stranding the operator.
  let me: Awaited<
    ReturnType<typeof convexServer.query<typeof api.auth.me>>
  > = null;
  try {
    me = await convexServer.query(api.auth.me, { sessionToken });
  } catch (e) {
    console.error("[/app] auth.me failed:", e);
    await clearSessionCookie();
    redirect("/login?reauth=1");
  }
  if (!me) {
    // Cookie present but server-side session missing/expired —
    // clear it and bounce to /login (the workspace likely still exists).
    await clearSessionCookie();
    redirect("/login?expired=1");
  }

  // New signups land in pending_review. Replace the dashboard with a
  // friendly waiting screen until a platform admin approves them via
  // /admin/workspaces. Logout button still works; nothing else.
  if (me.workspace.platformStatus === "pending_review") {
    return (
      <PendingReviewScreen
        workspaceName={me.workspace.name}
        ownerName={me.operator.name}
        reason={me.workspace.platformStatusReason}
      />
    );
  }

  return (
    <DashboardShell
      auth={{
        sessionToken,
        operator: me.operator,
        workspace: me.workspace,
      }}
    >
      <SessionGuard>
        <div className="flex h-screen flex-col overflow-hidden bg-paper">
          <Topbar />
          <div className="flex flex-1 min-h-0">
            <SideNav />
            <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </main>
          </div>
        </div>
        <DialPadButton />
        <ActiveCallOverlay />
      </SessionGuard>
    </DashboardShell>
  );
}

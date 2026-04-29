import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import {
  clearSessionCookie,
  readSessionToken,
} from "@/lib/session";
import { DashboardShell } from "./DashboardShell";
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

  const me = await convexServer.query(api.auth.me, { sessionToken });
  if (!me) {
    // Cookie present but server-side session missing/expired —
    // clear it and bounce to /login (the workspace likely still exists).
    await clearSessionCookie();
    redirect("/login?expired=1");
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
            <main className="flex min-w-0 flex-1 flex-col overflow-y-auto">
              {children}
            </main>
          </div>
        </div>
      </SessionGuard>
    </DashboardShell>
  );
}

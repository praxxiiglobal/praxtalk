import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import {
  clearSessionCookie,
  readSessionToken,
} from "@/lib/session";
import { DashboardShell } from "./DashboardShell";
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
  if (!sessionToken) redirect("/setup");

  const me = await convexServer.query(api.auth.me, { sessionToken });
  if (!me) {
    // Cookie present but server-side session missing/expired — clear and re-bootstrap.
    await clearSessionCookie();
    redirect("/setup");
  }

  return (
    <DashboardShell
      auth={{
        sessionToken,
        operator: me.operator,
        workspace: me.workspace,
      }}
    >
      <div className="flex min-h-screen flex-col bg-paper">
        <Topbar />
        <main className="flex flex-1 flex-col">{children}</main>
      </div>
    </DashboardShell>
  );
}

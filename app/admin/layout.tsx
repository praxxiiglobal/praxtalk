import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";

export const metadata = {
  title: "Platform admin · PraxTalk",
  // Never appears in SERPs.
  robots: { index: false, follow: false },
};

/**
 * /admin is the cross-tenant platform owner view (Praxxii Global
 * staff only). Auth gate: the caller's email must be in
 * PLATFORM_ADMIN_EMAILS (default includes praxxiiglobal@gmail.com).
 *
 * Layout uses the existing operator-session cookie but skips the
 * per-tenant DashboardShell — there's no single workspace this
 * scope belongs to.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const sessionToken = await readSessionToken();
  if (!sessionToken) redirect("/login?next=/admin/workspaces");

  const check = await convexServer.query(api._admin.checkPlatformAdmin, {
    sessionToken,
  });
  if (!check.ok) {
    if (check.reason === "expired" || check.reason === "no-session") {
      redirect("/login?next=/admin/workspaces");
    }
    // Authenticated but not a platform admin. Bounce to /app where
    // they belong.
    redirect("/app?admin=denied");
  }

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-rule bg-paper">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-6 px-6">
          <Link href="/admin/workspaces" className="font-semibold tracking-tight">
            Prax<span className="text-accent">Talk</span>{" "}
            <span className="ml-1 rounded-full bg-warn/20 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-ink">
              admin
            </span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              href="/admin/workspaces"
              className="text-ink/85 hover:text-ink"
            >
              Workspaces
            </Link>
          </nav>
          <Link
            href="/app"
            className="ml-auto font-mono text-[11px] uppercase tracking-[0.06em] text-muted hover:text-ink"
          >
            ↩ Back to /app
          </Link>
        </div>
      </header>
      <main id="main" className="flex-1">
        <div className="mx-auto max-w-[1320px] px-6 py-8">{children}</div>
      </main>
    </div>
  );
}

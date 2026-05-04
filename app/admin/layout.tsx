import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { readSessionToken } from "@/lib/session";
import { AdminConvexProvider } from "./AdminConvexProvider";

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

  // Wrap the auth gate query — if Convex is unreachable / function
  // not deployed / env missing, render an inline error chrome
  // instead of crashing the whole tree into a generic Vercel 500.
  let layoutError: string | null = null;
  let denied = false;
  let needsLogin = false;
  try {
    const check = await convexServer.query(api._admin.checkPlatformAdmin, {
      sessionToken,
    });
    if (!check.ok) {
      if (check.reason === "expired" || check.reason === "no-session") {
        needsLogin = true;
      } else {
        denied = true;
      }
    }
  } catch (e) {
    layoutError = e instanceof Error ? e.message : String(e);
  }
  if (needsLogin) redirect("/login?next=/admin/workspaces");
  if (denied) redirect("/app?admin=denied");

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
            <Link
              href="/admin/leads"
              className="text-ink/85 hover:text-ink"
            >
              Leads
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
        <div className="mx-auto max-w-[1320px] px-6 py-8">
          {layoutError ? (
            <div className="rounded-2xl border border-red-300/40 bg-red-50/30 p-5">
              <div className="font-mono text-[11px] uppercase tracking-[0.06em] text-red-700">
                Convex auth gate failed
              </div>
              <pre className="mt-2 whitespace-pre-wrap break-all text-[12.5px] text-red-900">
                {layoutError}
              </pre>
              <div className="mt-4 text-[13px] text-ink space-y-2">
                <p>
                  <strong>Most likely fix:</strong> from a local checkout
                  of the repo, run:
                </p>
                <pre className="rounded-lg bg-paper-2 p-3 font-mono text-[12.5px] text-ink">
                  npx convex deploy --yes
                </pre>
                <p>
                  This force-pushes the current <code>convex/</code>{" "}
                  schema + every function to prod. Then reload this
                  page.
                </p>
                <p className="text-[12px] text-muted">
                  Other things to check: <code>NEXT_PUBLIC_CONVEX_URL</code>{" "}
                  is set in Vercel env, the prod Convex deployment is
                  reachable, and your operator email is in{" "}
                  <code>PLATFORM_ADMIN_EMAILS</code> (Convex env) or
                  matches the hardcoded fallback.
                </p>
              </div>
            </div>
          ) : (
            <AdminConvexProvider>{children}</AdminConvexProvider>
          )}
        </div>
      </main>
    </div>
  );
}

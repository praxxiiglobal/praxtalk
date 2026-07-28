"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const AUTH_MARKERS = [
  "Session expired",
  "Not authenticated",
  "Operator not found",
];

function isAuthError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return AUTH_MARKERS.some((m) => err.message.includes(m));
}

/**
 * Small client-side guard that redirects the operator to /login if any
 * Convex query under it throws an auth error. Wraps the whole dashboard
 * because every query in the inbox needs a valid session.
 */
export function SessionGuard({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const handler = (event: PromiseRejectionEvent | ErrorEvent) => {
      const err =
        "reason" in event ? (event as PromiseRejectionEvent).reason : (event as ErrorEvent).error;
      if (!isAuthError(err)) return;
      if (redirecting) return;
      setRedirecting(true);
      // Go to /login so they can mint a fresh session — /setup would
      // throw "workspace exists" for an existing tenant.
      router.replace("/login?expired=1");
    };

    window.addEventListener("unhandledrejection", handler);
    window.addEventListener("error", handler);
    return () => {
      window.removeEventListener("unhandledrejection", handler);
      window.removeEventListener("error", handler);
    };
  }, [redirecting, router]);

  if (redirecting) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-sm text-muted">
        Session expired — redirecting…
      </div>
    );
  }

  return <>{children}</>;
}

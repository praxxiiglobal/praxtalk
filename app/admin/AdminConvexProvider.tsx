"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useMemo } from "react";

/**
 * Thin Convex provider for the /admin tree. /app already provides
 * one via DashboardShell, but /admin deliberately skips that
 * (DashboardShell carries per-tenant operator + workspace context
 * that's wrong for a cross-tenant admin view). This is the
 * minimal client-side provider every useQuery / useMutation in
 * /admin needs to mount.
 */
export function AdminConvexProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const client = useMemo(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!),
    [],
  );
  return <ConvexProvider client={client}>{children}</ConvexProvider>;
}

"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";

export type DashboardAuth = {
  sessionToken: string;
  operator: {
    _id: string;
    email: string;
    name: string;
    role: "owner" | "admin" | "agent";
  };
  workspace: {
    _id: string;
    slug: string;
    name: string;
    widgetId: string;
    plan: "spark" | "team" | "scale" | "enterprise";
  };
};

const AuthContext = createContext<DashboardAuth | null>(null);

export function useDashboardAuth(): DashboardAuth {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useDashboardAuth must be used inside DashboardShell.");
  }
  return ctx;
}

export function DashboardShell({
  auth,
  children,
}: {
  auth: DashboardAuth;
  children: ReactNode;
}) {
  // Re-create client only if URL changes (it won't in practice — env at build).
  const client = useMemo(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!),
    [],
  );
  return (
    <ConvexProvider client={client}>
      <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
    </ConvexProvider>
  );
}

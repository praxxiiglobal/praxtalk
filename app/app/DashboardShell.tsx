"use client";

import { ConvexProvider, ConvexReactClient, useQuery } from "convex/react";
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { api } from "@/convex/_generated/api";

export type ChannelFlags = {
  chat: boolean;
  email: boolean;
  whatsapp: boolean;
  voice: boolean;
  sms: boolean;
};

export type ModuleFlags = {
  atlasAi: boolean;
  leads: boolean;
  bookingPages: boolean;
  multiBrand: boolean;
  analytics: boolean;
};

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
    plan: "spark" | "team" | "scale" | "enterprise";
    features: {
      channels: ChannelFlags;
      modules: ModuleFlags;
    };
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
      <AuthContext.Provider value={auth}>
        <AccentInjector>{children}</AccentInjector>
      </AuthContext.Provider>
    </ConvexProvider>
  );
}

/**
 * Reads the workspace's dashboardAccent and injects CSS variable
 * overrides into the dashboard subtree. Only swaps the primary-action
 * ink colour (the `bg-ink` button background + `text-ink-on-bg-ink`
 * style targets); body text and borders keep PraxTalk defaults so the
 * dashboard stays readable regardless of the picked colour.
 *
 * Marketing pages aren't wrapped in DashboardShell so they keep brand
 * defaults end-to-end.
 */
function AccentInjector({ children }: { children: ReactNode }) {
  const { sessionToken } = useDashboardAuth();
  const accent = useQuery(api.workspaces.getDashboardAccent, { sessionToken });
  if (!accent) return <>{children}</>;
  return (
    <div data-themed-accent={accent} className="contents">
      <style>{`
        [data-themed-accent] .bg-ink { background-color: ${accent} !important; }
        [data-themed-accent] .border-ink { border-color: ${accent} !important; }
        [data-themed-accent] .ring-ink { --tw-ring-color: ${accent} !important; }
      `}</style>
      {children}
    </div>
  );
}

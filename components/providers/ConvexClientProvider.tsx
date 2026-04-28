"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;

if (!convexUrl && typeof window !== "undefined") {
  // Surfaced loudly in dev so you don't waste time wondering why
  // queries return undefined forever.
  console.error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` and copy " +
      "the values it prints into .env.local",
  );
}

const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  if (!convex) return <>{children}</>;
  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}

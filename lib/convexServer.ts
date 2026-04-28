import "server-only";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) {
  // We surface this loudly so misconfigured envs fail fast in dev.
  // Production should have CONVEX_DEPLOYMENT + NEXT_PUBLIC_CONVEX_URL set
  // by Vercel from the Convex integration.
  throw new Error(
    "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` locally, " +
      "or wire the Convex integration in Vercel.",
  );
}

export const convexServer = new ConvexHttpClient(url);

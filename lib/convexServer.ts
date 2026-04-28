import "server-only";
import { ConvexHttpClient } from "convex/browser";

let cached: ConvexHttpClient | null = null;

/**
 * Lazily-initialised Convex HTTP client for server-side calls.
 * We construct on first use (not at module load) so the production build
 * can succeed even if NEXT_PUBLIC_CONVEX_URL hasn't been wired yet —
 * the error only fires when something actually tries to call Convex.
 */
export function getConvexServer(): ConvexHttpClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_CONVEX_URL is not set. Run `npx convex dev` locally, " +
        "or wire the Convex integration in Vercel.",
    );
  }
  cached = new ConvexHttpClient(url);
  return cached;
}

/**
 * Backwards-compatible Proxy that forwards method calls to the lazy client.
 * Lets callers keep writing `convexServer.query(...)` / `convexServer.mutation(...)`
 * without having to refactor every call site.
 */
export const convexServer = new Proxy({} as ConvexHttpClient, {
  get(_target, prop, receiver) {
    const client = getConvexServer();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

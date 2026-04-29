"use client";

import { useSearchParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Read the active brand filter from the URL.
 *
 * Returns the selected `Id<"brands">` when `?brand=<id>` is set, or null
 * for "all brands". Pass the result directly to queries that take an
 * optional `brandId` arg (`conversations.listInbox`, `leads.list`).
 */
export function useSelectedBrand(): Id<"brands"> | null {
  const params = useSearchParams();
  const value = params.get("brand");
  if (!value || value === "all") return null;
  return value as Id<"brands">;
}

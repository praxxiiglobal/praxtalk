import type { Doc } from "../_generated/dataModel";

/**
 * Per-workspace feature gates. Default-on posture: a missing flag
 * means the feature is enabled. Only an explicit `false` disables.
 *
 * UI gating uses these to hide nav items + tabs. Server enforcement
 * for billing-sensitive features (Atlas AI runs, voice integrations)
 * should be added when needed — for now this is purely a UI gate.
 */

export type FeatureChannel = "chat" | "email" | "whatsapp" | "voice" | "sms";
export type FeatureModule =
  | "atlasAi"
  | "leads"
  | "bookingPages"
  | "multiBrand"
  | "analytics";

type WorkspaceFeatures = Doc<"workspaces">["features"];

export const ALL_CHANNELS: FeatureChannel[] = [
  "chat",
  "email",
  "whatsapp",
  "voice",
  "sms",
];

export const ALL_MODULES: FeatureModule[] = [
  "atlasAi",
  "leads",
  "bookingPages",
  "multiBrand",
  "analytics",
];

export function isChannelEnabled(
  features: WorkspaceFeatures | undefined,
  channel: FeatureChannel,
): boolean {
  // Missing features object → all on. Missing channels → all on.
  // Specific channel false → off. Otherwise on.
  return features?.channels?.[channel] !== false;
}

export function isModuleEnabled(
  features: WorkspaceFeatures | undefined,
  module: FeatureModule,
): boolean {
  return features?.[module] !== false;
}

/**
 * Materialised view of every gate — useful for shipping to the
 * client where we don't want it re-deriving truth from the raw
 * (sparse) features object every render.
 */
export type ResolvedFeatures = {
  channels: Record<FeatureChannel, boolean>;
  modules: Record<FeatureModule, boolean>;
};

export function resolveFeatures(
  features: WorkspaceFeatures | undefined,
): ResolvedFeatures {
  return {
    channels: Object.fromEntries(
      ALL_CHANNELS.map((c) => [c, isChannelEnabled(features, c)]),
    ) as Record<FeatureChannel, boolean>,
    modules: Object.fromEntries(
      ALL_MODULES.map((m) => [m, isModuleEnabled(features, m)]),
    ) as Record<FeatureModule, boolean>,
  };
}

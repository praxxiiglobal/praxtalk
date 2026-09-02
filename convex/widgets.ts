import { v } from "convex/values";
import { query } from "./_generated/server";

/**
 * Public — called from the embeddable widget to fetch its display config.
 * Lookup is keyed on the public widgetId, no session token required.
 *
 * The widgetId resolves to a single brand. During the Phase 1 migration,
 * brand widgetIds reuse the legacy workspace.widgetId so existing snippets
 * keep working without a code change on customer sites.
 */
export const getConfigByWidgetId = query({
  args: { widgetId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      workspaceId: v.id("workspaces"),
      brandId: v.id("brands"),
      brandName: v.string(),
      primaryColor: v.string(),
      welcomeMessage: v.string(),
      position: v.union(v.literal("br"), v.literal("bl")),
      avatarUrl: v.optional(v.string()),
      bubbleIcon: v.optional(v.union(v.literal("logo"), v.literal("glyph"))),
      // Launcher-bubble diameter in px; absent = widget default (64).
      launcherSize: v.optional(v.number()),
      // Curved launcher label; absent/empty = widget default ("Talk to us").
      launcherText: v.optional(v.string()),
      // Proactive greeting card, RESOLVED server-side: null when the
      // brand hasn't opted in, otherwise the teaser copy (greetingText
      // falling back to welcomeMessage). The widget just renders what
      // it's given — the fallback rule lives here, in one place.
      greeting: v.union(v.string(), v.null()),
      // Suggestion chips shown under the greeting. Always an array —
      // empty means "greeting only, no chips".
      quickReplies: v.array(v.string()),
      // wa.me lite — present when the brand has a click-to-chat
      // WhatsApp number configured. Widget renders a "Prefer
      // WhatsApp" link in the welcome strip when set; null otherwise.
      waMePhone: v.union(v.string(), v.null()),
      waMePrefilledMessage: v.union(v.string(), v.null()),
      // True (default) = drop the inline identity card after the
      // visitor's first message. False = stay fully anonymous.
      askIdentityInChat: v.boolean(),
    }),
  ),
  handler: async (ctx, { widgetId }) => {
    const brand = await ctx.db
      .query("brands")
      .withIndex("by_widget_id", (q) => q.eq("widgetId", widgetId))
      .unique();
    if (!brand) return null;

    return {
      workspaceId: brand.workspaceId,
      brandId: brand._id,
      brandName: brand.name,
      primaryColor: brand.primaryColor,
      welcomeMessage: brand.welcomeMessage,
      position: brand.position,
      avatarUrl: brand.avatarUrl,
      bubbleIcon: brand.bubbleIcon,
      launcherSize: brand.launcherSize,
      launcherText: brand.launcherText,
      // Opt-in only. A brand that never enabled the greeting gets null
      // here, so the widget can't accidentally pop a card at visitors.
      greeting: brand.greetingEnabled
        ? (brand.greetingText?.trim() || brand.welcomeMessage.trim() || null)
        : null,
      quickReplies: brand.greetingEnabled ? (brand.quickReplies ?? []) : [],
      waMePhone: brand.waMePhone ?? null,
      waMePrefilledMessage: brand.waMePrefilledMessage ?? null,
      // Unset = default-on (most brands want to capture identity).
      askIdentityInChat: brand.askIdentityInChat ?? true,
    };
  },
});

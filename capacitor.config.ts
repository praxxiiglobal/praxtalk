import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor wrap for the PraxTalk operator app.
 *
 * Strategy: thin native shell that loads the live operator dashboard
 * over the network, NOT a bundled-static SPA. This keeps a single
 * source of truth for the dashboard (the Vercel deployment) and
 * means feature ships don't require an app-store re-submission.
 *
 * Risks of this approach (and why we accept them):
 *   - Requires network on launch — for a B2B inbox, every operator
 *     is online when working anyway.
 *   - Apple App Store policy 4.2 (minimum functionality) requires
 *     the app to be more than a webview wrapper. We satisfy that
 *     by registering native push notifications via
 *     @capacitor/push-notifications and routing them to /app's
 *     existing Web Push subscription path so push works on iOS
 *     (where Web Push has historically been unreliable).
 *
 * Once /app has been moved to app.praxtalk.com (audit S-06), update
 * server.url below from the temporary apex path to the subdomain.
 */
const config: CapacitorConfig = {
  appId: "com.praxxiiglobal.praxtalk",
  appName: "PraxTalk",
  webDir: "out", // unused — we load over network via server.url

  server: {
    url: "https://www.praxtalk.com/app",
    // Allow the wrapped app to talk to the Convex backend that the
    // dashboard already calls — same origin set the web app uses.
    allowNavigation: [
      "www.praxtalk.com",
      "praxtalk.com",
      "*.convex.cloud",
      "*.convex.site",
    ],
    // Force HTTPS — refuse to load if the prod URL ever flips
    // accidentally.
    androidScheme: "https",
  },

  ios: {
    contentInset: "always",
    // Splash + status bar lean on the dashboard's own background
    // colour so there's no light/dark flash on launch.
    backgroundColor: "#F1EFE3",
  },

  android: {
    backgroundColor: "#F1EFE3",
    allowMixedContent: false,
  },

  plugins: {
    PushNotifications: {
      // FCM is the default; APNs config lives in the iOS project's
      // entitlements after `npx cap add ios`. See mobile/README.md
      // for the per-platform credential checklist.
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;

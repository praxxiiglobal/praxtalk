# PraxTalk Mobile (Capacitor wrap)

This is the iOS + Android shell for the PraxTalk operator app.
Capacitor wraps the live dashboard at `www.praxtalk.com/app` (eventually
`app.praxtalk.com`) in a native webview and adds true native push
notifications, so iOS operators get reliable push delivery without
relying on the still-unreliable iOS Web Push surface.

> **What's in the repo**: `capacitor.config.ts` + this README. The
> generated `ios/` and `android/` Xcode + Gradle projects are
> intentionally NOT checked in — they're regenerable, large, and
> Capacitor's `.gitignore` skips them by default. You generate them
> on your machine the first time you build.

---

## First-time setup

You need:

- **macOS** with Xcode 15+ installed (for iOS).
- **Android Studio** with the Android SDK (for Android).
- **Apple Developer Program** membership ($99/yr) for App Store + push.
- **Google Play Console** ($25 one-time) for Play Store.
- **Firebase project** for FCM push (free tier is fine).

```bash
# From the repo root:
npx cap add ios       # generates ios/ folder
npx cap add android   # generates android/ folder
npx cap sync          # copies config + plugins into both
```

After this you'll have `ios/` and `android/` directories. They're
gitignored — every developer regenerates them locally.

---

## Day-to-day dev loop

The dashboard is loaded **live** over the network from the production
Vercel deployment via `server.url` in `capacitor.config.ts`. There's
no bundled web build — change something on the website, the next
launch picks it up.

```bash
# iOS — opens Xcode at the generated project
npx cap open ios

# Android — opens Android Studio
npx cap open android
```

Run on a simulator / emulator from inside Xcode / Android Studio.

For **on-device testing** (required to test push notifications):

- iOS: connect an iPhone via USB, select it as the run target in
  Xcode, hit ▶. First run requires accepting the developer
  certificate on the device under Settings → General → VPN & Device
  Management.
- Android: enable USB debugging on the phone, plug in, run from
  Android Studio.

---

## Push notifications

The dashboard already has a Web Push (VAPID) implementation that
works on Android Chrome and desktop browsers. iOS Safari Web Push is
restricted to PWAs added to home screen + has a long history of
delivery flakiness.

Capacitor lets us register **native** push via APNs (iOS) + FCM
(Android), which is reliable + standard. The flow:

1. App launches → registers with APNs (iOS) or FCM (Android) →
   gets a device token.
2. App POSTs the token to `/api/push/register-native` (still to be
   wired — currently the workspace's `pushSubscriptions` table only
   stores Web Push subscriptions; add a `nativeToken` field + a
   sibling endpoint).
3. Convex's `pushNotifications.sendToOperator` action checks for a
   native token first, falls back to Web Push if not registered.

**Apple Push setup** (do once per app):

1. In Apple Developer portal → Certificates, Identifiers & Profiles
   → register an App ID with the bundle id
   `com.praxxiiglobal.praxtalk`. Enable Push Notifications capability.
2. Generate an APNs Auth Key (.p8) — keep the Key ID + Team ID.
3. In the Convex env, set `APNS_KEY_P8` (the file contents),
   `APNS_KEY_ID`, `APNS_TEAM_ID`.
4. In Xcode: open `ios/App/App.xcworkspace` → Signing & Capabilities
   → Add Capability → Push Notifications.

**Firebase Cloud Messaging setup** (do once per app):

1. Create a Firebase project — register an Android app with package
   name `com.praxxiiglobal.praxtalk`.
2. Download `google-services.json` → place in
   `android/app/google-services.json`.
3. In Convex env, set `FCM_SERVER_KEY` (Firebase project settings →
   Cloud Messaging).

---

## Building for release

### iOS — TestFlight + App Store

1. Bump the version in `ios/App/App.xcodeproj/project.pbxproj`
   (Marketing Version + Current Project Version).
2. In Xcode: Product → Archive.
3. Distribute via App Store Connect.
4. App Store listing copy + screenshots: see `mobile/store-listing.md`
   (when written).

### Android — Internal Track + Play Store

1. Bump `versionCode` + `versionName` in
   `android/app/build.gradle`.
2. Build → Generate Signed Bundle (.aab) — sign with your upload
   key (kept on your machine, never in git).
3. Upload to Play Console → Internal Testing track first, then
   promote to Production.

---

## App Store policy 4.2 (minimum functionality)

Apple rejects apps that are pure webviews without native value-add.
Our justification:

- **Native push** via APNs (Web Push on iOS is unreliable in Safari).
- **Biometric auth** (FaceID / TouchID) to unlock the dashboard
  without re-typing the password — to be added via
  `@capacitor/biometric-authentication` once the basic shell ships.
- **Background app refresh** for time-sensitive booking reminders.

Document these in the App Store reviewer notes when submitting.

---

## Releasing updates

Three update paths:

1. **Web change only** — ship to Vercel as normal. Native shells
   pick it up on next launch (no app-store submission needed).
   Most updates take this path.
2. **New native plugin / capability** — bump version → `npx cap
   sync` → archive → submit. Apple review is typically 24–72 hrs.
3. **Native bugfix** — same as 2.

The deliberate design goal: **most product work flows through path
1**, so we're not held hostage to Apple's review SLA for shipping
features.

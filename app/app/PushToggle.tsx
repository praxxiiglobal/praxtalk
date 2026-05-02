"use client";

import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { useDashboardAuth } from "./DashboardShell";

/**
 * Self-contained "Browser notifications" toggle. Handles:
 *  - service worker registration on mount
 *  - Notification.permission state
 *  - browser PushSubscription create/delete
 *  - persisting the subscription server-side
 *
 * Skips entirely on browsers that don't support Notifications or
 * PushManager. Skips silently when VAPID keys aren't configured on
 * the server (the backing query returns null).
 */
export function PushToggle() {
  const { sessionToken } = useDashboardAuth();
  const vapidPublicKey = useQuery(api.pushSubscriptions.getVapidPublicKey, {});
  const subscribe = useMutation(api.pushSubscriptions.subscribe);
  const unsubscribe = useMutation(api.pushSubscriptions.unsubscribe);

  const [supported, setSupported] = useState<boolean | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | null>(
    null,
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Detect support + register the service worker once.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok =
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;
    setSupported(ok);
    if (!ok) return;
    setPermission(Notification.permission);
    void navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[push] sw register failed", err);
      setError("Couldn't register service worker.");
    });
    // Surface existing subscription if any.
    void navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setEndpoint(sub.endpoint);
      }),
    );
  }, []);

  const turnOn = async () => {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") {
        setError("Permission denied — enable in browser settings.");
        return;
      }
      if (!vapidPublicKey) {
        setError("Push not configured on the server yet.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          vapidPublicKey,
        ) as BufferSource,
      });
      const json = sub.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
        setError("Subscription returned incomplete keys.");
        return;
      }
      await subscribe({
        sessionToken,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        userAgent: navigator.userAgent,
      });
      setEndpoint(json.endpoint);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Subscribe failed.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribe({ sessionToken, endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setEndpoint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unsubscribe failed.");
    } finally {
      setBusy(false);
    }
  };

  if (supported === null) return null;
  if (supported === false) {
    return (
      <p className="text-xs text-muted">
        This browser doesn't support push notifications.
      </p>
    );
  }
  if (vapidPublicKey === undefined) return null;
  if (vapidPublicKey === null) {
    return (
      <p className="text-xs text-muted">
        Push not configured on this deployment yet — admin needs to set the
        VAPID keys.
      </p>
    );
  }

  const enabled = !!endpoint && permission === "granted";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-ink">
            Browser notifications
          </div>
          <div className="text-xs text-muted">
            Get a desktop / mobile push when a visitor messages you, even when
            the dashboard is closed.
          </div>
        </div>
        <button
          type="button"
          onClick={enabled ? turnOff : turnOn}
          disabled={busy}
          className={
            enabled
              ? "inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-xs font-medium text-ink hover:bg-paper-2 disabled:opacity-50"
              : "inline-flex h-9 items-center rounded-full bg-ink px-4 text-xs font-medium text-paper transition hover:-translate-y-px disabled:opacity-50"
          }
        >
          {busy ? "…" : enabled ? "Turn off" : "Turn on"}
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-300/40 bg-red-50/40 px-3 py-2 text-xs text-red-900"
        >
          {error}
        </div>
      )}
    </div>
  );
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

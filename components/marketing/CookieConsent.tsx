"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "praxtalk_cookie_consent";
const GEO_KEY = "praxtalk_geo_consent";
const GEO_COORDS_KEY = "praxtalk_geo_coords";
const GA_MEASUREMENT_ID = "G-LSQHM1LCTE";

type Consent = "granted" | "denied" | null;
type GeoConsent = "granted" | "denied" | "unsupported" | null;
type GeoCoords = {
  lat: number;
  lng: number;
  accuracy: number;
  capturedAt: number;
};

/**
 * Combined consent gate — visitors must accept BOTH analytics cookies
 * AND share their browser location to use the site. Per business
 * decision (2026-05-04), location is mandatory: the banner is a
 * full-screen blocking modal until the visitor grants browser
 * geolocation permission.
 *
 * Important caveats acknowledged when this was shipped:
 *   - GDPR Art. 7(4) requires consent be "freely given" — making
 *     access conditional on geolocation likely violates that for
 *     EEA/UK/Brazil/India visitors. Liability is on Praxxii Global,
 *     not the platform vendor. See /privacy + /dpa for the public
 *     posture.
 *   - Browsers only fire the geolocation prompt on user gesture,
 *     so the "Allow & continue" button is the trigger.
 *   - If the browser's geolocation API is missing entirely (rare —
 *     old WebViews, some embedded browsers) we mark "unsupported"
 *     and let the visitor proceed; otherwise they'd be locked out
 *     with no recourse.
 *   - If the visitor explicitly denies the browser prompt, we
 *     show a "you can't proceed without location" state with a
 *     "Try again" button. Browser permission can only be re-granted
 *     via browser site settings — we explain that path.
 */
export function CookieConsent() {
  const [cookieConsent, setCookieConsent] = useState<Consent>(null);
  const [geoConsent, setGeoConsent] = useState<GeoConsent>(null);
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    setHydrated(true);
    try {
      const c = localStorage.getItem(STORAGE_KEY);
      if (c === "granted" || c === "denied") setCookieConsent(c);
      const g = localStorage.getItem(GEO_KEY);
      if (g === "granted" || g === "denied" || g === "unsupported") {
        setGeoConsent(g);
      }
    } catch {
      // localStorage unavailable — show banner every visit (safest).
    }
  }, []);

  const allowAndContinue = async () => {
    setBusy(true);
    setGeoError(null);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // Geolocation API not available at all — let them proceed so
      // the site isn't permanently broken on legacy browsers.
      try {
        localStorage.setItem(STORAGE_KEY, "granted");
        localStorage.setItem(GEO_KEY, "unsupported");
      } catch {}
      setCookieConsent("granted");
      setGeoConsent("unsupported");
      setBusy(false);
      return;
    }

    // Trigger the browser permission prompt. Must run inside this
    // click handler — geolocation requires user gesture.
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: GeoCoords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          capturedAt: Date.now(),
        };
        try {
          localStorage.setItem(STORAGE_KEY, "granted");
          localStorage.setItem(GEO_KEY, "granted");
          localStorage.setItem(GEO_COORDS_KEY, JSON.stringify(coords));
        } catch {}
        setCookieConsent("granted");
        setGeoConsent("granted");
        setBusy(false);
      },
      (err) => {
        // err.code: 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE,
        // 3 = TIMEOUT. Only PERMISSION_DENIED is a hard "no";
        // the others can be retried.
        if (err.code === err.PERMISSION_DENIED) {
          try {
            localStorage.setItem(GEO_KEY, "denied");
          } catch {}
          setGeoConsent("denied");
          setGeoError(
            "You denied location access. To continue, re-enable location for this site in your browser's site settings, then click Try again.",
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError(
            "Couldn't determine your location (no GPS / Wi-Fi positioning available right now). Move to a connected area and try again.",
          );
        } else {
          setGeoError(
            "Location request timed out. Please try again.",
          );
        }
        setBusy(false);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60_000 },
    );
  };

  const settled =
    cookieConsent !== null &&
    (geoConsent === "granted" || geoConsent === "unsupported");

  return (
    <>
      {/* GA only fires after BOTH consents are settled. Same as before
          on the cookie side; the geo gate is the new gate. */}
      {cookieConsent === "granted" && (
        <>
          {/* gtag.js loader — external, allowlisted via
              googletagmanager.com in CSP. */}
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
          />
          {/* gtag-init — pinned by sha256 hash in next.config.ts. The
              dangerouslySetInnerHTML content below MUST stay byte-
              identical to scripts/compute-csp-hashes.mjs gtagInit
              constant; otherwise CSP refuses to execute it and GA
              stops reporting. The leading + trailing newline are
              intentional (they're part of the hashed string). */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
`,
            }}
          />
        </>
      )}

      {hydrated && !settled && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Consent required"
          className="fixed inset-0 z-[2147483646] flex items-end justify-center bg-ink/60 p-3 backdrop-blur-sm sm:items-center"
        >
          <div className="w-full max-w-[480px] rounded-2xl border border-rule-2 bg-paper p-5 shadow-2xl sm:p-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              Required to continue
            </div>
            <h3 className="mt-2 text-lg font-semibold tracking-[-0.015em] text-ink">
              Cookies & location
            </h3>

            <ul className="mt-3 flex flex-col gap-2.5 text-[13px] leading-[1.5] text-ink">
              <li className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink" />
                <span>
                  <strong className="font-semibold">Analytics cookie</strong>{" "}
                  (Google Analytics 4) — anonymous, no advertising, no
                  cross-site tracking. Lets us see which pages help and
                  which don&apos;t.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ink" />
                <span>
                  <strong className="font-semibold">Your location</strong>{" "}
                  — sent to operators when you start a chat, so the team
                  can give you region-relevant answers (currency, shipping,
                  business hours).
                </span>
              </li>
            </ul>

            {geoError && (
              <div className="mt-4 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2.5 text-[12px] leading-[1.5] text-ink">
                {geoError}
              </div>
            )}

            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={allowAndContinue}
                disabled={busy}
                className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[13px] font-medium text-paper transition hover:-translate-y-px disabled:opacity-60"
              >
                {busy
                  ? "Requesting location…"
                  : geoConsent === "denied"
                    ? "Try again"
                    : "Allow & continue"}
              </button>
            </div>

            <p className="mt-3 text-[11px] leading-[1.5] text-muted">
              Both items are required to continue using this site. See our{" "}
              <a href="/privacy" className="underline-offset-2 hover:underline">
                privacy policy
              </a>{" "}
              and{" "}
              <a href="/dpa" className="underline-offset-2 hover:underline">
                DPA
              </a>{" "}
              for what we do with this data.
            </p>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Standalone control rendered on /privacy so visitors can revoke
 * cookie consent after the fact. Note: revoking geolocation here
 * does NOT revoke the browser-level grant — the visitor would have
 * to do that in their browser site settings (we link out to docs
 * for the major browsers).
 */
export function CookiePreferences() {
  const [consent, setConsent] = useState<Consent>(null);
  const [geo, setGeo] = useState<GeoConsent>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "granted" || v === "denied") setConsent(v);
      const g = localStorage.getItem(GEO_KEY);
      if (g === "granted" || g === "denied" || g === "unsupported") setGeo(g);
    } catch {}
  }, []);

  const setCookies = (next: "granted" | "denied") => {
    setConsent(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    window.location.reload();
  };

  const revokeGeo = () => {
    try {
      localStorage.removeItem(GEO_KEY);
      localStorage.removeItem(GEO_COORDS_KEY);
    } catch {}
    setGeo(null);
    window.location.reload();
  };

  if (!hydrated) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-rule-2 bg-paper-2/40 p-4">
        <div className="text-[13px] text-ink">
          Cookies:{" "}
          <strong className="font-semibold">
            {consent === "granted"
              ? "Analytics allowed"
              : consent === "denied"
                ? "Analytics declined"
                : "Not set yet"}
          </strong>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={() => setCookies("granted")}
            className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-[12.5px] font-medium hover:bg-paper"
          >
            Allow analytics
          </button>
          <button
            type="button"
            onClick={() => setCookies("denied")}
            className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-[12.5px] font-medium hover:bg-paper"
          >
            Decline analytics
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-rule-2 bg-paper-2/40 p-4">
        <div className="text-[13px] text-ink">
          Location:{" "}
          <strong className="font-semibold">
            {geo === "granted"
              ? "Shared with PraxTalk"
              : geo === "denied"
                ? "Declined"
                : geo === "unsupported"
                  ? "Browser doesn't support geolocation"
                  : "Not set yet"}
          </strong>
        </div>
        <p className="mt-1 text-[11.5px] leading-[1.5] text-muted">
          Revoking here removes the cached coordinates from this device. To
          stop sharing future positions, also revoke the permission in your
          browser settings: Chrome &rarr; Settings &rarr; Privacy &rarr; Site
          Settings &rarr; Location.
        </p>
        {geo && (
          <div className="mt-3">
            <button
              type="button"
              onClick={revokeGeo}
              className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-[12.5px] font-medium hover:bg-paper"
            >
              Revoke location consent
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

const STORAGE_KEY = "praxtalk_cookie_consent";
const GA_MEASUREMENT_ID = "G-LSQHM1LCTE";

type Consent = "granted" | "denied" | null;

/**
 * GDPR + India DPDP requires opt-in before non-essential cookies
 * (analytics, advertising) are set. We default to denied for every
 * visitor — strictest interpretation, works for EU/UK/IN/CCPA.
 *
 * gtag.js is only injected after consent === "granted". The
 * <ConsentBanner> shows on first visit and on any visit where the
 * stored decision is gone (e.g. cookies cleared). The privacy page
 * links here so users can revoke after the fact.
 */
export function CookieConsent() {
  const [consent, setConsent] = useState<Consent>(null);
  const [hydrated, setHydrated] = useState(false);

  // Read prior decision once after hydration to avoid SSR mismatch.
  useEffect(() => {
    setHydrated(true);
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "granted" || v === "denied") setConsent(v);
    } catch {
      // localStorage unavailable (private mode, blocked) — banner
      // shows every visit, which is the safest GDPR posture anyway.
    }
  }, []);

  const decide = (value: "granted" | "denied") => {
    setConsent(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Best effort; if we can't persist, the visitor will see the
      // banner again on next page load.
    }
  };

  return (
    <>
      {/* Inject gtag only when consent is explicit-granted. Removing
          the script tag from the DOM after a visit-time revoke is
          intentionally NOT supported here — gtag.js taints global
          scope (window.dataLayer); a hard reload is required. The
          revoke action sets the stored decision so future loads
          won't inject. */}
      {consent === "granted" && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });
            `}
          </Script>
        </>
      )}

      {hydrated && consent === null && (
        <div
          role="dialog"
          aria-label="Cookie consent"
          aria-live="polite"
          className="fixed inset-x-3 bottom-3 z-[2147483646] sm:inset-x-auto sm:right-4 sm:bottom-4 sm:max-w-[420px]"
        >
          <div className="rounded-2xl border border-rule-2 bg-paper p-4 shadow-[0_24px_48px_-16px_rgba(11,15,18,0.25)]">
            <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
              Cookie consent
            </div>
            <p className="mt-2 text-[13px] leading-[1.55] text-ink">
              We use a single anonymous cookie via Google Analytics 4 to
              understand how visitors discover PraxTalk. No advertising,
              no cross-site tracking. You can change your mind anytime
              from{" "}
              <a
                href="/privacy#cookies"
                className="underline-offset-2 hover:underline"
              >
                /privacy
              </a>
              .
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => decide("granted")}
                className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-[13px] font-medium text-paper transition hover:-translate-y-px"
              >
                Accept
              </button>
              <button
                type="button"
                onClick={() => decide("denied")}
                className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-[13px] font-medium text-ink transition hover:bg-paper-2"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Standalone control rendered on /privacy so visitors can revoke
 * after the fact. Reads + writes the same localStorage key the
 * banner uses.
 */
export function CookiePreferences() {
  const [consent, setConsent] = useState<Consent>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      if (v === "granted" || v === "denied") setConsent(v);
    } catch {}
  }, []);

  const set = (next: "granted" | "denied") => {
    setConsent(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}
    // gtag is global; reload the page so a freshly-denied visitor
    // doesn't keep firing events from the already-loaded script.
    window.location.reload();
  };

  if (!hydrated) return null;
  return (
    <div className="rounded-xl border border-rule-2 bg-paper-2/40 p-4">
      <div className="text-[13px] text-ink">
        Current setting:{" "}
        <strong className="font-semibold">
          {consent === "granted"
            ? "Analytics cookies allowed"
            : consent === "denied"
              ? "Analytics cookies declined"
              : "Not set yet (will see banner on next visit)"}
        </strong>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => set("granted")}
          className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-[12.5px] font-medium hover:bg-paper"
        >
          Allow analytics
        </button>
        <button
          type="button"
          onClick={() => set("denied")}
          className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-[12.5px] font-medium hover:bg-paper"
        >
          Decline analytics
        </button>
      </div>
    </div>
  );
}

import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Accessibility · PraxTalk",
  description:
    "PraxTalk's WCAG 2.1 AA conformance posture, known gaps, and the report-an-issue path for visitors using assistive technology.",
  alternates: { canonical: "/accessibility" },
};

const LAST_REVIEWED = "May 3, 2026";

export default function AccessibilityPage() {
  return (
    <MarketingShell
      eyebrow="Accessibility"
      title="Accessibility statement"
      description={`Conformance posture for praxtalk.com and the operator dashboard. Last reviewed ${LAST_REVIEWED}.`}
    >
      <Section title="Standard">
        <Prose>
          <p>
            PraxTalk targets <strong>WCAG 2.1 Level AA</strong>{" "}
            conformance across the public marketing site, the visitor
            chat widget, and the operator dashboard. We track against
            this standard because it is referenced by the EU
            Accessibility Act (2025), Section 508 (US federal
            procurement), and the AODA (Ontario), which together
            cover the most common procurement requirements we
            encounter.
          </p>
        </Prose>
      </Section>

      <Section title="What's already in place">
        <Prose>
          <ul>
            <li>
              <strong>Skip-to-main-content link</strong> as the first
              focusable element on every page (WCAG 2.4.1).
            </li>
            <li>
              <strong>Visible focus ring</strong> on every
              keyboard-focusable element via{" "}
              <code>*:focus-visible</code> (WCAG 2.4.7), accent-coloured
              for contrast against both paper and ink backgrounds.
            </li>
            <li>
              <strong>Reduced-motion support</strong> —{" "}
              <code>@media (prefers-reduced-motion: reduce)</code>{" "}
              disables the hero gradient animation, console glow,
              slot-pulse, and typing-dot animations (WCAG 2.3.3).
            </li>
            <li>
              <strong>Semantic landmarks</strong> — every page wraps
              its primary content in <code>&lt;main id=&quot;main&quot;&gt;</code>{" "}
              so screen readers and the skip-link both reach it (WCAG
              1.3.1, 2.4.1).
            </li>
            <li>
              <strong>Decorative images marked</strong>{" "}
              <code>aria-hidden</code> — every social icon and
              presentational SVG (WCAG 1.1.1).
            </li>
            <li>
              <strong>Form labels</strong> — every input on{" "}
              <a href="/setup">/setup</a>, <a href="/login">/login</a>,{" "}
              <a href="/sign-up">/sign-up</a>,{" "}
              <a href="/contact">/contact</a>, and{" "}
              <a href="/book-demo">/book-demo</a> uses the{" "}
              <code>&lt;label&gt;</code> + <code>&lt;input&gt;</code>{" "}
              pattern (WCAG 1.3.1, 4.1.2).
            </li>
            <li>
              <strong>Keyboard nav</strong> for the mobile menu,
              cookie consent banner, and approval-decision dropdowns
              — all interactive elements are reachable with Tab and
              actionable with Enter / Space (WCAG 2.1.1).
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="Known gaps">
        <Prose>
          <p>
            PraxTalk has not yet completed an external accessibility
            audit. Internal review surfaced these areas where AA
            conformance is{" "}
            <strong>not yet verified end-to-end</strong>:
          </p>
          <ul>
            <li>
              <strong>Color contrast verification</strong> — The muted
              text color (<code>rgba(15, 26, 18, 0.58)</code> on the
              paper background) measures around 4.5:1, the WCAG AA
              minimum for normal text. Border-line; an external auditor
              may flag specific instances under bright conditions.
            </li>
            <li>
              <strong>Operator dashboard (/app)</strong> — Inbox row
              keyboard navigation, conversation pane focus management,
              and the activity feed have not been formally screen-reader
              tested with NVDA / VoiceOver / JAWS.
            </li>
            <li>
              <strong>Visitor widget</strong> — runs inside a shadow
              DOM with its own CSS reset; assistive-technology
              behaviour with the embedded widget on customer sites
              has not been formally tested.
            </li>
            <li>
              <strong>Booking page (/book/:slug)</strong> — slot picker
              uses keyboard-actionable buttons but the layout is
              dense; an auditor may recommend explicit ARIA grouping.
            </li>
            <li>
              <strong>Animated screenshots and PDFs</strong> — None
              are currently shipped, but if/when they are, captions +
              transcripts will be required (WCAG 1.2.1, 1.2.2).
            </li>
          </ul>
        </Prose>
      </Section>

      <Section title="Roadmap to a third-party VPAT">
        <Prose>
          <p>
            A formal{" "}
            <abbr title="Voluntary Product Accessibility Template">
              VPAT 2.4
            </abbr>{" "}
            / Accessibility Conformance Report (ACR) by an
            independent auditor is on the v1.0 roadmap. Until that
            ships, this page is the most current statement of
            conformance posture; it&apos;s reviewed quarterly and
            updated whenever a known gap is closed.
          </p>
        </Prose>
      </Section>

      <Section title="Reporting an issue">
        <Prose>
          <p>
            If you encounter an accessibility barrier on PraxTalk —
            broken focus order, an image without alt text, contrast
            below AA on a specific element, anything — email{" "}
            <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a>{" "}
            with the page URL and a short description. We aim to
            respond within 2 business days and ship a fix (or a
            documented workaround) within 30 days for AA-blocking
            issues.
          </p>
          <p className="text-sm italic text-muted">
            This statement is reviewed by the PraxTalk team on a
            quarterly cadence. Last reviewed {LAST_REVIEWED}.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

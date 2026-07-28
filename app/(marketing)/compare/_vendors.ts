/**
 * Per-vendor copy for the /compare/<slug> long-tail SEO pages.
 * Keep claims dated + sourced — every "as of May 3, 2026" anchors
 * the page to a verifiable point in time. When a vendor ships
 * pricing or feature changes, bump verifiedOn + the relevant
 * paragraph; do not silently update without re-anchoring.
 */
export type Vendor = {
  slug: string;
  name: string;
  trademark: string;
  positioning: string;
  pricingUrl: string;
  pricingNote: string;
  weakSpot: string;
  praxStrength: string;
  verifiedOn: string;
};

export const VENDORS: Vendor[] = [
  {
    slug: "intercom",
    name: "Intercom",
    trademark: "Intercom is a trademark of Intercom Inc.",
    positioning:
      "Intercom is the legacy heavyweight in conversational support — strong on sales-led teams with seat budgets, weaker on transparent pricing.",
    pricingUrl: "https://www.intercom.com/pricing",
    pricingNote:
      "$29 / seat / month entry, with the AI agent (Fin) charging $0.99 per resolution on top — total cost for a 5-seat team running 1k AI resolutions per month is roughly $1,135 / mo.",
    weakSpot:
      "Per-resolution AI billing makes spend unpredictable; multi-brand requires a separate workspace per brand at full per-seat cost.",
    praxStrength:
      "PraxTalk bundles AI auto-replies into the plan tier and ships multi-brand on a single workspace — same operator roster, brand-scoped access. The Spark tier covers 100 AI resolutions / month at $0 with no card.",
    verifiedOn: "May 3, 2026",
  },
  {
    slug: "crisp",
    name: "Crisp",
    trademark: "Crisp is a trademark of Crisp IM SAS.",
    positioning:
      "Crisp is the European indie-friendly chat tool — generous free tier, clean design, weaker AI agent and no autonomous-resolution story.",
    pricingUrl: "https://crisp.chat/en/pricing/",
    pricingNote:
      "Free tier covers 2 seats; Mini at €25/site/mo and Essentials at €95/site/mo are per-website (so multi-brand teams pay per brand).",
    weakSpot:
      "AI is limited to MagicReply suggestions — operator must accept; no confidence-thresholded auto-reply. Knowledge base import is manual.",
    praxStrength:
      "PraxTalk's Atlas auto-sends above a threshold you control, drafts below it. Knowledge base ingests from a single URL via website crawl + sitemap parse — no manual paste needed.",
    verifiedOn: "May 3, 2026",
  },
  {
    slug: "livechat",
    name: "LiveChat",
    trademark: "LiveChat is a trademark of Text Sp. z o.o.",
    positioning:
      "LiveChat is the established commerce-focused chat tool — strong reporting, clunky integrations, AI is an add-on with separate pricing.",
    pricingUrl: "https://www.livechat.com/pricing/",
    pricingNote:
      "Starter at $20/seat/mo entry — AI features (ChatBot integration, AI Assistant) require additional ChatBot subscription billed separately.",
    weakSpot:
      "AI lives in a sister product (ChatBot) with its own billing. Multi-channel (WhatsApp / voice) requires Business or Enterprise tier.",
    praxStrength:
      "PraxTalk ships AI, multi-channel (chat + email + WhatsApp + voice + SMS + in-app), and multi-brand in every paid tier including the free Spark.",
    verifiedOn: "May 3, 2026",
  },
  {
    slug: "drift",
    name: "Drift",
    trademark: "Drift is a trademark of Salesloft, Inc.",
    positioning:
      "Drift is the conversational-marketing tool — sales-heavy positioning, sales-heavy price tag, custom-quoted plans only.",
    pricingUrl: "https://www.drift.com/pricing/",
    pricingNote:
      "No public pricing — all tiers are custom-quoted. Reported entry around $2,500 / mo for the Premium tier on third-party review sites.",
    weakSpot:
      "Opaque pricing and a long sales cycle. No self-serve trial; demo-gated entry.",
    praxStrength:
      "PraxTalk pricing is on a public page (/pricing) at $0, $49, $199, custom. Self-serve signup, no demo required, no card required. Spark tier proves out the platform before any paid commitment.",
    verifiedOn: "May 3, 2026",
  },
  {
    slug: "hubspot-chat",
    name: "HubSpot Chat",
    trademark: "HubSpot is a trademark of HubSpot, Inc.",
    positioning:
      "HubSpot Chat is part of the larger Service Hub — bundled value if you're already on HubSpot CRM, awkward standalone.",
    pricingUrl: "https://www.hubspot.com/pricing/service-hub",
    pricingNote:
      "Free tier exists with HubSpot CRM; AI features require Service Hub Professional at $90/seat/mo (5-seat minimum) or Enterprise at $150/seat/mo.",
    weakSpot:
      "Best-in-class only if you're already paying for HubSpot CRM. AI auto-resolution is limited and locked to higher-tier seats.",
    praxStrength:
      "PraxTalk works regardless of CRM choice — leads sync via webhooks or REST API to whatever CRM you actually use (HubSpot included, plus Salesforce, Linear, custom).",
    verifiedOn: "May 3, 2026",
  },
  {
    slug: "tawk-to",
    name: "Tawk.to",
    trademark: "Tawk.to is a trademark of Tawk.to Inc.",
    positioning:
      "Tawk.to is the free-forever live chat — generous on seats, near-zero on AI, monetises via paid agent labour and add-on AI assist.",
    pricingUrl: "https://www.tawk.to/pricing/",
    pricingNote:
      "Free for unlimited operators on the standard tier; paid add-ons include AI Assist at $29/agent/mo and Hire-A-Live-Agent at $1/hr.",
    weakSpot:
      "AI Assist is reactive (suggests, doesn't auto-resolve). Branding (Tawk.to badge) requires a paid removal. No multi-brand workspace model.",
    praxStrength:
      "PraxTalk's Spark tier removes the badge at $49/mo (Team) or stays free with the badge — same ergonomics as Tawk's free tier but with a real autonomous AI layer Atlas, not assist-only suggestions.",
    verifiedOn: "May 3, 2026",
  },
];

export function vendorBySlug(slug: string): Vendor | undefined {
  return VENDORS.find((v) => v.slug === slug);
}

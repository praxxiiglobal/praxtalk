import { NextResponse } from "next/server";
import { CONVEX_CLIENT_BUNDLE } from "./_bundle";

export const dynamic = "force-static";
export const revalidate = 300; // 5 minutes — widget changes propagate quickly

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

// HTML + scoped CSS for the widget. Declared before SOURCE so the template
// literal below can reference it.
const WIDGET_SHELL = `
<style>
  :host {
    all: initial;
    --praxtalk-accent: #0F1A12;
    --praxtalk-paper: #F1EFE3;
    --praxtalk-ink: #0F1A12;
    /* Edge offsets are overridden per-widget when multiple PraxTalk
       snippets share a page so bubbles don't overlap. Brand position
       config flips between right/left by setting the *-right vars to
       auto and the *-left vars to a numeric offset. */
    --praxtalk-bubble-right: 20px;
    --praxtalk-bubble-left: auto;
    --praxtalk-panel-right: 20px;
    --praxtalk-panel-left: auto;
  }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif; }
  .bubble {
    position: fixed; bottom: 20px;
    right: var(--praxtalk-bubble-right);
    left: var(--praxtalk-bubble-left);
    width: 56px; height: 56px; border-radius: 999px;
    background: var(--praxtalk-accent); color: #fff;
    border: none; cursor: pointer;
    box-shadow: 0 8px 24px -8px rgba(0,0,0,0.35);
    display: grid; place-items: center;
    transition: transform 0.15s ease;
  }
  .bubble:hover { transform: translateY(-2px); }
  .bubble.hidden { display: none; }
  .bubble svg { width: 24px; height: 24px; }
  .panel {
    position: fixed; bottom: 20px;
    right: var(--praxtalk-panel-right);
    left: var(--praxtalk-panel-left);
    width: 360px; max-width: calc(100vw - 32px);
    height: 540px; max-height: calc(100vh - 32px);
    background: #fff; color: var(--praxtalk-ink);
    border-radius: 16px; overflow: hidden;
    box-shadow: 0 24px 48px -12px rgba(0,0,0,0.25), 0 8px 16px -8px rgba(0,0,0,0.15);
    display: none; flex-direction: column;
    transform-origin: bottom right;
  }
  .panel.open { display: flex; animation: slide 0.18s ease; }
  @keyframes slide { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .head {
    background: var(--praxtalk-accent); color: #fff;
    padding: 14px 16px; display: flex; align-items: center; gap: 10px;
  }
  .title { font-weight: 600; font-size: 15px; flex: 1; letter-spacing: -0.01em; }
  .human {
    background: rgba(255,255,255,0.15); color: #fff; border: none;
    height: 26px; padding: 0 10px; border-radius: 999px;
    cursor: pointer; font-size: 11.5px; font-weight: 500;
    font-family: inherit;
    transition: background 0.15s ease, opacity 0.15s ease;
  }
  .human:hover { background: rgba(255,255,255,0.25); }
  .human:disabled { opacity: 0.7; cursor: default; }
  .human.hidden { display: none; }
  .close { background: rgba(255,255,255,0.15); color: #fff; border: none;
    width: 28px; height: 28px; border-radius: 999px; cursor: pointer; font-size: 16px; line-height: 1; }
  .close:hover { background: rgba(255,255,255,0.25); }
  .body { flex: 1; display: flex; flex-direction: column; min-height: 0; background: #fafaf6; }

  /* Pre-chat form view */
  .form-view { display: flex; flex-direction: column; gap: 10px; padding: 16px; overflow-y: auto; }
  .form-view.hidden { display: none; }
  .welcome { font-size: 13px; line-height: 1.45; color: #555; margin-bottom: 4px; }
  /* wa.me lite — small click-to-chat link inside form-view (welcome
     strip). Hidden by default; shown via .show when the brand config
     carries a waMePhone. Anchors look like links, not buttons. */
  .wa-link {
    display: none; align-items: center; gap: 6px; margin-top: 2px; margin-bottom: 6px;
    font-size: 12.5px; color: #25D366; text-decoration: none;
    font-weight: 500; padding: 6px 8px; border-radius: 8px;
    background: rgba(37, 211, 102, 0.08); align-self: flex-start;
    transition: background 0.15s ease;
  }
  .wa-link.show { display: inline-flex; }
  .wa-link:hover { background: rgba(37, 211, 102, 0.16); }
  .wa-link svg { width: 14px; height: 14px; flex-shrink: 0; }

  /* Chooser view — shown first when waMePhone is set + the visitor
     hasn't picked a channel yet. Two big buttons: "Chat with us"
     (opens form-view) and "Chat on WhatsApp" (opens wa.me link). */
  .chooser-view {
    display: flex; flex-direction: column; gap: 12px;
    padding: 20px 16px; overflow-y: auto;
  }
  .chooser-view.hidden { display: none; }
  .chooser-title {
    font-size: 15px; font-weight: 600; color: var(--praxtalk-ink); margin: 0;
  }
  .chooser-sub {
    font-size: 13px; line-height: 1.45; color: #555; margin: 0;
  }
  .chooser-options {
    display: flex; flex-direction: column; gap: 8px; margin-top: 8px;
  }
  .chooser-btn {
    display: flex; align-items: center; gap: 10px;
    border: 1px solid rgba(0,0,0,0.10); background: #fff; border-radius: 12px;
    padding: 12px 14px; cursor: pointer; font-family: inherit; text-align: left;
    text-decoration: none; color: inherit; transition: border-color 0.15s ease, transform 0.05s ease;
  }
  .chooser-btn:hover { border-color: rgba(0,0,0,0.25); }
  .chooser-btn:active { transform: translateY(1px); }
  .chooser-btn .icon {
    flex-shrink: 0; width: 36px; height: 36px; border-radius: 10px;
    display: grid; place-items: center;
  }
  .chooser-btn .icon.chat { background: var(--praxtalk-accent); color: #fff; }
  .chooser-btn .icon.wa { background: rgba(37, 211, 102, 0.12); color: #25D366; }
  .chooser-btn .icon svg { width: 18px; height: 18px; }
  .chooser-btn .label { font-size: 14px; font-weight: 600; line-height: 1.2; color: var(--praxtalk-ink); }
  .chooser-btn .hint { font-size: 11.5px; color: #777; line-height: 1.35; margin-top: 2px; }
  .chooser-btn .text { display: flex; flex-direction: column; min-width: 0; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .field label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6b5d; font-weight: 500; }
  .field input, .field textarea, .field select {
    border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    padding: 10px 12px; font-size: 14px; outline: none;
    font-family: inherit; background: #fff; color: var(--praxtalk-ink);
  }
  .field input:focus, .field textarea:focus, .field select:focus { border-color: var(--praxtalk-accent); }
  .field textarea { resize: none; min-height: 76px; }
  .phone-row { display: grid; grid-template-columns: 110px 1fr; gap: 6px; }
  .phone-row select { padding-left: 8px; padding-right: 8px; font-size: 13px; }
  .form-error { font-size: 12px; color: #c0392b; min-height: 14px; }
  .form-submit {
    margin-top: 4px;
    background: var(--praxtalk-accent); color: #fff; border: none;
    height: 42px; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 500;
    transition: opacity 0.15s ease;
  }
  .form-submit:hover { opacity: 0.92; }
  .form-submit:disabled { opacity: 0.6; cursor: not-allowed; }

  /* Lobby intake view */
  .lobby-view { display: flex; flex-direction: column; gap: 10px; padding: 16px; overflow-y: auto; }
  .lobby-view.hidden { display: none; }
  .lobby-title { font-size: 14px; font-weight: 500; color: var(--praxtalk-ink); margin: 0; }
  .lobby-fields { display: flex; flex-direction: column; gap: 10px; }
  .lobby-error { font-size: 12px; color: #c0392b; min-height: 14px; }

  /* Chat view */
  .chat-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .chat-view.hidden { display: none; }
  .list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .empty { color: #6b6b5d; font-size: 13px; text-align: center; margin: auto 0; padding: 24px; }
  .msg {
    max-width: 80%; padding: 9px 12px; border-radius: 14px;
    font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word;
  }
  .msg.visitor { align-self: flex-end; background: var(--praxtalk-accent); color: #fff; border-top-right-radius: 4px; }
  .msg.operator { align-self: flex-start; background: #fff; color: var(--praxtalk-ink); border: 1px solid rgba(0,0,0,0.06); border-top-left-radius: 4px; }
  .msg.atlas { align-self: flex-start; background: #FFF7DD; color: var(--praxtalk-ink); border-top-left-radius: 4px; }
  .msg.system { align-self: center; background: rgba(0,0,0,0.04); color: #6b6b5d; font-size: 11px; padding: 4px 10px; }
  .msg.system-join { align-self: center; background: rgba(0,0,0,0.04); color: #6b6b5d; font-size: 11px; padding: 4px 10px; border-radius: 10px; font-style: italic; }
  .msg-row { display: flex; flex-direction: column; gap: 2px; }
  .msg-row.visitor { align-items: flex-end; }
  .msg-row.operator, .msg-row.atlas { align-items: flex-start; }
  .msg-sender { font-size: 11px; color: #6b6b5d; padding: 0 4px; font-weight: 500; }
  .composer { display: flex; align-items: flex-end; gap: 6px; padding: 10px; border-top: 1px solid rgba(0,0,0,0.06); background: #fff; }
  .input { flex: 1; resize: none; border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    padding: 8px 10px; font-size: 14px; outline: none; min-height: 38px; max-height: 120px;
    font-family: inherit; }
  .input:focus { border-color: var(--praxtalk-accent); }
  .send { background: var(--praxtalk-accent); color: #fff; border: none;
    width: 38px; height: 38px; border-radius: 10px; cursor: pointer; font-size: 16px; }
  .send:hover { opacity: 0.9; }
  .geo { background: transparent; color: var(--praxtalk-ink); border: 1px solid rgba(0,0,0,0.12);
    width: 38px; height: 38px; border-radius: 10px; cursor: pointer;
    display: grid; place-items: center; transition: background 0.15s ease, opacity 0.15s ease; }
  .geo:hover { background: rgba(0,0,0,0.04); }
  .geo:disabled { opacity: 0.5; cursor: progress; }
  .geo svg { width: 18px; height: 18px; }
  .geo.hidden { display: none; }
  .footer { padding: 6px 12px; font-size: 10px; color: #999; text-align: center; background: #fff; }
  .footer a { color: inherit; text-decoration: none; }
</style>

<button class="bubble" aria-label="Open chat">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
</button>

<div class="panel" role="dialog" aria-label="Chat">
  <div class="head">
    <div class="title">Chat</div>
    <button class="human hidden" type="button" aria-label="Talk to a human">Talk to a human</button>
    <button class="close" aria-label="Close">×</button>
  </div>
  <div class="body">
    <div class="chooser-view hidden">
      <h3 class="chooser-title">How would you like to chat?</h3>
      <p class="chooser-sub">Pick the channel you prefer — both reach the same team.</p>
      <div class="chooser-options">
        <button class="chooser-btn chooser-chat" type="button">
          <span class="icon chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </span>
          <span class="text">
            <span class="label">Chat with us here</span>
            <span class="hint">Live chat in this window — fastest reply.</span>
          </span>
        </button>
        <a class="chooser-btn chooser-wa" target="_blank" rel="noopener noreferrer" href="#">
          <span class="icon wa">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
            </svg>
          </span>
          <span class="text">
            <span class="label">Chat on WhatsApp</span>
            <span class="hint">Opens in WhatsApp — best if you'd rather use your phone.</span>
          </span>
        </a>
      </div>
    </div>
    <form class="form-view" novalidate>
      <p class="welcome">Tell us a bit about yourself and we'll get the right person on it.</p>
      <a class="wa-link" target="_blank" rel="noopener noreferrer" href="#">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z"/>
        </svg>
        Prefer WhatsApp? →
      </a>
      <div class="field">
        <label for="ptk-name">Name</label>
        <input id="ptk-name" name="name" type="text" required placeholder="Your name" autocomplete="name" />
      </div>
      <div class="field">
        <label for="ptk-email">Email</label>
        <input id="ptk-email" name="email" type="email" required placeholder="you@example.com" autocomplete="email" />
      </div>
      <div class="field">
        <label for="ptk-phone">Phone</label>
        <div class="phone-row">
          <select id="ptk-cc" name="cc" aria-label="Country code">
            <option value="+1">🇺🇸 +1</option>
            <option value="+44">🇬🇧 +44</option>
            <option value="+91" selected>🇮🇳 +91</option>
            <option value="+61">🇦🇺 +61</option>
            <option value="+971">🇦🇪 +971</option>
            <option value="+65">🇸🇬 +65</option>
            <option value="+49">🇩🇪 +49</option>
            <option value="+33">🇫🇷 +33</option>
            <option value="+81">🇯🇵 +81</option>
            <option value="+86">🇨🇳 +86</option>
          </select>
          <input id="ptk-phone" name="phone" type="tel" required placeholder="9876543210" autocomplete="tel" inputmode="numeric" />
        </div>
      </div>
      <div class="field">
        <label for="ptk-message">Message</label>
        <textarea id="ptk-message" name="message" required placeholder="How can we help?"></textarea>
      </div>
      <div class="form-error" role="alert"></div>
      <button type="submit" class="form-submit">Start chat →</button>
    </form>

    <form class="lobby-view hidden" novalidate>
      <p class="lobby-title">Help us route you</p>
      <div class="lobby-fields"></div>
      <div class="lobby-error" role="alert"></div>
      <button type="submit" class="form-submit">Continue →</button>
    </form>

    <div class="chat-view hidden">
      <div class="list"></div>
      <div class="composer">
        <button class="geo" type="button" aria-label="Share my location" title="Share my location">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
        </button>
        <textarea class="input" rows="1" placeholder="Type a message…"></textarea>
        <button class="send" aria-label="Send">↑</button>
      </div>
    </div>
    <div class="footer">Powered by <a href="https://www.praxtalk.com" target="_blank" rel="noopener">PraxTalk</a></div>
  </div>
</div>
`;

const SOURCE = /* javascript */ `(() => {
  // Per-widget guard: a single page may load multiple PraxTalk
  // snippets (one per brand). We keep a Set of mounted widget ids
  // so the same brand never instantiates twice, but different
  // brands can co-exist with their bubbles staggered horizontally.
  if (!window.__PRAXTALK_WIDGETS__) {
    window.__PRAXTALK_WIDGETS__ = new Set();
  }

  const CONVEX_URL = ${JSON.stringify(CONVEX_URL)};
  const VISITOR_KEY_STORAGE = "praxtalk_visitor_key";
  const VISITOR_PROFILE_STORAGE = "praxtalk_visitor_profile";
  const LOBBY_DONE_STORAGE = "praxtalk_lobby_done";

  function loadLobbyDone() {
    try {
      return new Set(JSON.parse(localStorage.getItem(LOBBY_DONE_STORAGE) || "[]"));
    } catch { return new Set(); }
  }
  function markLobbyDone(key) {
    try {
      const set = loadLobbyDone();
      set.add(key);
      localStorage.setItem(LOBBY_DONE_STORAGE, JSON.stringify(Array.from(set)));
    } catch {}
  }

  // Resolve widget id from the snippet that loaded us.
  // Prefer data-widget-id (post multi-brand) but accept legacy data-workspace-id.
  const scriptEl =
    document.currentScript ||
    document.querySelector("script[src*='praxtalk.com/widget.js'], script[src*='/widget.js']");
  const widgetId =
    (scriptEl && scriptEl.dataset && (scriptEl.dataset.widgetId || scriptEl.dataset.workspaceId)) || null;
  if (!widgetId) {
    console.warn("[PraxTalk] missing data-widget-id on script tag.");
    return;
  }
  if (window.__PRAXTALK_WIDGETS__.has(widgetId)) {
    // This brand's widget is already mounted on the page (e.g. duplicate
    // snippet inserted by a tag manager). Skip silently.
    return;
  }
  // Slot index drives the bubble's horizontal offset so multiple
  // widgets stagger side-by-side instead of stacking on top of each
  // other. Captured BEFORE we mark this widget loaded.
  const slotIndex = window.__PRAXTALK_WIDGETS__.size;
  window.__PRAXTALK_WIDGETS__.add(widgetId);
  if (!CONVEX_URL) {
    console.warn("[PraxTalk] backend URL not configured.");
    return;
  }

  // Anonymous visitor key — stable per browser via localStorage.
  let visitorKey;
  try {
    visitorKey = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (!visitorKey) {
      visitorKey =
        "v_" +
        (crypto.randomUUID
          ? crypto.randomUUID().replace(/-/g, "")
          : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(VISITOR_KEY_STORAGE, visitorKey);
    }
  } catch {
    visitorKey = "v_anon_" + Math.random().toString(36).slice(2);
  }

  // Cached profile (Name/Email/Phone) per browser. If present, the form
  // is skipped on subsequent visits.
  function loadProfile() {
    try {
      const raw = localStorage.getItem(VISITOR_PROFILE_STORAGE);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  }
  function saveProfile(p) {
    try { localStorage.setItem(VISITOR_PROFILE_STORAGE, JSON.stringify(p)); } catch {}
  }

  // Inject host container with shadow DOM so host page styles don't bleed in.
  const host = document.createElement("div");
  host.id = "praxtalk-host-" + widgetId;
  host.style.cssText = "position:fixed;z-index:2147483646;bottom:0;right:0;";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = ${JSON.stringify(WIDGET_SHELL)};

  // Multi-widget layout: each subsequent widget on the same page
  // shifts its bubble + panel left by 76px so they don't overlap.
  // The CSS reads --praxtalk-bubble-right / --praxtalk-panel-right
  // from this :host element so the slot index is honoured per widget.
  if (slotIndex > 0) {
    const offsetPx = 20 + slotIndex * 76;
    host.style.setProperty("--praxtalk-bubble-right", offsetPx + "px");
    host.style.setProperty("--praxtalk-panel-right", offsetPx + "px");
  }

  const els = {
    bubble: root.querySelector(".bubble"),
    panel: root.querySelector(".panel"),
    title: root.querySelector(".title"),
    body: root.querySelector(".body"),
    formView: root.querySelector(".form-view"),
    waLink: root.querySelector(".wa-link"),
    chooserView: root.querySelector(".chooser-view"),
    chooserChat: root.querySelector(".chooser-chat"),
    chooserWa: root.querySelector(".chooser-wa"),
    chatView: root.querySelector(".chat-view"),
    formError: root.querySelector(".form-error"),
    submit: root.querySelector(".form-submit"),
    name: root.querySelector("#ptk-name"),
    email: root.querySelector("#ptk-email"),
    cc: root.querySelector("#ptk-cc"),
    phone: root.querySelector("#ptk-phone"),
    message: root.querySelector("#ptk-message"),
    list: root.querySelector(".list"),
    input: root.querySelector(".input"),
    sendBtn: root.querySelector(".send"),
    geoBtn: root.querySelector(".geo"),
    humanBtn: root.querySelector(".human"),
    closeBtn: root.querySelector(".close"),
    lobbyView: root.querySelector(".lobby-view"),
    lobbyTitle: root.querySelector(".lobby-title"),
    lobbyFields: root.querySelector(".lobby-fields"),
    lobbyError: root.querySelector(".lobby-error"),
  };

  // If the browser doesn't expose Geolocation (very old / locked-down
  // contexts) hide the share-location button entirely.
  if (!("geolocation" in navigator)) {
    els.geoBtn.classList.add("hidden");
  }

  let panelOpen = false;
  function setOpen(next) {
    panelOpen = next;
    els.panel.classList.toggle("open", next);
    els.bubble.classList.toggle("hidden", next);
  }
  els.bubble.addEventListener("click", () => setOpen(true));
  els.closeBtn.addEventListener("click", () => setOpen(false));

  function showChat() {
    els.chooserView.classList.add("hidden");
    els.formView.classList.add("hidden");
    els.lobbyView.classList.add("hidden");
    els.chatView.classList.remove("hidden");
    els.humanBtn.classList.remove("hidden");
    setTimeout(() => els.input.focus(), 50);
  }
  function showForm() {
    els.chooserView.classList.add("hidden");
    els.chatView.classList.add("hidden");
    els.lobbyView.classList.add("hidden");
    els.formView.classList.remove("hidden");
    els.humanBtn.classList.add("hidden");
    setTimeout(() => els.name.focus(), 50);
  }
  function showLobby() {
    els.chooserView.classList.add("hidden");
    els.formView.classList.add("hidden");
    els.chatView.classList.add("hidden");
    els.lobbyView.classList.remove("hidden");
    els.humanBtn.classList.add("hidden");
  }
  function showChooser() {
    els.formView.classList.add("hidden");
    els.lobbyView.classList.add("hidden");
    els.chatView.classList.add("hidden");
    els.chooserView.classList.remove("hidden");
    els.humanBtn.classList.add("hidden");
  }

  // Visitor's persisted channel choice. Keyed by widgetId so a
  // single browser visiting two brands' sites can hold separate
  // preferences. Used to skip the chooser on revisit.
  function loadChannelChoice() {
    try {
      return localStorage.getItem("praxtalk_channel_" + widgetId) || null;
    } catch { return null; }
  }
  function saveChannelChoice(choice) {
    try { localStorage.setItem("praxtalk_channel_" + widgetId, choice); } catch {}
  }

  // Render lobby fields from the config returned by lobby:getForWidget.
  // Returns an array of [fieldId, getValue, isValid, label] tuples for
  // the submit handler to read out of the DOM.
  function renderLobbyFields(config) {
    els.lobbyTitle.textContent = config.title;
    els.lobbyFields.innerHTML = "";
    const handles = [];
    for (const f of config.fields) {
      const wrap = document.createElement("div");
      wrap.className = "field";
      const label = document.createElement("label");
      label.textContent = f.label + (f.required ? " *" : "");
      label.htmlFor = "ptk-lobby-" + f.id;
      wrap.appendChild(label);
      let input;
      if (f.type === "textarea") {
        input = document.createElement("textarea");
      } else if (f.type === "select") {
        input = document.createElement("select");
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "— Select —";
        input.appendChild(blank);
        for (const opt of (f.options || [])) {
          const o = document.createElement("option");
          o.value = opt;
          o.textContent = opt;
          input.appendChild(o);
        }
      } else {
        input = document.createElement("input");
        input.type =
          f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text";
      }
      input.id = "ptk-lobby-" + f.id;
      if (f.placeholder) input.placeholder = f.placeholder;
      if (f.required) input.required = true;
      wrap.appendChild(input);
      els.lobbyFields.appendChild(wrap);
      handles.push({ field: f, input });
    }
    return handles;
  }

  function bubble(role, body, senderName) {
    const wrap = document.createElement("div");
    wrap.className = "msg-row " + role;
    if (senderName) {
      const label = document.createElement("div");
      label.className = "msg-sender";
      label.textContent = senderName;
      wrap.appendChild(label);
    }
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = body;
    wrap.appendChild(div);
    return wrap;
  }

  // Synthesised "Sarah joined the chat" row inserted the first time
  // each operator's name appears in the conversation. Visitor never
  // sees raw operator IDs — just the human "Sarah joined" handoff.
  function joinedRow(senderName) {
    const div = document.createElement("div");
    div.className = "msg system-join";
    div.textContent = senderName + " joined the chat";
    return div;
  }

  function renderMessages(messages) {
    els.list.innerHTML = "";
    if (!messages || messages.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Send a message — we'll reply right here.";
      els.list.appendChild(empty);
      return;
    }
    const seenOps = new Set();
    for (const m of messages) {
      if (m.role === "operator" && m.senderName && !seenOps.has(m.senderName)) {
        seenOps.add(m.senderName);
        els.list.appendChild(joinedRow(m.senderName));
      }
      els.list.appendChild(bubble(m.role, m.body, m.senderName));
    }
    els.list.scrollTop = els.list.scrollHeight;
  }

  function applyConfig(config) {
    if (!config) return;
    els.title.textContent = config.brandName || config.workspaceName || "Chat";
    if (config.primaryColor) {
      root.host.style.setProperty("--praxtalk-accent", config.primaryColor);
    }
    if (config.position === "bl") {
      // Flip to bottom-left while keeping the per-widget stagger.
      const offsetPx = 20 + slotIndex * 76;
      host.style.setProperty("--praxtalk-bubble-right", "auto");
      host.style.setProperty("--praxtalk-bubble-left", offsetPx + "px");
      host.style.setProperty("--praxtalk-panel-right", "auto");
      host.style.setProperty("--praxtalk-panel-left", offsetPx + "px");
    }
    // wa.me lite — pre-set the href on every wa link in the DOM
    // (welcome-strip escape hatch + chooser-screen big button).
    // applyConfig only flips them visible; the chooser itself is
    // surfaced via showChooser() based on visitor state.
    if (config.waMePhone) {
      const phone = String(config.waMePhone).replace(/[^\d]/g, "");
      if (phone) {
        const msg = config.waMePrefilledMessage
          ? "?text=" + encodeURIComponent(String(config.waMePrefilledMessage))
          : "";
        const href = "https://wa.me/" + phone + msg;
        if (els.waLink) {
          els.waLink.setAttribute("href", href);
          els.waLink.classList.add("show");
        }
        if (els.chooserWa) {
          els.chooserWa.setAttribute("href", href);
        }
      }
    }
  }

  /**
   * Best-effort IP + location lookup. IP geolocation is approximate —
   * Indian / cellular ISPs commonly route through metro POPs, so the
   * "city" is often the ISP exit, not the actual visitor location.
   *
   * We try ipinfo.io first (slightly better last-mile accuracy in our
   * tests), and fall back to ipapi.co if that fails. Failures are
   * non-fatal — chat still works without geo data.
   */
  async function fetchVisitorGeo() {
    // Try ipinfo.io — they return "loc": "lat,lng" as a single string.
    try {
      const res = await fetch("https://ipinfo.io/json", { cache: "no-store" });
      if (res.ok) {
        const d = await res.json();
        if (d && d.ip) {
          const [latStr, lngStr] = (d.loc || "").split(",");
          return {
            ip: d.ip,
            location: {
              country: undefined,
              countryCode: d.country || undefined,
              region: d.region || undefined,
              city: d.city || undefined,
              lat: latStr ? Number(latStr) : undefined,
              lng: lngStr ? Number(lngStr) : undefined,
              timezone: d.timezone || undefined,
            },
          };
        }
      }
    } catch { /* fall through */ }

    // Fallback: ipapi.co
    try {
      const res = await fetch("https://ipapi.co/json/", { cache: "no-store" });
      if (!res.ok) return null;
      const d = await res.json();
      return {
        ip: d.ip,
        location: {
          country: d.country_name || undefined,
          countryCode: d.country_code || undefined,
          region: d.region || undefined,
          city: d.city || undefined,
          lat: typeof d.latitude === "number" ? d.latitude : undefined,
          lng: typeof d.longitude === "number" ? d.longitude : undefined,
          timezone: d.timezone || undefined,
        },
      };
    } catch { return null; }
  }

  // ── Bootstrap Convex client and wire everything up ────────────────────
  // The Convex browser client is pre-bundled into this file (see the
  // top of SOURCE) and exposed as globalThis.__PRAXTALK_CONVEX__.
  // No runtime CDN fetch needed.
  Promise.resolve()
    .then(async () => {
      const ConvexClient = globalThis.__PRAXTALK_CONVEX__?.ConvexClient;
      if (!ConvexClient) throw new Error("ConvexClient not found in bundled module");
      const client = new ConvexClient(CONVEX_URL);

      const config = await client.query("widgets:getConfigByWidgetId", { widgetId });
      if (!config) {
        console.warn("[PraxTalk] unknown widget id:", widgetId);
        return;
      }
      applyConfig(config);

      // Optional lobby intake config — null if not enabled for this brand.
      let lobbyConfig = null;
      try {
        lobbyConfig = await client.query("lobby:getForWidget", { widgetId });
      } catch (err) {
        console.warn("[PraxTalk] couldn't load lobby config", err);
      }

      const cachedProfile = loadProfile();
      let conversationId = null;
      let lobbyDone = loadLobbyDone();

      // After identifyAndStartConversation lands and we know conversationId,
      // either show the lobby form (if configured + not submitted) or jump
      // straight into chat. Returns true if we showed lobby, false if we
      // skipped to chat.
      function maybeShowLobby() {
        if (lobbyConfig && lobbyConfig.fields.length > 0 && !lobbyDone.has(visitorKey)) {
          const handles = renderLobbyFields(lobbyConfig);
          els.lobbyView._handles = handles;
          showLobby();
          return true;
        }
        showChat();
        return false;
      }

      async function startConversation(profile, firstMessage) {
        const geo = await fetchVisitorGeo();
        const result = await client.mutation(
          "visitors:identifyAndStartConversation",
          {
            widgetId,
            visitorKey,
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            ip: geo ? geo.ip : undefined,
            location: geo ? geo.location : undefined,
          },
        );
        conversationId = result.conversationId;

        // Subscribe to messages.
        client.onUpdate(
          "visitors:listMessagesForVisitor",
          { widgetId, visitorKey, conversationId },
          renderMessages,
          (err) => console.error("[PraxTalk] message subscription failed", err),
        );

        // Send the first message from the form.
        if (firstMessage && firstMessage.trim()) {
          await client.mutation("visitors:sendVisitorMessage", {
            widgetId,
            visitorKey,
            conversationId,
            body: firstMessage,
          });
        }
      }

      // ── Channel-chooser gate ─────────────────────────────────────
      // If the brand has wa.me lite configured AND the visitor
      // hasn't already picked a channel for this widget AND there's
      // no resumeable session, show the two-button chooser first.
      // Otherwise fall through to the legacy direct-to-form/chat path.
      const channelChoice = loadChannelChoice();
      const hasResumeableSession =
        cachedProfile && cachedProfile.name && cachedProfile.email && cachedProfile.phone;

      // Hook up the chooser buttons regardless — even visitors who
      // skipped the chooser this load can land here next visit.
      els.chooserChat.addEventListener("click", () => {
        saveChannelChoice("chat");
        // Fall back into the same logic the bypass path uses below,
        // by re-running the resume check or showing the form.
        if (hasResumeableSession) {
          // Just show the chat shell; subscription was already wired
          // up if we got here through the resume path. If not, click
          // through form is simpler than re-implementing the resume.
          showForm();
        } else {
          showForm();
        }
      });
      els.chooserWa.addEventListener("click", (e) => {
        // Don't rely solely on the anchor's default <a target="_blank">
        // navigation — it's flaky inside Shadow DOM contexts (some
        // browsers ignore the target attribute, others race the
        // setTimeout below). Explicitly call window.open and fall back
        // to same-tab navigation if a popup blocker eats it.
        e.preventDefault();
        const href = els.chooserWa.getAttribute("href");
        if (!href || href === "#") {
          console.warn("[PraxTalk] WhatsApp link href not set");
          return;
        }
        saveChannelChoice("wa");
        const opened = window.open(href, "_blank", "noopener,noreferrer");
        if (!opened) {
          // Popup blocker or in-app browser — fall back to current tab.
          window.location.href = href;
          return;
        }
        setTimeout(() => setOpen(false), 250);
      });

      const showChooserFirst =
        config.waMePhone && !channelChoice && !hasResumeableSession;

      if (showChooserFirst) {
        showChooser();
      } else if (hasResumeableSession) {
        // Subscribe / start a conversation without the form re-prompt.
        try {
          const geo = await fetchVisitorGeo();
          const result = await client.mutation(
            "visitors:identifyAndStartConversation",
            {
              widgetId,
              visitorKey,
              name: cachedProfile.name,
              email: cachedProfile.email,
              phone: cachedProfile.phone,
              ip: geo ? geo.ip : undefined,
              location: geo ? geo.location : undefined,
            },
          );
          conversationId = result.conversationId;
          client.onUpdate(
            "visitors:listMessagesForVisitor",
            { widgetId, visitorKey, conversationId },
            renderMessages,
          );
          maybeShowLobby();
        } catch (err) {
          console.error("[PraxTalk] resume failed, falling back to form", err);
          showForm();
        }
      } else {
        showForm();
      }

      // Form submission flow.
      els.formView.addEventListener("submit", async (e) => {
        e.preventDefault();
        els.formError.textContent = "";
        const name = els.name.value.trim();
        const email = els.email.value.trim();
        const phoneRaw = els.phone.value.trim();
        const message = els.message.value.trim();

        if (!name || !email || !phoneRaw || !message) {
          els.formError.textContent = "All fields are required.";
          return;
        }
        if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
          els.formError.textContent = "Please enter a valid email.";
          return;
        }
        const digits = phoneRaw.replace(/[^0-9]/g, "");
        if (digits.length < 6) {
          els.formError.textContent = "Please enter a valid phone number.";
          return;
        }
        const phone = els.cc.value + digits;
        const profile = { name, email, phone };

        els.submit.disabled = true;
        els.submit.textContent = "Starting…";
        try {
          await startConversation(profile, message);
          saveProfile(profile);
          maybeShowLobby();
        } catch (err) {
          console.error("[PraxTalk] failed to start conversation", err);
          els.formError.textContent = "Couldn't reach our servers. Please try again.";
        } finally {
          els.submit.disabled = false;
          els.submit.textContent = "Start chat →";
        }
      });

      // Lobby submit — collect answers, send to lobby:submitIntake,
      // mark done locally, then drop the user into chat.
      els.lobbyView.addEventListener("submit", async (e) => {
        e.preventDefault();
        els.lobbyError.textContent = "";
        if (!conversationId || !lobbyConfig) return;
        const handles = els.lobbyView._handles || [];
        const answers = {};
        for (const h of handles) {
          const value = (h.input.value || "").trim();
          if (h.field.required && !value) {
            els.lobbyError.textContent = "Please fill in the required fields.";
            return;
          }
          if (value) answers[h.field.id] = value;
        }
        const submitBtn = els.lobbyView.querySelector(".form-submit");
        submitBtn.disabled = true;
        const original = submitBtn.textContent;
        submitBtn.textContent = "Saving…";
        try {
          await client.mutation("lobby:submitIntake", {
            widgetId,
            visitorKey,
            conversationId,
            answers: JSON.stringify(answers),
          });
          markLobbyDone(visitorKey);
          lobbyDone = loadLobbyDone();
          showChat();
        } catch (err) {
          console.error("[PraxTalk] lobby submit failed", err);
          els.lobbyError.textContent = "Couldn't save your answers. Try again.";
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = original;
        }
      });

      async function send() {
        if (!conversationId) return;
        const text = els.input.value.trim();
        if (!text) return;
        els.input.value = "";
        els.list.appendChild(bubble("visitor", text));
        els.list.scrollTop = els.list.scrollHeight;
        try {
          await client.mutation("visitors:sendVisitorMessage", {
            widgetId,
            visitorKey,
            conversationId,
            body: text,
          });
        } catch (err) {
          console.error("[PraxTalk] send failed", err);
        }
      }
      els.sendBtn.addEventListener("click", send);
      els.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });

      // Share-location button. Triggers the browser's native geolocation
      // permission prompt directly — no custom rationale card. On allow,
      // we POST the precise lat/lng to the backend and drop a local
      // "Location shared" system bubble. On block/error, we surface a
      // brief inline note so the visitor isn't left wondering.
      function showSystem(text) {
        els.list.appendChild(bubble("system", text));
        els.list.scrollTop = els.list.scrollHeight;
      }
      els.geoBtn.addEventListener("click", () => {
        if (!conversationId || !navigator.geolocation) return;
        els.geoBtn.disabled = true;
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            try {
              await client.mutation("visitors:setPreciseLocation", {
                widgetId,
                visitorKey,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
              showSystem("📍 Location shared with the team.");
            } catch (err) {
              console.error("[PraxTalk] location share failed", err);
              showSystem("Couldn't share your location. Please try again.");
            } finally {
              els.geoBtn.disabled = false;
            }
          },
          (err) => {
            els.geoBtn.disabled = false;
            // err.code: 1=denied, 2=unavailable, 3=timeout
            if (err && err.code === 1) {
              showSystem("Location permission was blocked. You can enable it in your browser's site settings.");
            } else {
              showSystem("Couldn't get your location.");
            }
          },
          { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
        );
      });

      // "Talk to a human" button. Pauses Atlas on the conversation
      // and pushes a workspace notification so an operator jumps in.
      // Idempotent server-side, but we also lock the button locally
      // after first success so the visitor knows the team's been alerted.
      let humanRequested = false;
      els.humanBtn.addEventListener("click", async () => {
        if (!conversationId || humanRequested) return;
        els.humanBtn.disabled = true;
        const original = els.humanBtn.textContent;
        els.humanBtn.textContent = "Alerting…";
        try {
          await client.mutation("visitors:requestHumanAgent", {
            widgetId,
            visitorKey,
            conversationId,
          });
          humanRequested = true;
          els.humanBtn.textContent = "✓ Team alerted";
          showSystem("We've alerted the team — a human will join shortly.");
        } catch (err) {
          console.error("[PraxTalk] requestHumanAgent failed", err);
          els.humanBtn.disabled = false;
          els.humanBtn.textContent = original;
          showSystem("Couldn't alert the team. Please try again.");
        }
      });
    })
    .catch((err) => {
      console.error("[PraxTalk] failed to load widget runtime", err);
    });
})();
`;

export async function GET() {
  // Prefix with the pre-bundled Convex browser client so the widget
  // ships fully self-contained. Bundle exposes ConvexClient on
  // globalThis.__PRAXTALK_CONVEX__.
  const body = `${CONVEX_CLIENT_BUNDLE}\n${SOURCE}`;
  return new NextResponse(body, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

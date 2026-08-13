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
  /* Boot state: invisible until applyConfig runs, so visitors never
     see the unbranded default (black bubble + glyph) flash before the
     brand color and logo arrive. */
  .bubble.preboot { visibility: hidden; }
  .bubble-logo {
    width: 44px; height: 44px; border-radius: 50%;
    background: #fff; object-fit: contain; padding: 4px;
    box-sizing: border-box; display: none;
  }
  .bubble.has-logo svg { display: none; }
  .bubble.has-logo .bubble-logo { display: block; }
  .head-logo {
    width: 32px; height: 32px; border-radius: 50%;
    background: #fff; object-fit: contain; padding: 3px;
    box-sizing: border-box; display: none; flex-shrink: 0;
  }
  .head.has-logo .head-logo { display: block; }
  .msg-line { display: flex; align-items: flex-end; gap: 6px; max-width: 100%; }
  .msg-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    background: #fff; object-fit: contain; padding: 2px;
    box-sizing: border-box; border: 1px solid rgba(0,0,0,0.08);
    flex-shrink: 0;
  }
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
  .head-text { flex: 1; min-width: 0; }
  .title { font-weight: 600; font-size: 15px; letter-spacing: -0.01em; }
  .head-status { font-size: 11px; color: rgba(255,255,255,0.85); display: flex; align-items: center; gap: 5px; margin-top: 1px; }
  .head-status-dot { width: 7px; height: 7px; border-radius: 50%; background: #7CE3B1; flex-shrink: 0; }
  .call {
    background: rgba(255,255,255,0.15); color: #fff;
    width: 28px; height: 28px; border-radius: 999px;
    display: grid; place-items: center; text-decoration: none;
    transition: background 0.15s ease;
  }
  .call:hover { background: rgba(255,255,255,0.25); }
  .call.hidden { display: none; }
  .call svg { width: 14px; height: 14px; }
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

  /* Chat view */
  .chat-view { flex: 1; display: flex; flex-direction: column; min-height: 0; }
  .chat-view.hidden { display: none; }
  .list { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
  .empty { color: #6b6b5d; font-size: 13px; text-align: center; margin: auto 0; padding: 24px; }
  .msg-att {
    display: flex; align-items: center; gap: 6px; margin-top: 6px;
    font-size: 12.5px; font-weight: 500; color: inherit;
    text-decoration: underline; text-underline-offset: 2px;
    word-break: break-word;
  }
  .msg-att-img {
    display: block; max-width: 200px; max-height: 160px;
    border-radius: 10px; margin-top: 6px;
    border: 1px solid rgba(0,0,0,0.08);
  }
  /* Agent-typing indicator — sits between the message list and the
     composer, styled as an incoming message bubble (brand avatar +
     three animated dots). Hidden via [hidden] when nobody's typing. */
  .typing-row { display: flex; align-items: flex-end; gap: 6px; padding: 0 16px 8px; }
  .typing-row[hidden] { display: none; }
  .typing-avatar {
    width: 22px; height: 22px; border-radius: 50%;
    background: #fff; object-fit: contain; padding: 2px;
    box-sizing: border-box; border: 1px solid rgba(0,0,0,0.08);
    flex-shrink: 0; display: none;
  }
  .typing-row.has-logo .typing-avatar { display: block; }
  .typing-bubble {
    background: #fff; border: 1px solid rgba(0,0,0,0.06);
    border-radius: 14px; border-top-left-radius: 4px;
    padding: 11px 13px; display: inline-flex; align-items: center;
  }
  .typing-dots { display: inline-flex; gap: 3px; }
  .typing-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--praxtalk-accent, #6b6b5d); opacity: 0.4; animation: praxtalk-typing 1.2s infinite ease-in-out; }
  .typing-dots i:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots i:nth-child(3) { animation-delay: 0.4s; }
  @keyframes praxtalk-typing { 0%, 60%, 100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-3px); } }
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
  /* Inline identity card — appears between message list and composer
     after the visitor's first message, asking for name/email/phone.
     All optional; visitor can skip. Once submitted or skipped, we
     don't show it again on this browser. */
  .identity-card {
    display: none;
    flex-direction: column;
    gap: 8px;
    padding: 12px 14px;
    border-top: 1px solid rgba(0,0,0,0.06);
    background: rgba(0,0,0,0.025);
  }
  .identity-card.show { display: flex; }
  .identity-card-title { font-size: 13px; font-weight: 600; color: var(--praxtalk-ink); margin: 0; }
  .identity-card-sub { font-size: 11.5px; color: #6b6b5d; margin: 0 0 2px; line-height: 1.35; }
  .identity-card input {
    border: 1px solid rgba(0,0,0,0.12); border-radius: 8px;
    padding: 7px 10px; font-size: 13px; outline: none;
    font-family: inherit; background: #fff; color: var(--praxtalk-ink);
  }
  .identity-card input:focus { border-color: var(--praxtalk-accent); }
  .identity-card-error { font-size: 11px; color: #c0392b; min-height: 14px; }
  .identity-card-actions { display: flex; gap: 8px; align-items: center; margin-top: 2px; }
  .identity-card-skip {
    background: transparent; border: none; color: #777;
    font-size: 12px; cursor: pointer; font-family: inherit; padding: 0;
  }
  .identity-card-skip:hover { color: var(--praxtalk-ink); }
  .identity-card-submit {
    flex: 1; background: var(--praxtalk-accent); color: #fff; border: none;
    height: 34px; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 500; font-family: inherit;
    transition: opacity 0.15s ease;
  }
  .identity-card-submit:hover { opacity: 0.92; }
  .identity-card-submit:disabled { opacity: 0.6; cursor: not-allowed; }
  .footer { padding: 6px 12px; font-size: 10px; color: #999; text-align: center; background: #fff; }
  .footer a { color: inherit; text-decoration: none; }
  .bubble .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 20px;
    height: 20px;
    padding: 0 5px;
    border-radius: 10px;
    background: #ef4444;
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 20px;
    text-align: center;
    box-shadow: 0 1px 4px rgba(0,0,0,.3);
  }
  .bubble .badge.hidden { display: none; }
</style>

<button class="bubble preboot" aria-label="Open chat">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
  <img class="bubble-logo" alt="" />
  <span class="badge hidden" aria-label="Unread messages"></span>
</button>

<div class="panel" role="dialog" aria-label="Chat">
  <div class="head">
    <img class="head-logo" alt="" />
    <div class="head-text">
      <div class="title">Chat</div>
      <div class="head-status"><span class="head-status-dot"></span>Online now</div>
    </div>
    <a class="call hidden" href="#" aria-label="Call us">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    </a>
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

    <div class="chat-view hidden">
      <div class="list"></div>
      <div class="identity-card" role="region" aria-label="Tell us about you">
        <p class="identity-card-title">Mind sharing your details?</p>
        <p class="identity-card-sub">All optional — helps us follow up if we get disconnected.</p>
        <input class="identity-name" type="text" placeholder="Your name" autocomplete="name" />
        <input class="identity-email" type="email" placeholder="Email (optional)" autocomplete="email" />
        <input class="identity-phone" type="tel" placeholder="Phone (optional)" autocomplete="tel" />
        <div class="identity-card-error" role="alert"></div>
        <div class="identity-card-actions">
          <button class="identity-card-skip" type="button">Skip for now</button>
          <button class="identity-card-submit" type="button">Share</button>
        </div>
      </div>
      <div class="typing-row" hidden>
        <img class="typing-avatar" alt="" />
        <span class="typing-bubble"><span class="typing-dots"><i></i><i></i><i></i></span></span>
      </div>
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
  // crypto.randomUUID is available in every browser PraxTalk
  // supports (Chrome 92+, Firefox 95+, Safari 15.4+ — all 2022+).
  // The previous Math.random fallback was a leftover from when we
  // shipped to older browsers; non-crypto randomness is predictable
  // enough that two visitors loading the widget within the same ms
  // could collide on visitorKey.
  let visitorKey;
  try {
    visitorKey = localStorage.getItem(VISITOR_KEY_STORAGE);
    if (!visitorKey) {
      visitorKey = "v_" + crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(VISITOR_KEY_STORAGE, visitorKey);
    }
  } catch {
    // localStorage might be disabled (incognito + cookies disabled,
    // some browsers' iframe sandboxing). Fall through with a fresh
    // ephemeral crypto-grade key per page load — chat works for
    // this session, identity won't persist across reloads.
    visitorKey = "v_anon_" + crypto.randomUUID().replace(/-/g, "");
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
    bubbleLogo: root.querySelector(".bubble-logo"),
    badge: root.querySelector(".bubble .badge"),
    panel: root.querySelector(".panel"),
    head: root.querySelector(".head"),
    headLogo: root.querySelector(".head-logo"),
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
    typingRow: root.querySelector(".typing-row"),
    typingAvatar: root.querySelector(".typing-avatar"),
    geoBtn: root.querySelector(".geo"),
    callBtn: root.querySelector(".call"),
    closeBtn: root.querySelector(".close"),
    identityCard: root.querySelector(".identity-card"),
    identityName: root.querySelector(".identity-name"),
    identityEmail: root.querySelector(".identity-email"),
    identityPhone: root.querySelector(".identity-phone"),
    identityError: root.querySelector(".identity-card-error"),
    identitySkip: root.querySelector(".identity-card-skip"),
    identitySubmit: root.querySelector(".identity-card-submit"),
  };

  // Local "we already asked" flag, keyed per widget so visiting two
  // brand sites from one browser doesn't suppress both prompts.
  function identityAskedKey(wid) {
    return "praxtalk_identity_asked_" + wid;
  }
  function isIdentityAsked() {
    try { return localStorage.getItem(identityAskedKey(widgetId)) === "1"; }
    catch { return false; }
  }
  function markIdentityAsked() {
    try { localStorage.setItem(identityAskedKey(widgetId), "1"); } catch {}
  }
  // Which agent identity-request (by timestamp) this browser has already
  // acted on, so a reconnect/reload doesn't re-pop the same request, but
  // a NEW request (later timestamp) does.
  function identityReqActedKey(wid) {
    return "praxtalk_identity_req_" + wid;
  }
  function getIdentityReqActed() {
    try {
      return Number(localStorage.getItem(identityReqActedKey(widgetId))) || 0;
    } catch { return 0; }
  }
  function setIdentityReqActed(ts) {
    try { localStorage.setItem(identityReqActedKey(widgetId), String(ts)); }
    catch {}
  }

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
    if (next) markAllSeen();
  }
  els.bubble.addEventListener("click", () => setOpen(true));
  els.closeBtn.addEventListener("click", () => setOpen(false));

  // ── Unread badge + ding + tab-title counter ──────────────────
  // An agent reply that lands while the panel is closed (or the tab
  // is hidden) must be impossible to miss: red count on the bubble,
  // "(n) " prefixed to the page title so background tabs show it,
  // and a soft two-tone ding. The seen-watermark persists per widget
  // so page navigations don't re-announce old messages.
  function seenAtKey() {
    return "praxtalk_seen_at_" + widgetId;
  }
  function loadSeenAt() {
    try {
      return Number(localStorage.getItem(seenAtKey()) || 0);
    } catch {
      return 0;
    }
  }
  function saveSeenAt(ts) {
    try {
      localStorage.setItem(seenAtKey(), String(ts));
    } catch {}
  }
  let latestAgentMsgAt = 0;
  let lastDingAt = 0;
  let baseTitle = null;
  function setUnreadCount(n) {
    if (!els.badge) return;
    if (n > 0) {
      els.badge.textContent = n > 9 ? "9+" : String(n);
      els.badge.classList.remove("hidden");
      if (baseTitle === null) baseTitle = document.title;
      document.title = "(" + n + ") " + baseTitle;
    } else {
      els.badge.classList.add("hidden");
      if (baseTitle !== null) {
        document.title = baseTitle;
        baseTitle = null;
      }
    }
  }
  // WebAudio ding — browsers only allow sound after the visitor has
  // interacted with the page at least once, so the context is
  // created/resumed on the first gesture and playback is best-effort
  // (a silent miss is fine; the badge still shows).
  let audioCtx = null;
  function ensureAudio() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") {
        audioCtx.resume().catch(function () {});
      }
      return audioCtx;
    } catch {
      return null;
    }
  }
  document.addEventListener("pointerdown", ensureAudio, {
    once: true,
    capture: true,
  });
  document.addEventListener("keydown", ensureAudio, {
    once: true,
    capture: true,
  });
  function playDing() {
    const ctx = ensureAudio();
    if (!ctx || ctx.state !== "running") return;
    try {
      const t = ctx.currentTime;
      [880, 1174.66].forEach(function (freq, i) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, t + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + 0.35);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + 0.4);
      });
    } catch {}
  }
  function isViewingChat() {
    return panelOpen && document.visibilityState === "visible";
  }
  function updateUnread(messages) {
    const agentMsgs = (messages || []).filter(function (m) {
      return m.role === "operator" || m.role === "atlas";
    });
    if (agentMsgs.length === 0) return;
    latestAgentMsgAt = agentMsgs.reduce(function (mx, m) {
      return Math.max(mx, m.createdAt || 0);
    }, 0);
    if (isViewingChat()) {
      saveSeenAt(latestAgentMsgAt);
      setUnreadCount(0);
      return;
    }
    const seenAt = loadSeenAt();
    const fresh = agentMsgs.filter(function (m) {
      return (m.createdAt || 0) > seenAt;
    });
    setUnreadCount(fresh.length);
    if (fresh.length > 0 && latestAgentMsgAt > lastDingAt) {
      lastDingAt = latestAgentMsgAt;
      playDing();
    }
  }
  function markAllSeen() {
    if (latestAgentMsgAt > 0) saveSeenAt(latestAgentMsgAt);
    setUnreadCount(0);
  }
  document.addEventListener("visibilitychange", function () {
    if (isViewingChat()) markAllSeen();
  });
  // Subscription callback: paint the thread, then reconcile unread
  // state (both message-subscription call sites use this wrapper).
  function onMessages(list) {
    renderMessages(list);
    updateUnread(list);
  }

  function showChat() {
    els.chooserView.classList.add("hidden");
    els.formView.classList.add("hidden");
    els.chatView.classList.remove("hidden");
    setTimeout(() => els.input.focus(), 50);
  }
  function showForm() {
    els.chooserView.classList.add("hidden");
    els.chatView.classList.add("hidden");
    els.formView.classList.remove("hidden");
    setTimeout(() => els.name.focus(), 50);
  }
  function showChooser() {
    els.formView.classList.add("hidden");
    els.chatView.classList.add("hidden");
    els.chooserView.classList.remove("hidden");
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
    renderMsgBody(div, body);
    // Brand logo as a mini avatar beside agent replies (only when the
    // brand has one configured — plain rows otherwise, zero layout
    // change for visitor/system messages).
    if (role === "operator" && brandLogoUrl) {
      const line = document.createElement("div");
      line.className = "msg-line";
      const av = document.createElement("img");
      av.className = "msg-avatar";
      av.src = brandLogoUrl;
      av.alt = "";
      av.onerror = function () { av.style.display = "none"; };
      line.appendChild(av);
      line.appendChild(div);
      wrap.appendChild(line);
    } else {
      wrap.appendChild(div);
    }
    return wrap;
  }

  // Formatting markers — mirror of the CRM's parser (ChatTab.tsx):
  // *bold*, _italic_, {red|colored}. Markers must hug their content
  // and stay on one line; anything else renders literally. Built with
  // DOM APIs only (no innerHTML) and — IMPORTANT — zero backslashes
  // and zero regexes, because this lives inside a template literal
  // where escapes get cooked away (see the renderMsgBody note below).
  const FMT_COLORS_LIGHT = {
    red: "#D93025",
    green: "#188038",
    blue: "#1A73E8",
    orange: "#E8710A",
  };
  const FMT_COLORS_DARK = {
    red: "#FF8A80",
    green: "#7CE3B1",
    blue: "#8AB4F8",
    orange: "#FDD663",
  };
  function appendFormatted(el, text, onDark) {
    const FMT_NL = String.fromCharCode(10);
    const palette = onDark ? FMT_COLORS_DARK : FMT_COLORS_LIGHT;
    let plain = "";
    function flush() {
      if (plain) {
        el.appendChild(document.createTextNode(plain));
        plain = "";
      }
    }
    let i = 0;
    while (i < text.length) {
      const ch = text.charAt(i);
      const nlAt = text.indexOf(FMT_NL, i + 1);
      const lineEnd = nlAt === -1 ? text.length : nlAt;
      if (ch === "*" || ch === "_") {
        const atBoundary =
          i === 0 ||
          text.charAt(i - 1) === " " ||
          text.charAt(i - 1) === FMT_NL;
        const close = text.indexOf(ch, i + 1);
        if (
          atBoundary &&
          close > i + 1 &&
          close < lineEnd &&
          text.charAt(i + 1) !== " " &&
          text.charAt(close - 1) !== " "
        ) {
          flush();
          const tag = document.createElement(ch === "*" ? "strong" : "em");
          // Recurse so styles stack: *_text_* → bold italic, and
          // *_{red|text}_* → bold italic red. Each level strips its
          // own markers, so this always terminates.
          appendFormatted(tag, text.slice(i + 1, close), onDark);
          el.appendChild(tag);
          i = close + 1;
          continue;
        }
      } else if (ch === "{") {
        const bar = text.indexOf("|", i + 1);
        // Balanced-brace scan — mirror of the CRM parser: nested color
        // wraps close at the matching brace so the innermost color wins.
        let cbrace = -1;
        let depth = 0;
        for (let k = i + 1; k < lineEnd; k++) {
          const c2 = text.charAt(k);
          if (c2 === "{") depth += 1;
          else if (c2 === "}") {
            if (depth === 0) {
              cbrace = k;
              break;
            }
            depth -= 1;
          }
        }
        if (bar !== -1 && bar < cbrace && cbrace > bar + 1) {
          const cname = text.slice(i + 1, bar).trim().toLowerCase();
          if (palette[cname]) {
            flush();
            const span = document.createElement("span");
            span.style.color = palette[cname];
            appendFormatted(span, text.slice(bar + 1, cbrace), onDark);
            el.appendChild(span);
            i = cbrace + 1;
            continue;
          }
        }
      }
      plain += ch;
      i += 1;
    }
    flush();
  }

  // Agent attachments arrive as "clip <name> / <url>" text blocks (the
  // CRM appends them — its API only carries a body string). Render
  // them as tappable cards / inline images instead of raw URLs.
  // IMPORTANT: this code lives inside a template literal, so backslash
  // escapes get cooked away — everything here is written WITHOUT
  // backslashes (no regex escapes, String.fromCharCode for newline).
  function renderMsgBody(div, body) {
    const NL = String.fromCharCode(10);
    const lines = String(body).split(NL);
    const attachments = [];
    const textLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const next = i + 1 < lines.length ? lines[i + 1] : "";
      if (line.indexOf("📎 ") === 0 && next.indexOf("http") === 0) {
        attachments.push({ name: line.slice(2).trim(), url: next.trim() });
        i++;
      } else {
        textLines.push(line);
      }
    }
    // Visitor bubbles sit on the accent color (white text) — use the
    // light-on-dark color variants there so colored text stays legible.
    const onDark = String(div.className).indexOf("visitor") !== -1;
    if (attachments.length === 0) {
      appendFormatted(div, body, onDark);
      return;
    }
    const text = textLines.join(NL).trim();
    if (text) {
      const t = document.createElement("div");
      appendFormatted(t, text, onDark);
      div.appendChild(t);
    }
    const imgExts = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp"];
    for (const a of attachments) {
      // Only render real http(s) links. Explicit scheme check (not a
      // loose "http" prefix) so nothing like javascript:/data: can
      // ever reach an href — belt-and-braces on the customer's page.
      if (a.url.indexOf("http://") !== 0 && a.url.indexOf("https://") !== 0) {
        continue;
      }
      const link = document.createElement("a");
      link.href = a.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const lower = a.name.toLowerCase();
      let isImg = false;
      for (const ext of imgExts) {
        if (lower.length > ext.length && lower.indexOf(ext) === lower.length - ext.length) {
          isImg = true;
          break;
        }
      }
      if (isImg) {
        const img = document.createElement("img");
        img.src = a.url;
        img.alt = a.name;
        img.className = "msg-att-img";
        link.appendChild(img);
        link.title = a.name + " — tap to open full size";
      } else {
        link.className = "msg-att";
        link.textContent = "📎 " + a.name + " — tap to open";
      }
      div.appendChild(link);
    }
  }

  // Synthesised hand-off rows: "Sarah joined the chat" for the first
  // agent, "Chat transferred to Nick" whenever a different agent takes
  // over — same wording rules as the CRM's own thread view. Visitor
  // never sees raw operator IDs, only the human hand-off story.
  function joinedRow(text) {
    const div = document.createElement("div");
    div.className = "msg system-join";
    div.textContent = text;
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
    let lastOp = null;
    for (const m of messages) {
      if (m.role === "operator" && m.senderName && m.senderName !== lastOp) {
        els.list.appendChild(
          joinedRow(
            lastOp === null
              ? m.senderName + " joined the chat"
              : "Chat transferred to " + m.senderName,
          ),
        );
        lastOp = m.senderName;
      }
      els.list.appendChild(bubble(m.role, m.body, m.senderName));
    }
    els.list.scrollTop = els.list.scrollHeight;
  }

  // Brand logo (from config.avatarUrl). Read by bubble() to draw the
  // mini avatar beside agent replies; set once in applyConfig.
  let brandLogoUrl = null;

  function applyConfig(config) {
    if (!config) return;
    // Reveal the launcher — it boots hidden (.preboot) so visitors
    // never see the unbranded default flash before branding applies.
    if (els.bubble) els.bubble.classList.remove("preboot");
    // Per-brand logo: bubble icon (unless the brand opted for the
    // classic glyph), header chip, message avatars, and the typing
    // bubble. onerror falls back to the glyph so a dead URL can never
    // leave the bubble blank. The remove-branches matter: config gets
    // applied twice (cached copy first, then fresh) so a logo removed
    // in the brand editor must also clear here.
    const logoUrl = config.avatarUrl || null;
    brandLogoUrl = logoUrl;
    if (els.bubbleLogo && els.bubble) {
      if (logoUrl && config.bubbleIcon !== "glyph") {
        els.bubbleLogo.src = logoUrl;
        els.bubbleLogo.onerror = function () {
          els.bubble.classList.remove("has-logo");
        };
        els.bubble.classList.add("has-logo");
      } else {
        els.bubble.classList.remove("has-logo");
      }
    }
    if (els.headLogo && els.head) {
      if (logoUrl) {
        els.headLogo.src = logoUrl;
        els.headLogo.onerror = function () {
          els.head.classList.remove("has-logo");
        };
        els.head.classList.add("has-logo");
      } else {
        els.head.classList.remove("has-logo");
      }
    }
    if (els.typingAvatar && els.typingRow) {
      if (logoUrl) {
        els.typingAvatar.src = logoUrl;
        els.typingAvatar.onerror = function () {
          els.typingRow.classList.remove("has-logo");
        };
        els.typingRow.classList.add("has-logo");
      } else {
        els.typingRow.classList.remove("has-logo");
      }
    }
    // Mobile-only call button (replaces the old "Talk to a human"
    // affordance): when the brand has a click-to-chat phone and the
    // visitor is on a phone themselves, the header shows a tap-to-call
    // icon instead.
    if (els.callBtn && config.waMePhone) {
      const callPhone = String(config.waMePhone).replace(/[^0-9]/g, "");
      const isMobileUA = /Android|iPhone|iPad|iPod|Mobi/i.test(
        navigator.userAgent,
      );
      if (callPhone && isMobileUA) {
        els.callBtn.setAttribute("href", "tel:+" + callPhone);
        els.callBtn.classList.remove("hidden");
      }
    }
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
      const phone = String(config.waMePhone).replace(/[^0-9]/g, "");
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

      // Config cache: apply the last-seen config instantly so repeat
      // visitors get the branded bubble with zero flash, then fetch
      // fresh config and re-apply + cache. First-ever visitors keep
      // the bubble hidden for the one round-trip instead of seeing
      // the unbranded default flip to the brand look.
      let cachedCfg = null;
      try {
        const raw = localStorage.getItem("praxtalk_cfg_" + widgetId);
        cachedCfg = raw ? JSON.parse(raw) : null;
      } catch {}
      if (cachedCfg) applyConfig(cachedCfg);

      const config = await client.query("widgets:getConfigByWidgetId", { widgetId });
      if (!config) {
        console.warn("[PraxTalk] unknown widget id:", widgetId);
        return;
      }
      try {
        localStorage.setItem("praxtalk_cfg_" + widgetId, JSON.stringify(config));
      } catch {}
      applyConfig(config);

      const cachedProfile = loadProfile();
      let conversationId = null;
      // Track how many messages the visitor has sent this session.
      // Used to trigger the inline identity card after the first send.
      let visitorMessageCount = 0;

      // ── Typing indicators ─────────────────────────────────────────
      // Show "Agent is typing…" while the operator pings. RECEIPT-BASED
      // on purpose: the ping carries a SERVER timestamp, and comparing
      // it against this device's Date.now() breaks whenever the
      // visitor's clock is a few seconds off (dots never showed on
      // skewed machines). So we never compare clocks — a CHANGED value
      // means fresh typing, and the hide timer runs purely on the local
      // clock. The first update after subscribing only seeds the
      // baseline so a stale ping from an earlier visit can't flash the
      // dots on load. And ping PraxTalk (debounced) while the visitor
      // types so the operator sees dots on the CRM side.
      const TYPING_TTL_MS = 6000;
      let operatorTypingTimer = null;
      let lastOperatorTypingAt = null;
      let typingBaselineSeeded = false;
      function hideOperatorTyping() {
        if (operatorTypingTimer) {
          clearTimeout(operatorTypingTimer);
          operatorTypingTimer = null;
        }
        els.typingRow.hidden = true;
      }
      function showOperatorTyping(ts) {
        if (!typingBaselineSeeded) {
          typingBaselineSeeded = true;
          lastOperatorTypingAt = ts || null;
          return;
        }
        if (!ts) {
          lastOperatorTypingAt = null;
          hideOperatorTyping();
          return;
        }
        if (ts === lastOperatorTypingAt) return;
        lastOperatorTypingAt = ts;
        if (operatorTypingTimer) clearTimeout(operatorTypingTimer);
        els.typingRow.hidden = false;
        els.list.scrollTop = els.list.scrollHeight;
        operatorTypingTimer = setTimeout(() => {
          operatorTypingTimer = null;
          els.typingRow.hidden = true;
        }, TYPING_TTL_MS);
      }
      function subscribeToTyping(convoId) {
        typingBaselineSeeded = false;
        lastOperatorTypingAt = null;
        hideOperatorTyping();
        client.onUpdate(
          "typing:getTypingForVisitor",
          { widgetId, visitorKey, conversationId: convoId },
          (state) => {
            showOperatorTyping(state && state.operatorTypingAt);
            // Agent asked (from the CRM) to re-request the visitor's
            // details. Fires the moment it arrives — overriding a prior
            // skip. Acted-timestamp in localStorage prevents re-popping
            // the same request on reconnect while still honoring a newer
            // request.
            if (state && state.identityRequestedAt) {
              if (state.identityRequestedAt > getIdentityReqActed()) {
                setIdentityReqActed(state.identityRequestedAt);
                showIdentityCard();
              }
            }
          },
          (err) => console.error("[PraxTalk] typing subscription failed", err),
        );
      }
      let lastTypingPingAt = 0;
      function pingVisitorTyping() {
        if (!conversationId) return;
        const now = Date.now();
        if (now - lastTypingPingAt < 2000) return; // ~1 ping / 2s
        lastTypingPingAt = now;
        client
          .mutation("typing:setVisitorTyping", {
            widgetId,
            visitorKey,
            conversationId,
          })
          .catch(() => {});
      }

      async function startConversation(profile) {
        const geo = await fetchVisitorGeo();
        const result = await client.mutation(
          "visitors:identifyAndStartConversation",
          {
            widgetId,
            visitorKey,
            // All identity fields are optional — for anonymous chat
            // (the new default flow) we pass undefined for everything
            // and the visitor row gets created empty.
            name: profile?.name,
            email: profile?.email,
            phone: profile?.phone,
            ip: geo ? geo.ip : undefined,
            location: geo ? geo.location : undefined,
          },
        );
        conversationId = result.conversationId;

        // Subscribe to messages.
        client.onUpdate(
          "visitors:listMessagesForVisitor",
          { widgetId, visitorKey, conversationId },
          onMessages,
          (err) => console.error("[PraxTalk] message subscription failed", err),
        );
        subscribeToTyping(conversationId);
      }

      // ── Presence beacon (Live Visitors monitoring) ─────────────
      // Pings presence:ping on page load and every 20s while the tab
      // is visible, so operators see who's browsing right now — page,
      // referrer, time on site. Geo is fetched once per page and
      // cached; every failure is silent (monitoring must never break
      // the site or the chat).
      var presenceLanding = location.href;
      var presenceGeoCache;
      var presenceGeoFetched = false;
      async function presenceGeo() {
        if (presenceGeoFetched) return presenceGeoCache;
        presenceGeoFetched = true;
        try {
          presenceGeoCache = await fetchVisitorGeo();
        } catch {
          presenceGeoCache = undefined;
        }
        return presenceGeoCache;
      }
      var presenceFirst = true;
      async function sendPresencePing() {
        try {
          // Background tabs keep pinging (the browser throttles the
          // interval on its own) — the visible flag is what moves a
          // visitor between Active and Idle in the monitor.
          const geo = await presenceGeo();
          const isFirst = presenceFirst;
          presenceFirst = false;
          await client.mutation("presence:ping", {
            widgetId,
            visitorKey,
            visible: document.visibilityState === "visible",
            url: String(location.href).slice(0, 500),
            title: String(document.title || "").slice(0, 200) || undefined,
            referrer: String(document.referrer || "").slice(0, 500) || undefined,
            landing: String(presenceLanding).slice(0, 500),
            pageload: isFirst,
            ip: geo ? geo.ip : undefined,
            location: geo ? geo.location : undefined,
            ua: String(navigator.userAgent || "").slice(0, 300) || undefined,
          });
        } catch (e) {
          // Quiet by default, but findable: monitoring failures were
          // fully silent once and cost a debugging session.
          console.debug("[PraxTalk] presence ping failed", e);
        }
      }
      void sendPresencePing();
      setInterval(sendPresencePing, 20000);
      document.addEventListener("visibilitychange", function () {
        // Fire on both directions: to-visible restores Active fast,
        // to-hidden flips the row to Idle without waiting a beat.
        void sendPresencePing();
      });

      // The "drop straight to chat" path (no pre-chat form). Used for
      // brand-new anonymous visitors and for the chooser's "chat here"
      // button. After this lands, the visitor sees an empty chat view
      // and can start typing; the identity card prompt comes after
      // their first send (unless the brand turned it off).
      // Single-flight conversation starter shared by the chat-open
      // path and send(). A fast first message used to race the async
      // conversation create and get SILENTLY DROPPED ("Enter does
      // nothing"); routing every path through one in-flight promise
      // fixes the drop and can never double-create a conversation.
      let startPromise = null;
      function startConversationOnce() {
        if (conversationId) return Promise.resolve();
        if (!startPromise) {
          startPromise = startConversation(undefined).catch((err) => {
            startPromise = null;
            throw err;
          });
        }
        return startPromise;
      }

      async function enterChatAnonymous() {
        try {
          await startConversationOnce();
          showChat();
        } catch (err) {
          console.error("[PraxTalk] anon start failed", err);
          // Fall back to the legacy form view — better than a stuck
          // widget. Form HTML is still in the DOM for this reason.
          showForm();
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
        if (hasResumeableSession) {
          // Cached profile path — resume already wired the
          // subscription if we hit this in the same load.
          showChat();
        } else {
          enterChatAnonymous();
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
        // Resume path — visitor has a cached profile from a prior
        // session. Re-identify and drop them straight into chat.
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
            onMessages,
          );
          subscribeToTyping(conversationId);
          showChat();
          // Resumed visitor already has identity — never ask again.
          markIdentityAsked();
        } catch (err) {
          console.error("[PraxTalk] resume failed, going anon", err);
          await enterChatAnonymous();
        }
      } else {
        // Brand-new visitor — straight into anonymous chat. The pre-
        // chat form is no longer the default entry point; the inline
        // identity card (after first message) replaces it.
        await enterChatAnonymous();
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
          showChat();
        } catch (err) {
          console.error("[PraxTalk] failed to start conversation", err);
          els.formError.textContent = "Couldn't reach our servers. Please try again.";
        } finally {
          els.submit.disabled = false;
          els.submit.textContent = "Start chat →";
        }
      });

      // ── Inline identity card ───────────────────────────────────────
      // Triggered after the visitor's first send (when the brand has
      // askIdentityInChat = true and we haven't already asked on this
      // browser). Sit between the message list and composer.

      function showIdentityCard() {
        els.identityCard.classList.add("show");
        setTimeout(() => els.identityName.focus(), 50);
      }
      function hideIdentityCard() {
        els.identityCard.classList.remove("show");
        els.identityError.textContent = "";
      }

      els.identitySkip.addEventListener("click", () => {
        markIdentityAsked();
        hideIdentityCard();
      });

      els.identitySubmit.addEventListener("click", async () => {
        els.identityError.textContent = "";
        const name = els.identityName.value.trim();
        const email = els.identityEmail.value.trim();
        const phone = els.identityPhone.value.trim();
        if (!name && !email && !phone) {
          // Treat empty submit as a skip — friendlier than a hard error.
          markIdentityAsked();
          hideIdentityCard();
          return;
        }
        if (email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
          els.identityError.textContent = "Please enter a valid email.";
          return;
        }
        els.identitySubmit.disabled = true;
        const original = els.identitySubmit.textContent;
        els.identitySubmit.textContent = "Saving…";
        try {
          await client.mutation("visitors:updateIdentity", {
            widgetId,
            visitorKey,
            name: name || undefined,
            email: email || undefined,
            phone: phone || undefined,
          });
          // Cache locally so future page loads resume cleanly.
          saveProfile({ name, email, phone });
          markIdentityAsked();
          hideIdentityCard();
        } catch (err) {
          console.error("[PraxTalk] updateIdentity failed", err);
          els.identityError.textContent =
            err && err.data ? String(err.data) : "Couldn't save — try again.";
        } finally {
          els.identitySubmit.disabled = false;
          els.identitySubmit.textContent = original;
        }
      });

      async function send() {
        const text = els.input.value.trim();
        if (!text) return;
        // First message can arrive before the conversation exists
        // (fast typers beat the async create, resumed sessions may
        // not have re-wired) — wait for / trigger creation instead
        // of silently dropping the send. On failure the text stays
        // in the input so nothing is ever lost.
        if (!conversationId) {
          els.sendBtn.disabled = true;
          try {
            await startConversationOnce();
          } catch (err) {
            console.error("[PraxTalk] send failed — no conversation", err);
            return;
          } finally {
            els.sendBtn.disabled = false;
          }
          if (!conversationId) return;
        }
        els.input.value = "";
        els.list.appendChild(bubble("visitor", text));
        els.list.scrollTop = els.list.scrollHeight;
        visitorMessageCount++;
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
        // After the very first visitor message: if the brand wants
        // inline identity capture and we haven't asked yet, surface
        // the card. Subsequent sends don't re-trigger.
        if (
          visitorMessageCount === 1 &&
          config.askIdentityInChat &&
          !isIdentityAsked()
        ) {
          showIdentityCard();
        }
      }
      els.sendBtn.addEventListener("click", send);
      els.input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          send();
        }
      });
      // Ping "visitor is typing" as they write (debounced inside).
      els.input.addEventListener("input", pingVisitorTyping);

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
                conversationId,
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy,
              });
              showSystem("📍 Current location shared with the team.");
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

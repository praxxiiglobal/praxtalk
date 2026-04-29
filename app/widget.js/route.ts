import { NextResponse } from "next/server";

export const dynamic = "force-static";
export const revalidate = 300; // 5 minutes — widget changes propagate quickly

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";

// HTML + scoped CSS for the widget. Declared before SOURCE so the template
// literal below can reference it.
const WIDGET_SHELL = `
<style>
  :host { all: initial; --praxtalk-accent: #0F1A12; --praxtalk-paper: #F1EFE3; --praxtalk-ink: #0F1A12; }
  * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Inter", system-ui, sans-serif; }
  .bubble {
    position: fixed; bottom: 20px; right: 20px;
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
    position: fixed; bottom: 20px; right: 20px;
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
  .close { background: rgba(255,255,255,0.15); color: #fff; border: none;
    width: 28px; height: 28px; border-radius: 999px; cursor: pointer; font-size: 16px; line-height: 1; }
  .close:hover { background: rgba(255,255,255,0.25); }
  .body { flex: 1; display: flex; flex-direction: column; min-height: 0; background: #fafaf6; }

  /* Pre-chat form view */
  .form-view { display: flex; flex-direction: column; gap: 10px; padding: 16px; overflow-y: auto; }
  .form-view.hidden { display: none; }
  .welcome { font-size: 13px; line-height: 1.45; color: #555; margin-bottom: 4px; }
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
  .msg {
    max-width: 80%; padding: 9px 12px; border-radius: 14px;
    font-size: 14px; line-height: 1.4; white-space: pre-wrap; word-wrap: break-word;
  }
  .msg.visitor { align-self: flex-end; background: var(--praxtalk-accent); color: #fff; border-top-right-radius: 4px; }
  .msg.operator { align-self: flex-start; background: #fff; color: var(--praxtalk-ink); border: 1px solid rgba(0,0,0,0.06); border-top-left-radius: 4px; }
  .msg.atlas { align-self: flex-start; background: #FFF7DD; color: var(--praxtalk-ink); border-top-left-radius: 4px; }
  .msg.system { align-self: center; background: rgba(0,0,0,0.04); color: #6b6b5d; font-size: 11px; padding: 4px 10px; }
  .composer { display: flex; align-items: flex-end; gap: 6px; padding: 10px; border-top: 1px solid rgba(0,0,0,0.06); background: #fff; }
  .input { flex: 1; resize: none; border: 1px solid rgba(0,0,0,0.12); border-radius: 10px;
    padding: 8px 10px; font-size: 14px; outline: none; min-height: 38px; max-height: 120px;
    font-family: inherit; }
  .input:focus { border-color: var(--praxtalk-accent); }
  .send { background: var(--praxtalk-accent); color: #fff; border: none;
    width: 38px; height: 38px; border-radius: 10px; cursor: pointer; font-size: 16px; }
  .send:hover { opacity: 0.9; }
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
    <button class="close" aria-label="Close">×</button>
  </div>
  <div class="body">
    <form class="form-view" novalidate>
      <p class="welcome">Tell us a bit about yourself and we'll get the right person on it.</p>
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
      <div class="composer">
        <textarea class="input" rows="1" placeholder="Type a message…"></textarea>
        <button class="send" aria-label="Send">↑</button>
      </div>
    </div>
    <div class="footer">Powered by <a href="https://praxtalk.com" target="_blank" rel="noopener">PraxTalk</a></div>
  </div>
</div>
`;

const SOURCE = /* javascript */ `(() => {
  if (window.__PRAXTALK_WIDGET_LOADED__) return;
  window.__PRAXTALK_WIDGET_LOADED__ = true;

  const CONVEX_URL = ${JSON.stringify(CONVEX_URL)};
  const CONVEX_CLIENT_CDN = "https://esm.sh/convex@1.36.1/browser";
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
  host.id = "praxtalk-host";
  host.style.cssText = "position:fixed;z-index:2147483646;bottom:0;right:0;";
  document.body.appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  root.innerHTML = ${JSON.stringify(WIDGET_SHELL)};

  const els = {
    bubble: root.querySelector(".bubble"),
    panel: root.querySelector(".panel"),
    title: root.querySelector(".title"),
    body: root.querySelector(".body"),
    formView: root.querySelector(".form-view"),
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
    closeBtn: root.querySelector(".close"),
  };

  let panelOpen = false;
  function setOpen(next) {
    panelOpen = next;
    els.panel.classList.toggle("open", next);
    els.bubble.classList.toggle("hidden", next);
  }
  els.bubble.addEventListener("click", () => setOpen(true));
  els.closeBtn.addEventListener("click", () => setOpen(false));

  function showChat() {
    els.formView.classList.add("hidden");
    els.chatView.classList.remove("hidden");
    setTimeout(() => els.input.focus(), 50);
  }
  function showForm() {
    els.chatView.classList.add("hidden");
    els.formView.classList.remove("hidden");
    setTimeout(() => els.name.focus(), 50);
  }

  function bubble(role, body) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = body;
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
    for (const m of messages) {
      els.list.appendChild(bubble(m.role, m.body));
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
      host.style.left = "0";
      host.style.right = "auto";
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
  import(CONVEX_CLIENT_CDN)
    .then(async (mod) => {
      const ConvexClient = mod.ConvexClient || mod.default?.ConvexClient;
      if (!ConvexClient) throw new Error("ConvexClient not found in convex/browser");
      const client = new ConvexClient(CONVEX_URL);

      const config = await client.query("widgets:getConfigByWidgetId", { widgetId });
      if (!config) {
        console.warn("[PraxTalk] unknown widget id:", widgetId);
        return;
      }
      applyConfig(config);

      const cachedProfile = loadProfile();
      let conversationId = null;

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

      // If we already have a profile cached AND an open conversation,
      // skip the form entirely on this page load.
      if (cachedProfile && cachedProfile.name && cachedProfile.email && cachedProfile.phone) {
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
          showChat();
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
          showChat();
        } catch (err) {
          console.error("[PraxTalk] failed to start conversation", err);
          els.formError.textContent = "Couldn't reach our servers. Please try again.";
        } finally {
          els.submit.disabled = false;
          els.submit.textContent = "Start chat →";
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
    })
    .catch((err) => {
      console.error("[PraxTalk] failed to load widget runtime", err);
    });
})();
`;

export async function GET() {
  return new NextResponse(SOURCE, {
    headers: {
      "content-type": "application/javascript; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=86400",
      "x-content-type-options": "nosniff",
    },
  });
}

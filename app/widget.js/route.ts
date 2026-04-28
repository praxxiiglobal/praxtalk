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
    <div class="list"></div>
    <div class="composer">
      <textarea class="input" rows="1" placeholder="Type a message…"></textarea>
      <button class="send" aria-label="Send">↑</button>
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

  // Resolve workspace id from the snippet that loaded us.
  const scriptEl =
    document.currentScript ||
    document.querySelector("script[src*='praxtalk.com/widget.js'], script[src*='/widget.js']");
  const widgetId = scriptEl && scriptEl.dataset && scriptEl.dataset.workspaceId;
  if (!widgetId) {
    console.warn("[PraxTalk] missing data-workspace-id on script tag.");
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
    if (next) setTimeout(() => els.input.focus(), 50);
  }
  els.bubble.addEventListener("click", () => setOpen(true));
  els.closeBtn.addEventListener("click", () => setOpen(false));

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
    els.title.textContent = config.workspaceName || "Chat";
    if (config.primaryColor) {
      root.host.style.setProperty("--praxtalk-accent", config.primaryColor);
    }
    if (config.position === "bl") {
      host.style.left = "0";
      host.style.right = "auto";
    }
  }

  // Bootstrap Convex client from CDN. esm.sh re-exports npm packages as ESM.
  import(CONVEX_CLIENT_CDN)
    .then(async (mod) => {
      const ConvexClient = mod.ConvexClient || mod.default?.ConvexClient;
      if (!ConvexClient) throw new Error("ConvexClient not found in convex/browser");
      const client = new ConvexClient(CONVEX_URL);

      // Pull widget config (workspace name, color, position, welcome msg).
      const config = await client.query("widgets:getConfigByWidgetId", { widgetId });
      if (!config) {
        console.warn("[PraxTalk] unknown widget id:", widgetId);
        return;
      }
      applyConfig(config);

      // Identify visitor + open conversation.
      const { conversationId } = await client.mutation(
        "visitors:identifyAndStartConversation",
        { widgetId, visitorKey },
      );

      // Subscribe to messages — visitor-scoped reactive stream.
      client.onUpdate(
        "visitors:listMessagesForVisitor",
        { widgetId, visitorKey, conversationId },
        renderMessages,
        (err) => {
          console.error("[PraxTalk] message subscription failed", err);
        },
      );

      async function send() {
        const text = els.input.value.trim();
        if (!text) return;
        els.input.value = "";
        // Optimistic append.
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

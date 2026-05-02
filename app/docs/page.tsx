import { MarketingShell, Section, Prose } from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "Docs · PraxTalk",
  description:
    "Embed the widget, integrate via REST, listen to webhooks, and use the Atlas Agent SDK.",
};

export default function DocsPage() {
  return (
    <MarketingShell
      eyebrow="Documentation"
      title="Build with PraxTalk."
      description="Three integration paths: drop in the widget, hit the REST API from your CRM, or subscribe to webhooks for event-driven workflows. Pick one or combine."
    >
      <Section
        id="install"
        title="Install the widget"
        description="A single <script> tag drops the chat widget on any page. No npm install, no bundler change."
      >
        <Prose>
          <p>
            Find your brand widget id at{" "}
            <a href="/app/brands">/app/brands</a> in the dashboard. Then paste
            the snippet into the page, just before <code>&lt;/body&gt;</code>:
          </p>
          <pre>{`<script
  src="https://praxtalk.com/widget.js"
  data-widget-id="ws_…"
  defer
></script>`}</pre>
          <p>
            The widget loads in a Shadow DOM so host-page styles can&apos;t
            leak in. First-time visitors fill a Name / Email / Phone /
            Message form before chat starts; subsequent visits skip it.
          </p>
        </Prose>
      </Section>

      <Section
        id="api"
        title="REST API"
        description="Authenticated with Bearer tokens. Mint keys at /app/integrations."
      >
        <Prose>
          <p>
            <strong>
              <a href="/docs/api">→ Full REST reference</a>
            </strong>{" "}
            (auth, all endpoints, rate limits, webhooks, signature
            verification).
          </p>
          <p>
            Base URL:{" "}
            <code>https://industrious-moose-892.convex.site/api/v1</code>
          </p>
          <pre>{`# List inbox
curl -H "Authorization: Bearer ptk_live_…" \\
  "$BASE/api/v1/conversations?status=open&limit=50"

# Operator reply
curl -X POST -H "Authorization: Bearer ptk_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"body":"Thanks — looking into it now."}' \\
  "$BASE/api/v1/conversations/<id>/messages"

# Create lead
curl -X POST -H "Authorization: Bearer ptk_live_…" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Maya A.","email":"maya@acme.com"}' \\
  "$BASE/api/v1/leads"`}</pre>
          <h3>Endpoints</h3>
          <ul>
            <li>
              <code>GET /conversations</code> — query: <code>status</code>,{" "}
              <code>brandId</code>, <code>limit</code>
            </li>
            <li>
              <code>GET /conversations/:id</code>
            </li>
            <li>
              <code>POST /conversations/:id/messages</code> —{" "}
              <code>{"{ body }"}</code>
            </li>
            <li>
              <code>PATCH /conversations/:id</code> —{" "}
              <code>{"{ status }"}</code>
            </li>
            <li>
              <code>GET /messages?conversationId=…</code>
            </li>
            <li>
              <code>GET /leads</code>, <code>POST /leads</code>,{" "}
              <code>PATCH /leads/:id</code>
            </li>
            <li>
              <code>GET /brands</code>
            </li>
            <li>
              <code>GET /ping</code> (health)
            </li>
          </ul>
          <p>
            Brand-scoped keys can only see/act on their own brand;
            cross-brand calls return 403.
          </p>
        </Prose>
      </Section>

      <Section
        id="webhooks"
        title="Webhooks"
        description="Push events to your CRM the moment they happen. Each request signed with HMAC-SHA256."
      >
        <Prose>
          <p>
            Configure endpoints at{" "}
            <a href="/app/integrations">/app/integrations</a>. Events available:
          </p>
          <ul>
            <li>
              <code>conversation.created</code>
            </li>
            <li>
              <code>conversation.status_changed</code>
            </li>
            <li>
              <code>message.created</code> (visitor + operator + atlas)
            </li>
            <li>
              <code>lead.created</code>
            </li>
            <li>
              <code>lead.status_changed</code>
            </li>
          </ul>
          <h3>Signature verification</h3>
          <pre>{`// Each request includes:
//   X-PraxTalk-Signature: t=<unix>,v1=<hmacHex>
//   X-PraxTalk-Event:     conversation.created | message.created | …
// Compute HMAC-SHA256 over: \`\${ts}.\${rawBody}\` with your shared secret

import crypto from "crypto";
function verify(secret, signatureHeader, rawBody) {
  const m = signatureHeader.match(/t=(\\d+),v1=([a-f0-9]+)/);
  if (!m) return false;
  const expected = crypto.createHmac("sha256", secret)
    .update(\`\${m[1]}.\${rawBody}\`)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(expected));
}`}</pre>
          <p>
            Failed deliveries retry on a backoff schedule of{" "}
            <code>30s → 2m → 10m → 1h → 6h</code>; after 6 attempts the
            event is marked failed and surfaces in the dashboard event log
            with a manual <strong>Retry now</strong> button.
          </p>
        </Prose>
      </Section>

      <Section
        id="sdk"
        title="Agent SDK"
        description="For real-time inboxes inside your CRM. Subscribes via Convex websocket so updates push, not poll."
      >
        <Prose>
          <pre>{`import { ConvexClient } from "convex/browser";
const client = new ConvexClient(process.env.PRAXTALK_CONVEX_URL!);

client.onUpdate(
  "conversations:listInbox",
  { sessionToken: "<operator token>", status: "open" },
  (rows) => renderInbox(rows),
);`}</pre>
          <p>
            The Convex client is the same one PraxTalk&apos;s own
            dashboard uses. For server-to-server (no operator session),
            use the REST API or webhooks.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

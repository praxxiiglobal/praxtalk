import {
  MarketingShell,
  Section,
  Prose,
} from "@/components/marketing/MarketingShell";

export const metadata = {
  title: "REST API · PraxTalk",
  description:
    "Run PraxTalk fully headless from your CRM. Endpoints, authentication, rate limits, and example requests.",
};

export default function ApiDocsPage() {
  return (
    <MarketingShell
      eyebrow="REST API"
      title="Run PraxTalk from your own CRM."
      description="Every conversation, lead, and brand is reachable via REST. Use it to power custom inboxes, sync to your data warehouse, or build automation on top of PraxTalk events."
    >
      <Section
        id="auth"
        title="Authentication"
        description="Every request needs a workspace API key in the Authorization header."
      >
        <Prose>
          <p>
            Generate a key in the dashboard at{" "}
            <a href="/app/integrations">/app/integrations</a> → API keys.
            Keys come in two scopes:
          </p>
          <ul>
            <li>
              <strong>read</strong> — list and fetch endpoints only
            </li>
            <li>
              <strong>write</strong> — list, fetch, and mutating endpoints (send
              message, change status, create lead)
            </li>
          </ul>
          <p>Keys can be brand-scoped if you only want to expose one brand.</p>
          <pre>{`Authorization: Bearer ptk_live_<your-secret>`}</pre>
          <p>
            The full secret is shown once at create time and never again — copy
            it to your secret manager immediately. Compromised keys can be
            revoked from the same dashboard.
          </p>
        </Prose>
      </Section>

      <Section
        id="base-url"
        title="Base URL"
        description="Every endpoint lives under your workspace's Convex deployment host."
      >
        <Prose>
          <p>
            Your base URL is shown on the API keys page. It looks like:
          </p>
          <pre>{`https://<your-deployment>.convex.site`}</pre>
          <p>
            All endpoints below are relative to this base. CORS is open
            (<code>Access-Control-Allow-Origin: *</code>) so you can call from
            a browser context too.
          </p>
        </Prose>
      </Section>

      <Section
        id="rate-limits"
        title="Rate limits"
        description="60 requests per minute per IP. Errors include Retry-After."
      >
        <Prose>
          <p>
            When you exceed the per-IP limit, the API returns{" "}
            <code>429 Too Many Requests</code> with a{" "}
            <code>Retry-After</code> header (in seconds) and a JSON body:
          </p>
          <pre>{`{
  "error": "Rate limit exceeded. Try again in a moment.",
  "retryAfterSeconds": 12
}`}</pre>
          <p>
            Honour the header — well-behaved clients automatically back off.
            Need a higher limit? Email{" "}
            <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a>.
          </p>
        </Prose>
      </Section>

      <Section
        id="endpoints"
        title="Endpoints"
        description="All endpoints are JSON in / JSON out. Errors come back as { error: string }."
      >
        <Prose>
          <h3>Brands</h3>
          <pre>{`GET /api/v1/brands
→ { brands: [{ _id, slug, name, primaryColor, ... }] }`}</pre>

          <h3>Conversations</h3>
          <pre>{`GET /api/v1/conversations?status=open&brandId=...&limit=50
→ { conversations: [...] }

GET /api/v1/conversations/:id
→ { conversation: { ..., visitor, brand, messages: [...] } }

PATCH /api/v1/conversations/:id
Body: { status: "open" | "snoozed" | "resolved" | "closed" }
→ { ok: true }

POST /api/v1/conversations/:id/messages
Body: { body: "Reply text" }
→ { messageId: "..." }`}</pre>

          <h3>Messages</h3>
          <pre>{`GET /api/v1/messages?conversationId=...
→ { messages: [{ _id, role, body, channel, createdAt }] }`}</pre>

          <h3>Leads</h3>
          <pre>{`GET /api/v1/leads?status=new&brandId=...
→ { leads: [...] }

POST /api/v1/leads
Body: { name, email?, phone?, notes?, status?, brandId?, conversationId? }
→ { leadId: "..." }

PATCH /api/v1/leads/:id
Body: { status?, notes?, name? }
→ { ok: true }`}</pre>

          <h3>Health</h3>
          <pre>{`GET /api/v1/ping
→ { ok: true, workspaceId: "..." }`}</pre>
        </Prose>
      </Section>

      <Section
        id="webhooks"
        title="Webhooks"
        description="Subscribe to real-time events instead of polling. HMAC-signed, retried with exponential backoff."
      >
        <Prose>
          <p>
            Configure subscriptions in the dashboard at{" "}
            <a href="/app/integrations">/app/integrations</a> → Webhooks. Each
            subscription gets its own signing secret.
          </p>
          <p>Events you can subscribe to:</p>
          <ul>
            <li>
              <code>conversation.created</code>
            </li>
            <li>
              <code>conversation.status_changed</code>
            </li>
            <li>
              <code>message.created</code>
            </li>
            <li>
              <code>lead.created</code>
            </li>
            <li>
              <code>lead.status_changed</code>
            </li>
          </ul>
          <h3>Signature verification</h3>
          <p>
            Every POST includes an{" "}
            <code>X-PraxTalk-Signature</code> header in the format{" "}
            <code>t=&lt;unix-seconds&gt;,v1=&lt;hex&gt;</code> — the same
            scheme Stripe uses. Verify by computing{" "}
            <code>HMAC-SHA256(secret, &lt;t&gt;.&lt;rawBody&gt;)</code> and
            comparing to <code>v1</code> in constant time. Reject anything
            with a timestamp older than 5 minutes to prevent replay.
          </p>
          <pre>{`// Node example
import crypto from "crypto";

function verify(rawBody, header, secret) {
  const [tPart, v1Part] = header.split(",");
  const t = tPart.split("=")[1];
  const sig = v1Part.split("=")[1];
  const expected = crypto
    .createHmac("sha256", secret)
    .update(\`\${t}.\${rawBody}\`)
    .digest("hex");
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(sig, "hex"),
  );
}`}</pre>
          <h3>Retries</h3>
          <p>
            Non-2xx responses are retried up to 6 times across roughly 7
            hours. Failures are visible in the dashboard — you can manually
            replay them from the integrations page.
          </p>
        </Prose>
      </Section>

      <Section
        id="example"
        title="End-to-end example"
        description="Send a reply from your own CRM."
      >
        <Prose>
          <pre>{`# 1. List open conversations
curl https://<your-deployment>.convex.site/api/v1/conversations?status=open \\
  -H "Authorization: Bearer ptk_live_abc123..."

# 2. Pick one and send a reply
curl -X POST https://<your-deployment>.convex.site/api/v1/conversations/<id>/messages \\
  -H "Authorization: Bearer ptk_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{ "body": "Hi! How can I help?" }'

# 3. Mark resolved
curl -X PATCH https://<your-deployment>.convex.site/api/v1/conversations/<id> \\
  -H "Authorization: Bearer ptk_live_abc123..." \\
  -H "Content-Type: application/json" \\
  -d '{ "status": "resolved" }'`}</pre>
        </Prose>
      </Section>

      <Section
        id="errors"
        title="Error reference"
        description="Status codes you should expect and handle."
      >
        <Prose>
          <ul>
            <li>
              <strong>401</strong> — missing, malformed, or revoked API key
            </li>
            <li>
              <strong>403</strong> — key has read-only scope, or is brand-scoped
              and you tried to act on another brand
            </li>
            <li>
              <strong>404</strong> — resource doesn't exist or belongs to
              another workspace
            </li>
            <li>
              <strong>422</strong> — request body failed validation; the{" "}
              <code>error</code> field explains
            </li>
            <li>
              <strong>429</strong> — rate limited; honour{" "}
              <code>Retry-After</code>
            </li>
            <li>
              <strong>5xx</strong> — transient server issue; retry with
              backoff
            </li>
          </ul>
        </Prose>
      </Section>

      <Section
        id="support"
        title="Need something not covered here?"
      >
        <Prose>
          <p>
            Email{" "}
            <a href="mailto:hello@praxtalk.com">hello@praxtalk.com</a> with
            your use case. Custom endpoints, higher rate limits, IP allowlist —
            all on the table for paying customers.
          </p>
        </Prose>
      </Section>
    </MarketingShell>
  );
}

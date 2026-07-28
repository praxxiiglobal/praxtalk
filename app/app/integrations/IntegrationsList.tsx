"use client";

import { useDashboardAuth } from "../_components/DashboardShell";
import { Card } from "../_components/PageHeader";
import { ApiKeysSection } from "./ApiKeysSection";
import { EmailIntegrationSection } from "./EmailIntegrationSection";
import { PersonalEmailSection } from "./PersonalEmailSection";
import { PersonalVoiceSection } from "./PersonalVoiceSection";
import { PersonalWhatsappSection } from "./PersonalWhatsappSection";
import { VoiceIntegrationSection } from "./VoiceIntegrationSection";
import { WaMeLiteSection } from "./WaMeLiteSection";
import { WebhooksSection } from "./WebhooksSection";
import { WhatsappIntegrationSection } from "./WhatsappIntegrationSection";
import { WhatsappTemplatesSection } from "./WhatsappTemplatesSection";

/**
 * Renders integration sections gated by per-workspace feature flags.
 * Email-channel-disabled workspaces don't see email-provider config;
 * voice-disabled workspaces don't see voice-provider config; etc.
 *
 * The REST API + webhooks sections are always visible — they're
 * platform features, not channel-specific.
 */
export function IntegrationsList() {
  const { workspace } = useDashboardAuth();
  const f = workspace.features;
  const noChannelsEnabled =
    !f.channels.chat &&
    !f.channels.email &&
    !f.channels.whatsapp &&
    !f.channels.voice &&
    !f.channels.sms;

  return (
    <>
      {f.channels.email && (
        <>
          <EmailIntegrationSection />
          <PersonalEmailSection />
        </>
      )}
      {f.channels.whatsapp && (
        <>
          <WhatsappIntegrationSection />
          <PersonalWhatsappSection />
          <WhatsappTemplatesSection />
          <WaMeLiteSection />
        </>
      )}
      {f.channels.voice && (
        <>
          <VoiceIntegrationSection />
          <PersonalVoiceSection />
        </>
      )}

      {noChannelsEnabled && (
        <Card title="No channels enabled">
          <p className="text-sm text-muted">
            All inbound channels are gated off for this workspace.
            Talk to your platform admin if you need to turn one on,
            or use the REST API + webhooks below.
          </p>
        </Card>
      )}

      <RestApiOverviewCard />
      <ApiKeysSection />
      <WebhooksSection />
      <ConvexClientCard />
    </>
  );
}

function RestApiOverviewCard() {
  const baseUrl =
    typeof process !== "undefined" && process.env.NEXT_PUBLIC_CONVEX_URL
      ? process.env.NEXT_PUBLIC_CONVEX_URL.replace(
          /\.convex\.cloud$/,
          ".convex.site",
        )
      : "https://<your-deployment>.convex.site";
  return (
    <Card
      title="REST API"
      description="Hit these endpoints from any HTTPS client. Authenticate with `Authorization: Bearer ptk_live_…`."
    >
      <pre className="overflow-x-auto rounded-lg border border-rule bg-paper-2/40 p-4 font-mono text-[12.5px] leading-[1.6] text-ink">
        <span className="text-muted">{`# Base URL\n`}</span>
        {`${baseUrl}/api/v1\n\n`}
        <span className="text-muted">{`# Health\n`}</span>
        {`GET    /api/v1/ping\n\n`}
        <span className="text-muted">{`# Conversations\n`}</span>
        {`GET    /api/v1/conversations?status=open&brandId=...&limit=50\n`}
        {`GET    /api/v1/conversations/:id\n`}
        {`POST   /api/v1/conversations/:id/messages   { "body": "..." }\n`}
        {`PATCH  /api/v1/conversations/:id            { "status": "resolved" }\n\n`}
        <span className="text-muted">{`# Messages\n`}</span>
        {`GET    /api/v1/messages?conversationId=...\n\n`}
        <span className="text-muted">{`# Leads\n`}</span>
        {`GET    /api/v1/leads?status=new&brandId=...\n`}
        {`POST   /api/v1/leads                        { "name": "...", "email": "...", "phone": "..." }\n`}
        {`PATCH  /api/v1/leads/:id                    { "status": "contacted", "notes": "..." }\n\n`}
        <span className="text-muted">{`# Brands\n`}</span>
        {`GET    /api/v1/brands`}
      </pre>
    </Card>
  );
}

function ConvexClientCard() {
  return (
    <Card
      title="Direct Convex client"
      description="For real-time inboxes inside your CRM. Subscribe to queries the same way the PraxTalk dashboard does — websocket-backed, push-driven."
    >
      <pre className="overflow-x-auto rounded-lg border border-rule bg-paper-2/40 p-4 font-mono text-[12.5px] leading-[1.6] text-ink">{`import { ConvexClient } from "convex/browser";
const client = new ConvexClient(process.env.PRAXTALK_CONVEX_URL!);

// Subscribe to your inbox in real time:
client.onUpdate(
  "conversations:listInbox",
  { sessionToken: "<operator token>", status: "open" },
  (rows) => renderInbox(rows),
);`}</pre>
      <p className="mt-3 text-[12px] text-muted">
        For server-to-server use, prefer the REST API or webhooks — session
        tokens are designed for browser sessions, not long-lived backend
        credentials.
      </p>
    </Card>
  );
}

import { IntegrationsList } from "./IntegrationsList";
import { PageHeader, PageBody } from "../_components/PageHeader";

export const metadata = {
  title: "Integrations · PraxTalk",
};

export default function IntegrationsPage() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect PraxTalk to your channels and your CRM. Configure inbound channels (email, WhatsApp) or wire your own systems via REST and webhooks."
      />
      <PageBody>
        <IntegrationsList />
      </PageBody>
    </>
  );
}

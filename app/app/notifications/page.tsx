import { NotificationsView } from "./NotificationsView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Notifications · PraxTalk",
};

export default function NotificationsPage() {
  return (
    <>
      <PageHeader
        title="Notifications"
        description="Every meaningful event in your workspace — leads created, webhooks failed, Atlas errors, team changes, API keys minted. Live."
      />
      <PageBody>
        <NotificationsView />
      </PageBody>
    </>
  );
}

import { RemindersView } from "./RemindersView";
import { PageHeader, PageBody } from "../_components/PageHeader";

export const metadata = {
  title: "Reminders · PraxTalk",
};

export default function RemindersPage() {
  return (
    <>
      <PageHeader
        title="Reminders"
        description="Cross-channel reminders scheduled from any conversation. Fire on time, route to chat / email / SMS / WhatsApp / voice."
      />
      <PageBody>
        <RemindersView />
      </PageBody>
    </>
  );
}

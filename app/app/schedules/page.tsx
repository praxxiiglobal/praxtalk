import { SchedulesView } from "./SchedulesView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Schedules · PraxTalk",
};

export default function SchedulesPage() {
  return (
    <>
      <PageHeader
        title="Schedules"
        description="Reminders + booking pages — everything time-based in one place. Reminders fan out across chat / SMS / email / WhatsApp / voice; booking pages let visitors pick a slot."
      />
      <PageBody>
        <SchedulesView />
      </PageBody>
    </>
  );
}

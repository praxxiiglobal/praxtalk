import { BookingPagesView } from "./BookingPagesView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Booking pages · PraxTalk",
};

export default function BookingPagesPage() {
  return (
    <>
      <PageHeader
        title="Booking pages"
        description="Public pages where visitors pick a slot. Each booking opens a conversation in the inbox + auto-schedules reminders on the chosen channel."
      />
      <PageBody>
        <BookingPagesView />
      </PageBody>
    </>
  );
}

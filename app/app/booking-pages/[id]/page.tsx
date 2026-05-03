import { BookingPageEditor } from "./BookingPageEditor";
import { PageHeader, PageBody } from "../../PageHeader";
import type { Id } from "@/convex/_generated/dataModel";

export const metadata = {
  title: "Edit booking page · PraxTalk",
};

export default async function EditBookingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <PageHeader
        title="Edit booking page"
        description="Set your weekly availability + per-day overrides for holidays or vacation."
      />
      <PageBody>
        <BookingPageEditor id={id as Id<"bookingPages">} />
      </PageBody>
    </>
  );
}

import { LeadsView } from "./LeadsView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Leads · PraxTalk",
};

export default function LeadsPage() {
  return (
    <>
      <PageHeader
        title="Leads"
        description="Visitors and conversations promoted into follow-ups. Save them from the inbox to keep contact details, notes, and pipeline status in one place."
      />
      <PageBody>
        <LeadsView />
      </PageBody>
    </>
  );
}

import { CallsView } from "./CallsView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Calls · PraxTalk",
};

export default function CallsPage() {
  return (
    <>
      <PageHeader
        title="Calls"
        description="Every voice conversation, inbound and outbound. Click a row to open it in the inbox."
      />
      <PageBody>
        <CallsView />
      </PageBody>
    </>
  );
}

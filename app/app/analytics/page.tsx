import { AnalyticsView } from "./AnalyticsView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Analytics · PraxTalk",
};

export default function AnalyticsPage() {
  return (
    <>
      <PageHeader
        title="Analytics"
        description="Volume, response times, and AI resolution rate. Live numbers replace the open-beta sample data once your widget has run for a week."
      />
      <PageBody>
        <AnalyticsView />
      </PageBody>
    </>
  );
}

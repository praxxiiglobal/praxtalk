import { CalendarsSection } from "./CalendarsSection";
import { WorkspaceSettings } from "./WorkspaceSettings";
import { WidgetSnippet } from "./WidgetSnippet";
import { PageHeader, PageBody, Card } from "../PageHeader";
import { PushToggle } from "../PushToggle";

export const metadata = {
  title: "Settings · PraxTalk",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace, team, billing, theme, and integration preferences."
      />
      <PageBody>
        <WorkspaceSettings />
        <WidgetSnippet />
        <Card
          title="Calendars"
          description="Connect Google or Microsoft calendars so booking pages can avoid scheduling slots that conflict with your existing events."
        >
          <CalendarsSection />
        </Card>
        <Card title="Notifications">
          <PushToggle />
        </Card>
      </PageBody>
    </>
  );
}

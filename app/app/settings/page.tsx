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
        description="Workspace name, branding, the widget snippet, and your notification preferences."
      />
      <PageBody>
        <WorkspaceSettings />
        <WidgetSnippet />
        <Card title="Notifications">
          <PushToggle />
        </Card>
      </PageBody>
    </>
  );
}

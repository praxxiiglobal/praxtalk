import { DashboardThemeSection } from "./DashboardThemeSection";
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
        <Card
          title="Dashboard theme"
          description="Match the operator dashboard to your brand colour. Affects every operator in your workspace."
        >
          <DashboardThemeSection />
        </Card>
        <WidgetSnippet />
        <Card title="Notifications">
          <PushToggle />
        </Card>
      </PageBody>
    </>
  );
}

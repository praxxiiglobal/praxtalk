import { WorkspaceSettings } from "./WorkspaceSettings";
import { WidgetSnippet } from "./WidgetSnippet";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Settings · PraxTalk",
};

export default function SettingsPage() {
  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace name, branding, and the widget snippet your team installs on customer websites."
      />
      <PageBody>
        <WorkspaceSettings />
        <WidgetSnippet />
      </PageBody>
    </>
  );
}

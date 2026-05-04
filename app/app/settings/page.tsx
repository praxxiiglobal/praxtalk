import Link from "next/link";
import { AccountSection } from "./AccountSection";
import { CalendarsSection } from "./CalendarsSection";
import { DataExportSection } from "./DataExportSection";
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
        <Card
          title="Your account"
          description="Change your name, email address, or password. You'll need your current password to confirm email + password changes."
        >
          <AccountSection />
        </Card>
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
        <Card
          title="Lobby intake"
          description="Ask visitors a few structured questions before chat starts — name, account ID, urgency, anything you need from them up-front. Configure the form fields here."
        >
          <Link
            href="/app/lobby"
            className="inline-flex h-9 items-center rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px"
          >
            Configure lobby form →
          </Link>
        </Card>
        <Card
          title="Data export"
          description="Download a full snapshot of your workspace at any time. Your data, your call."
        >
          <DataExportSection />
        </Card>
      </PageBody>
    </>
  );
}

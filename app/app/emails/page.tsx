import { EmailsView } from "./EmailsView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Emails · PraxTalk",
};

export default function EmailsPage() {
  return (
    <>
      <PageHeader
        title="Emails"
        description="Dedicated email view with Inbox / Sent / Drafts. Full conversations live in the unified inbox — click any row to jump there."
      />
      <PageBody>
        <EmailsView />
      </PageBody>
    </>
  );
}

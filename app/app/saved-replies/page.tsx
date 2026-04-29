import { SavedRepliesView } from "./SavedRepliesView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Saved replies · PraxTalk",
};

export default function SavedRepliesPage() {
  return (
    <>
      <PageHeader
        title="Saved replies"
        description="Boilerplate the team can drop into any conversation. Optionally scope to a single brand. Insert from the composer dropdown above the message box."
      />
      <PageBody>
        <SavedRepliesView />
      </PageBody>
    </>
  );
}

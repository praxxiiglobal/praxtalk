import { TeamView } from "./TeamView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Team · PraxTalk",
};

export default function TeamPage() {
  return (
    <>
      <PageHeader
        title="Team"
        description="Operators with access to this workspace. Invite teammates by email — they'll get a one-time link to set their password."
      />
      <PageBody>
        <TeamView />
      </PageBody>
    </>
  );
}

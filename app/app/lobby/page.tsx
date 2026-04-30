import { LobbySettings } from "./LobbySettings";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Lobby intake · PraxTalk",
};

export default function LobbyPage() {
  return (
    <>
      <PageHeader
        title="Lobby intake"
        description="Ask visitors a few structured questions before chat starts. The widget renders these fields after the name/email/phone form. Responses attach to the conversation and show in the inbox."
      />
      <PageBody>
        <LobbySettings />
      </PageBody>
    </>
  );
}

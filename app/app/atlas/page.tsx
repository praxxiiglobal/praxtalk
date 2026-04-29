import { AtlasSettings } from "./AtlasSettings";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Atlas AI · PraxTalk",
};

export default function AtlasPage() {
  return (
    <>
      <PageHeader
        title="Atlas AI"
        description="The autonomous agent that drafts or sends replies on every visitor message. Atlas runs only when you've configured an Anthropic API key — until then, visitor messages flow into the inbox unchanged."
      />
      <PageBody>
        <AtlasSettings />
      </PageBody>
    </>
  );
}

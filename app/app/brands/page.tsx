import { BrandsView } from "./BrandsView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Brands · PraxTalk",
};

export default function BrandsPage() {
  return (
    <>
      <PageHeader
        title="Brands"
        description="Run multiple brands from one workspace. One inbox, branded widgets, per-operator brand access. (Multi-brand goes live with v1.0.)"
      />
      <PageBody>
        <BrandsView />
      </PageBody>
    </>
  );
}

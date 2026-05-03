import { PageHeader, PageBody } from "../../PageHeader";
import { PricingEditor } from "./PricingEditor";

export const metadata = {
  title: "Marketing pricing · PraxTalk",
};

export default function PricingAdminPage() {
  return (
    <>
      <PageHeader
        title="Marketing pricing"
        description="Override the public pricing page copy. Display only — actual billing prices are locked to PayPal/Razorpay plan IDs and stay unchanged."
      />
      <PageBody>
        <PricingEditor />
      </PageBody>
    </>
  );
}

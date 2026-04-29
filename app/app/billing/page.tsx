import { BillingView } from "./BillingView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Billing · PraxTalk",
};

export default function BillingPage() {
  return (
    <>
      <PageHeader
        title="Billing"
        description="Plan, AI resolution usage, and invoices. Stripe is wired up at v1.0 — the open beta is free."
      />
      <PageBody>
        <BillingView />
      </PageBody>
    </>
  );
}

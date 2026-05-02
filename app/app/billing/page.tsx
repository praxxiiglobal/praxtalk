import { BillingView } from "./BillingView";
import { PageHeader, PageBody } from "../PageHeader";

export const metadata = {
  title: "Billing · PraxTalk",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    paypal?: string;
    paypal_error?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader
        title="Billing"
        description="Plan, AI usage, and PayPal subscription. Upgrade with PayPal — cancel anytime from this page."
      />
      <PageBody>
        <BillingView
          paypalReturn={params.paypal ?? null}
          paypalError={params.paypal_error ?? null}
        />
      </PageBody>
    </>
  );
}

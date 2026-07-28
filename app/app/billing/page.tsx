import { BillingView } from "./BillingView";
import { PageHeader, PageBody } from "../_components/PageHeader";

export const metadata = {
  title: "Billing · PraxTalk",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{
    paypal?: string;
    paypal_error?: string;
    razorpay?: string;
    razorpay_error?: string;
  }>;
}) {
  const params = await searchParams;
  return (
    <>
      <PageHeader
        title="Billing"
        description="Plan, AI usage, and subscription. Pay with PayPal (USD) or Razorpay (INR) — cancel anytime from this page."
      />
      <PageBody>
        <BillingView
          paypalReturn={params.paypal ?? null}
          paypalError={params.paypal_error ?? null}
          razorpayReturn={params.razorpay ?? null}
          razorpayError={params.razorpay_error ?? null}
        />
      </PageBody>
    </>
  );
}

import Link from "next/link";
import { Footer } from "@/components/marketing/Footer";
import { Nav } from "@/components/marketing/Nav";

export const metadata = {
  title: "Check your email · PraxTalk",
  robots: { index: false, follow: false },
};

/**
 * Reached via redirect from createWorkspaceAction once the signup
 * mutation accepts the request and queues a verification email.
 * The actual workspace doesn't exist yet — it's materialised when
 * the recipient clicks the link in the email and lands on
 * /setup/confirm?token=...
 */
export default async function VerifySignupPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  return (
    <>
      <Nav />
      <main id="main">
        <section className="mx-auto max-w-[640px] px-6 py-[80px] sm:py-[120px]">
          <div className="rounded-3xl border border-rule-2 bg-paper-2/40 p-8 sm:p-12">
            <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
              <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
              Almost there
            </div>
            <h1 className="text-[36px] font-semibold leading-[1.1] tracking-[-0.025em]">
              Check your{" "}
              <span className="font-serif italic font-normal">inbox.</span>
            </h1>
            <p className="mt-5 text-[15.5px] leading-[1.6] text-muted">
              We sent a verification link to{" "}
              <strong className="text-ink break-all">
                {email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
                  ? email
                  : "your email"}
              </strong>
              . Click the button in that email to finish creating your
              workspace.
            </p>
            <p className="mt-3 text-[13px] leading-[1.6] text-muted">
              The link expires in 1 hour. If you don&apos;t see it,
              check spam, then resubmit the form to send a new one.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/sign-up"
                className="inline-flex h-[38px] items-center gap-2 rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px"
              >
                Resend / change email
              </Link>
              <Link
                href="/login"
                className="inline-flex h-[38px] items-center gap-2 rounded-full px-4 text-sm font-medium text-muted transition hover:text-ink"
              >
                Already verified — sign in →
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

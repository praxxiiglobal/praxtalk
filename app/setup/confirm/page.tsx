import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { Footer } from "@/components/marketing/Footer";
import { Nav } from "@/components/marketing/Nav";
import { ConfirmForm } from "./ConfirmForm";

export const metadata = {
  title: "Verify your signup · PraxTalk",
  robots: { index: false, follow: false },
};

/**
 * Email-verification landing page. The recipient clicks the link in
 * their inbox; we look up the token to confirm it's still valid +
 * unconsumed before showing the "Verify and create workspace"
 * button. The button submits a small `<form>` that POSTs to a
 * server action which calls confirmSignup, sets the session cookie,
 * and redirects to /app.
 *
 * Why a button instead of auto-redeeming: many email scanners
 * (Outlook Safe Links, Google's prefetcher, etc.) issue a HEAD or
 * GET on links before the recipient ever clicks, which would burn
 * the one-shot token. Requiring an explicit click guarantees the
 * legitimate user is the one consuming it.
 */
export default async function ConfirmSignupPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  let lookup: Awaited<
    ReturnType<typeof convexServer.query<typeof api.workspaces.lookupSignupToken>>
  > = null;
  if (token) {
    try {
      lookup = await convexServer.query(api.workspaces.lookupSignupToken, {
        token,
      });
    } catch {
      lookup = null;
    }
  }

  return (
    <>
      <Nav />
      <main id="main">
        <section className="mx-auto max-w-[640px] px-6 py-[80px] sm:py-[120px]">
          <div className="rounded-3xl border border-rule-2 bg-paper-2/40 p-8 sm:p-12">
            {!token ? (
              <NotFound />
            ) : !lookup ? (
              <Expired />
            ) : (
              <ReadyToConfirm
                token={token}
                email={lookup.email}
                workspaceName={lookup.workspaceName}
              />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

function NotFound() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em]">
        Missing verification token
      </h1>
      <p className="mt-4 text-[15px] text-muted">
        The link you clicked didn&apos;t carry a verification token.
        Restart the signup and try again.
      </p>
      <Link
        href="/sign-up"
        className="mt-6 inline-flex h-[38px] items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px"
      >
        Restart signup
      </Link>
    </>
  );
}

function Expired() {
  return (
    <>
      <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em]">
        Link expired or already used
      </h1>
      <p className="mt-4 text-[15px] text-muted">
        Verification links last 1 hour and can only be used once.
        Sign up again to receive a fresh link.
      </p>
      <Link
        href="/sign-up"
        className="mt-6 inline-flex h-[38px] items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px"
      >
        Restart signup
      </Link>
    </>
  );
}

function ReadyToConfirm({
  token,
  email,
  workspaceName,
}: {
  token: string;
  email: string;
  workspaceName: string;
}) {
  return (
    <>
      <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
        <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
        One click left
      </div>
      <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.025em]">
        Create{" "}
        <span className="font-serif italic font-normal">
          {workspaceName}
        </span>
      </h1>
      <p className="mt-4 text-[15px] text-muted">
        Verify <strong className="text-ink">{email}</strong> and we&apos;ll
        materialise your workspace + send you straight to the dashboard.
      </p>
      <ConfirmForm token={token} />
    </>
  );
}

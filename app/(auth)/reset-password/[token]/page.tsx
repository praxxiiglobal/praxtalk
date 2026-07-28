import Image from "next/image";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = {
  title: "Set a new password · PraxTalk",
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await convexServer.query(api.passwordReset.lookup, { token });

  if (!reset) {
    return <ResetUnavailable />;
  }

  const minutesLeft = Math.max(
    0,
    Math.ceil((reset.expiresAt - Date.now()) / 60_000),
  );

  return (
    <main className="relative flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center px-4 sm:h-20 sm:px-8">
          <Link
            href="/"
            className="relative flex items-center"
            aria-label="PraxTalk home"
          >
            <Image
              src="/praxtalk-logo.png"
              alt="PraxTalk"
              width={1419}
              height={336}
              priority
              className="h-10 w-auto sm:h-12"
            />
          </Link>
          <div className="ml-auto text-sm text-muted">
            <Link
              href="/login"
              className="text-ink underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[460px]">
          <h1 className="mb-2 text-[40px] font-semibold leading-[1] tracking-[-0.035em]">
            Set a{" "}
            <span className="font-serif italic font-normal">new password.</span>
          </h1>
          <p className="mb-8 text-[15px] leading-[1.5] text-muted">
            Choose a new password for{" "}
            <strong className="text-ink">{reset.email}</strong>. This link
            expires in {minutesLeft} {minutesLeft === 1 ? "minute" : "minutes"}.
          </p>

          <ResetPasswordForm token={token} email={reset.email} />
        </div>
      </section>
    </main>
  );
}

function ResetUnavailable() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center px-4 sm:h-20 sm:px-8">
          <Link
            href="/"
            className="relative flex items-center"
            aria-label="PraxTalk home"
          >
            <Image
              src="/praxtalk-logo.png"
              alt="PraxTalk"
              width={1419}
              height={336}
              priority
              className="h-10 w-auto sm:h-12"
            />
          </Link>
          <div className="ml-auto text-sm text-muted">
            <Link
              href="/login"
              className="text-ink underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[460px] text-center">
          <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
            <span className="size-1.5 rounded-full bg-warn shadow-[0_0_0_4px_rgba(255,200,80,0.18)]" />
            Reset link unavailable
          </div>
          <h1 className="mb-2 text-[40px] font-semibold leading-[1] tracking-[-0.035em]">
            This link won&apos;t work.
          </h1>
          <p className="mb-8 text-[15px] leading-[1.5] text-muted">
            The reset link is either expired, already used, or unknown. Request
            a fresh one from the forgot-password page.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/forgot-password"
              className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px"
            >
              Request a new link →
            </Link>
            <Link
              href="/login"
              className="text-[13px] font-medium text-muted underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

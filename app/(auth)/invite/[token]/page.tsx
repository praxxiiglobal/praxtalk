import Image from "next/image";
import Link from "next/link";
import { api } from "@/convex/_generated/api";
import { convexServer } from "@/lib/convexServer";
import { AcceptInviteForm } from "./AcceptInviteForm";

export const metadata = {
  title: "Accept invite · PraxTalk",
  robots: { index: false, follow: false },
};

export default async function AcceptInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await convexServer.query(api.invites.lookup, { token });

  if (!invite) {
    return <InviteUnavailable />;
  }

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
            Already on PraxTalk?{" "}
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
          <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
            Team invite
          </div>

          <h1 className="mb-2 text-[40px] font-semibold leading-[1] tracking-[-0.035em]">
            Join{" "}
            <span className="font-serif italic font-normal">
              {invite.workspaceName}
            </span>
          </h1>
          <p className="mb-8 text-[15px] leading-[1.5] text-muted">
            <strong className="text-ink">{invite.invitedByName}</strong>{" "}
            invited you as <strong className="text-ink">{invite.role}</strong>.
            Set your password to join — this link expires in{" "}
            {Math.max(
              0,
              Math.ceil((invite.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)),
            )}{" "}
            days.
          </p>

          <AcceptInviteForm
            token={token}
            email={invite.email}
            defaultName={invite.name ?? ""}
          />
        </div>
      </section>
    </main>
  );
}

function InviteUnavailable() {
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
            Invite unavailable
          </div>
          <h1 className="mb-2 text-[40px] font-semibold leading-[1] tracking-[-0.035em]">
            This link won&apos;t work.
          </h1>
          <p className="mb-8 text-[15px] leading-[1.5] text-muted">
            The invite has either been used, revoked, or expired. Ask the
            workspace owner to send a fresh one.
          </p>
          <div className="flex flex-col items-center gap-3">
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px"
            >
              Sign in instead →
            </Link>
            <Link
              href="/"
              className="text-[13px] font-medium text-muted underline-offset-4 hover:underline"
            >
              Back to praxtalk.com
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

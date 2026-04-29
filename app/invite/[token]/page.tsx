import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
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
  if (!invite) notFound();

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

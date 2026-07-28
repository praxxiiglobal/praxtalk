import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "../actions";

/**
 * Shown to operators of workspaces still in `platformStatus = pending_review`.
 * Replaces the entire dashboard until a Praxxii staff member approves the
 * workspace via /admin/workspaces. The operator can sign out + email
 * support; nothing else is reachable.
 */
export function PendingReviewScreen({
  workspaceName,
  ownerName,
  reason,
}: {
  workspaceName: string;
  ownerName: string;
  reason: string | null;
}) {
  return (
    <main className="flex min-h-screen flex-col bg-paper text-ink">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center px-6">
          <Link href="/" className="flex items-center" aria-label="PraxTalk">
            <Image
              src="/praxtalk-logo.png"
              alt="PraxTalk"
              width={1419}
              height={336}
              priority
              className="h-9 w-auto"
            />
          </Link>
          <form action={logoutAction} className="ml-auto">
            <button
              type="submit"
              className="inline-flex h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium text-ink hover:bg-paper-2"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[560px] rounded-3xl border border-rule-2 bg-paper p-8 shadow-[0_24px_48px_-24px_rgba(11,15,18,0.16)] sm:p-10">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-yellow-100 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-yellow-800">
            <span aria-hidden>⏳</span>
            Pending review
          </div>
          <h1 className="text-[32px] font-semibold leading-[1.05] tracking-[-0.025em] sm:text-[40px]">
            Hi {ownerName.split(" ")[0]} — your workspace is being
            reviewed.
          </h1>
          <p className="mt-4 text-[15px] leading-[1.55] text-muted">
            <strong className="text-ink">{workspaceName}</strong> was
            created and is waiting for a Praxxii staff member to approve
            access. This usually takes under one business day.
          </p>
          {reason && (
            <div className="mt-5 rounded-xl border border-rule-2 bg-paper-2/50 px-4 py-3 text-[13px] leading-[1.55] text-ink">
              <div className="font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                Note from PraxTalk
              </div>
              <div className="mt-1">{reason}</div>
            </div>
          )}

          <div className="mt-7 space-y-3 text-[13.5px] leading-[1.55] text-ink">
            <Bullet>
              You&apos;ll get an email at the address you signed up with
              the moment your workspace is approved.
            </Bullet>
            <Bullet>
              Once approved, your inbox + widget snippet + Atlas AI all
              activate automatically — no further setup needed.
            </Bullet>
            <Bullet>
              Need access faster? Email us with a one-line description of
              what you&apos;re building.
            </Bullet>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="mailto:hello@praxtalk.com?subject=Workspace%20review%20%E2%80%94%20speed%20up%20approval"
              className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-sm font-medium text-paper transition hover:-translate-y-px"
            >
              Email hello@praxtalk.com
            </a>
            <Link
              href="/docs"
              className="inline-flex h-10 items-center rounded-full border border-rule-2 px-5 text-sm font-medium text-ink transition hover:bg-paper-2"
            >
              Browse the docs while you wait
            </Link>
          </div>

          <p className="mt-8 font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
            We approve every signup individually during open beta to
            keep abuse out + give the AI agent a clean dataset. Thanks
            for your patience.
          </p>
        </div>
      </section>
    </main>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        aria-hidden
        className="mt-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-semibold text-paper"
      >
        ✓
      </span>
      <span>{children}</span>
    </div>
  );
}

import Link from "next/link";
import { Mark } from "@/components/marketing/Mark";
import { SetupForm } from "./SetupForm";

export const metadata = {
  title: "Set up your workspace · PraxTalk",
  description:
    "Create your PraxTalk workspace in under a minute. Free forever for 100 AI resolutions per month.",
};

export default function SetupPage() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 font-semibold tracking-tight text-ink"
          >
            <Mark className="text-ink" />
            <span>PraxTalk</span>
          </Link>
          <div className="ml-auto text-sm text-muted">
            Already have a workspace?{" "}
            <Link href="/login" className="text-ink underline-offset-4 hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[440px]">
          <div className="eyebrow mb-3 inline-flex items-center gap-2.5 text-muted">
            <span className="size-1.5 rounded-full bg-accent shadow-[0_0_0_4px_var(--color-accent-soft)]" />
            Open beta · free for 100 AI res/mo
          </div>

          <h1 className="mb-2 text-[44px] font-semibold leading-[1] tracking-[-0.035em]">
            Spin up your <span className="font-serif italic font-normal">workspace.</span>
          </h1>
          <p className="mb-8 text-[15px] leading-[1.5] text-muted">
            Two minutes. No credit card. You&apos;ll get an embed snippet for
            your site and a dashboard to reply from.
          </p>

          <SetupForm />
        </div>
      </section>
    </main>
  );
}

import Link from "next/link";
import { Mark } from "@/components/marketing/Mark";
import { LoginForm } from "./LoginForm";

export const metadata = {
  title: "Sign in · PraxTalk",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

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
            New here?{" "}
            <Link
              href="/setup"
              className="text-ink underline-offset-4 hover:underline"
            >
              Create a workspace
            </Link>
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px]">
          <h1 className="mb-2 text-[40px] font-semibold leading-[1] tracking-[-0.035em]">
            Welcome <span className="font-serif italic font-normal">back.</span>
          </h1>
          <p className="mb-8 text-[15px] leading-[1.5] text-muted">
            Sign in to your PraxTalk workspace.
          </p>

          {expired === "1" && (
            <div
              role="status"
              className="mb-5 rounded-xl border border-rule-2 bg-paper-2 px-4 py-3 text-sm text-ink"
            >
              Your session expired. Sign in again to continue.
            </div>
          )}

          <LoginForm />
        </div>
      </section>
    </main>
  );
}

import Image from "next/image";
import Link from "next/link";
import { AuthMobileMenu } from "@/components/marketing/AuthMobileMenu";
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
          <div className="ml-auto hidden text-sm text-muted sm:block">
            New here?{" "}
            <Link
              href="/setup"
              className="text-ink underline-offset-4 hover:underline"
            >
              Create a workspace
            </Link>
          </div>
          <div className="ml-auto sm:hidden">
            <AuthMobileMenu
              items={[
                { label: "Home", href: "/" },
                { label: "Create a workspace", href: "/setup", primary: true },
              ]}
            />
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

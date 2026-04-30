import Image from "next/image";
import Link from "next/link";
import { AuthMobileMenu } from "@/components/marketing/AuthMobileMenu";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = {
  title: "Reset your password · PraxTalk",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
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
            Remembered it?{" "}
            <Link
              href="/login"
              className="text-ink underline-offset-4 hover:underline"
            >
              Sign in
            </Link>
          </div>
          <div className="ml-auto sm:hidden">
            <AuthMobileMenu
              items={[
                { label: "Sign in", href: "/login", primary: true },
                { label: "Home", href: "/" },
              ]}
            />
          </div>
        </div>
      </header>

      <section className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-[400px]">
          <h1 className="mb-2 text-[40px] font-semibold leading-[1] tracking-[-0.035em]">
            Reset your{" "}
            <span className="font-serif italic font-normal">password.</span>
          </h1>
          <p className="mb-8 text-[15px] leading-[1.5] text-muted">
            Enter the email on your PraxTalk account. We&apos;ll send a link
            you can use to set a new password.
          </p>

          <ForgotPasswordForm />

          <p className="mt-8 text-[13px] text-muted">
            <Link
              href="/login"
              className="text-ink underline-offset-4 hover:underline"
            >
              Back to sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}

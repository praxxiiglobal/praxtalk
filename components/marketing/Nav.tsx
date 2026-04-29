"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const links = [
  { href: "/#product", label: "Product", caret: true },
  { href: "/#ai", label: "AI Suite", caret: true },
  { href: "/#compare", label: "Why Prax" },
  { href: "/#integrations", label: "Integrations" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

export function Nav() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-rule bg-paper/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center gap-4 px-4 sm:h-20 sm:gap-10 sm:px-8">
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

          <div className="hidden items-center gap-7 text-sm md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex items-center gap-1 text-ink/85 transition hover:text-ink"
              >
                {l.label}
                {l.caret && <span className="text-[9px] opacity-60">▾</span>}
              </Link>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/login"
              className="eyebrow hidden rounded-full border border-rule-2 px-2.5 py-1.5 sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              href="mailto:hello@praxtalk.com?subject=PraxTalk%20demo%20request"
              className="hidden h-9 items-center rounded-full border border-rule-2 px-4 text-sm font-medium transition hover:-translate-y-px sm:inline-flex"
            >
              Book demo
            </Link>
            <Link
              href="/setup"
              className="group hidden h-9 items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-paper transition hover:-translate-y-px hover:bg-black sm:inline-flex"
            >
              Start free
              <span aria-hidden className="transition group-hover:translate-x-0.5">
                →
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="inline-flex size-10 items-center justify-center rounded-full border border-rule-2 bg-paper text-ink transition hover:bg-paper-2 md:hidden"
            >
              <HamburgerIcon />
            </button>
          </div>
        </div>
      </nav>

      {open && (
        <MobileDrawer onClose={() => setOpen(false)}>
          <ul className="flex flex-col gap-1">
            {links.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 text-base font-medium text-ink transition hover:bg-paper-2"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex flex-col gap-2 border-t border-rule pt-6">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-rule-2 text-sm font-medium"
            >
              Sign in
            </Link>
            <Link
              href="mailto:hello@praxtalk.com?subject=PraxTalk%20demo%20request"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-full border border-rule-2 text-sm font-medium"
            >
              Book demo
            </Link>
            <Link
              href="/setup"
              onClick={() => setOpen(false)}
              className="inline-flex h-11 items-center justify-center rounded-full bg-ink text-sm font-medium text-paper"
            >
              Start free
            </Link>
          </div>
        </MobileDrawer>
      )}
    </>
  );
}

export function HamburgerIcon() {
  return (
    <svg
      width="18"
      height="14"
      viewBox="0 0 18 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M1 1h16M1 7h16M1 13h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M1 1l12 12M13 1L1 13" />
    </svg>
  );
}

export function MobileDrawer({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[60] md:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close menu"
      />
      <div className="absolute inset-x-0 top-0 max-h-[90vh] overflow-y-auto rounded-b-2xl bg-paper shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-rule px-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-muted">
            Menu
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="inline-flex size-9 items-center justify-center rounded-full border border-rule-2 text-ink transition hover:bg-paper-2"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="px-4 py-5">{children}</div>
      </div>
    </div>
  );
}

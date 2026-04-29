"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { HamburgerIcon, MobileDrawer } from "./Nav";

type Item = { label: string; href: string; primary?: boolean };

export function AuthMobileMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="inline-flex size-10 items-center justify-center rounded-full border border-rule-2 bg-paper text-ink transition hover:bg-paper-2 sm:hidden"
      >
        <HamburgerIcon />
      </button>

      {open && (
        <MobileDrawer onClose={() => setOpen(false)}>
          <ul className="flex flex-col gap-2">
            {items.map((it) => (
              <li key={it.href}>
                <Link
                  href={it.href}
                  onClick={() => setOpen(false)}
                  className={
                    it.primary
                      ? "inline-flex h-11 w-full items-center justify-center rounded-full bg-ink text-sm font-medium text-paper"
                      : "inline-flex h-11 w-full items-center justify-center rounded-full border border-rule-2 text-sm font-medium"
                  }
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </MobileDrawer>
      )}
    </>
  );
}

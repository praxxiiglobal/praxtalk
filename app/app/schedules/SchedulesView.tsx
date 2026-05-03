"use client";

import { useState } from "react";
import { RemindersView } from "../reminders/RemindersView";
import { BookingPagesView } from "../booking-pages/BookingPagesView";
import { cn } from "@/lib/cn";

type Tab = "reminders" | "bookings";

const TABS: { value: Tab; label: string; icon: string }[] = [
  { value: "reminders", label: "Reminders", icon: "🔔" },
  { value: "bookings", label: "Booking pages", icon: "📅" },
];

/**
 * Combined schedules view — tabs between the two time-based features.
 * Each tab is the existing view rendered in-place (zero copy-paste).
 */
export function SchedulesView() {
  const [tab, setTab] = useState<Tab>("reminders");
  return (
    <>
      <div className="flex items-center gap-1 border-b border-rule pb-3">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            onClick={() => setTab(t.value)}
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[12px] font-medium transition",
              tab === t.value
                ? "bg-ink text-paper"
                : "text-muted hover:text-ink",
            )}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        ))}
      </div>
      {tab === "reminders" ? <RemindersView /> : <BookingPagesView />}
    </>
  );
}

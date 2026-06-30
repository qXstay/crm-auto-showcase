"use client";

import Link from "next/link";
import clsx from "clsx";
import type { BookingTabId } from "@/features/booking/types";

type BookingTabsProps = {
  activeTab: BookingTabId;
};

const tabs = [
  { id: "day" as const, label: "День", href: "/booking/day" },
  { id: "month" as const, label: "Месяц", href: "/booking/month" },
  { id: "new" as const, label: "Новая запись", href: "/booking/new" },
];

export function BookingTabs({ activeTab }: BookingTabsProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 border-b border-[color:var(--border)] px-1">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={clsx(
            "border-b-2 px-0.5 py-2 text-[13px] font-medium",
            activeTab === tab.id
              ? "border-[color:var(--primary)] text-[color:var(--primary)]"
              : "border-transparent text-[color:var(--muted)]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

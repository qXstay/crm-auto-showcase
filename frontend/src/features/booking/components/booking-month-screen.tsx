"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BookingMonthGrid } from "@/features/booking/components/booking-month-grid";
import {
  addMonthsToMonthKey,
  formatDateKey,
  formatMonthKey,
  normalizeDateKey,
  normalizeMonthKey,
  parseDateKey,
  parseMonthKey,
} from "@/features/booking/date-utils";
import { fetchBookingsViaApi } from "@/features/booking/repository";
import { countUniqueBookings } from "@/features/booking/storage";
import type { BookingEntry } from "@/features/booking/types";

function formatMonthBookingCount(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} запись на месяц`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} записи на месяц`;
  }

  return `${value} записей на месяц`;
}

type BookingMonthScreenProps = {
  initialEntries: BookingEntry[];
  initialDate?: string;
  initialMonth?: string;
};

function isDateInMonth(dateKey: string, monthKey: string) {
  return dateKey.slice(0, 7) === monthKey;
}

function moveDateToMonth(dateKey: string, monthKey: string) {
  const currentDate = parseDateKey(dateKey);
  const monthDate = parseMonthKey(monthKey);
  const maxDay = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0).getDate();
  const nextDay = Math.min(currentDate.getDate(), maxDay);

  return formatDateKey(
    new Date(monthDate.getFullYear(), monthDate.getMonth(), nextDay, 12, 0, 0, 0),
  );
}

export function BookingMonthScreen({
  initialEntries,
  initialDate,
  initialMonth,
}: BookingMonthScreenProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState<BookingEntry[]>(initialEntries);
  const fallbackMonth = initialMonth ?? formatMonthKey(new Date());
  const fallbackDate = initialDate ?? formatDateKey(new Date());
  const queryMonth = normalizeMonthKey(searchParams.get("month"));
  const queryDate = normalizeDateKey(searchParams.get("date"));
  const activeMonth = queryMonth ?? fallbackMonth;
  const selectedDate = queryDate ?? fallbackDate;

  const replaceMonthQuery = useCallback(
    (nextMonthKey: string, nextDateKey: string) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("month", nextMonthKey);
      nextParams.set("date", nextDateKey);
      startTransition(() => {
        router.replace(`${pathname}?${nextParams.toString()}`, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    let cancelled = false;

    void fetchBookingsViaApi()
      .then(({ entries: backendEntries }) => {
        if (!cancelled) {
          setEntries(backendEntries);
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  const activeMonthDate = parseMonthKey(activeMonth);
  const todayKey = formatDateKey(new Date());
  const effectiveSelectedDate = isDateInMonth(selectedDate, activeMonth)
    ? selectedDate
    : isDateInMonth(todayKey, activeMonth)
      ? todayKey
      : formatDateKey(activeMonthDate);

  useEffect(() => {
    if (queryMonth === activeMonth && queryDate === effectiveSelectedDate) {
      return;
    }

    replaceMonthQuery(activeMonth, effectiveSelectedDate);
  }, [activeMonth, effectiveSelectedDate, queryDate, queryMonth, replaceMonthQuery]);

  const monthEntries = useMemo(
    () =>
      entries.filter((entry) => {
        const entryDate = parseMonthKey(entry.date.slice(0, 7));

        return (
          entryDate.getFullYear() === activeMonthDate.getFullYear() &&
          entryDate.getMonth() === activeMonthDate.getMonth()
        );
      }),
    [activeMonthDate, entries],
  );
  const monthTitle = activeMonthDate.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric",
  });
  const monthCountLabel = formatMonthBookingCount(countUniqueBookings(monthEntries));
  const currentDate = formatDateKey(new Date());
  const dayViewHref = `/booking/day?date=${effectiveSelectedDate}`;

  return (
    <section className="space-y-1.5">
      <div className="flex items-center justify-between px-1 pt-1">
        <p className="text-[13px] font-medium text-[color:var(--primary)]">Календарь</p>
        <Link
          href={dayViewHref}
          className="text-[13px] text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
        >
          День
        </Link>
      </div>

      <div className="border border-[color:var(--border)] bg-white">
        <div className="flex flex-wrap items-center gap-2 border-b border-[color:var(--border)] px-3 py-2">
          <h1 className="capitalize text-[16px] font-semibold text-[color:var(--foreground)]">
            {monthTitle}
          </h1>
          <span className="text-[13px] text-[color:var(--muted)]">{monthCountLabel}</span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => {
                const nextMonth = addMonthsToMonthKey(activeMonth, -1);
                const nextDate = moveDateToMonth(effectiveSelectedDate, nextMonth);
                replaceMonthQuery(nextMonth, nextDate);
              }}
              className="flex h-6 w-6 items-center justify-center"
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => {
                const nextMonth = addMonthsToMonthKey(activeMonth, 1);
                const nextDate = moveDateToMonth(effectiveSelectedDate, nextMonth);
                replaceMonthQuery(nextMonth, nextDate);
              }}
              className="flex h-6 w-6 items-center justify-center"
              aria-label="Следующий месяц"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="p-2">
          <BookingMonthGrid
            activeMonth={activeMonth}
            currentDate={currentDate}
            entries={monthEntries}
            selectedDate={effectiveSelectedDate}
          />
        </div>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { formatDateKey, parseDateKey } from "@/features/booking/date-utils";
import type { BookingEntry } from "@/features/booking/types";

type BookingMonthGridProps = {
  activeMonth: string;
  currentDate: string;
  entries: BookingEntry[];
  selectedDate?: string;
};

function buildCalendarCells(activeMonth: string, entries: BookingEntry[], currentDate: string) {
  const monthDate = parseDateKey(`${activeMonth}-01`);
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const entriesByDate = new Map<string, BookingEntry[]>();

  entries.forEach((entry) => {
    if (!entriesByDate.has(entry.date)) {
      entriesByDate.set(entry.date, []);
    }

    entriesByDate.get(entry.date)?.push(entry);
  });

  return Array.from({ length: 42 }, (_, index) => {
    const day = index - startOffset + 1;

    if (day < 1 || day > daysInMonth) {
      return {
        key: `empty-${index}`,
        day: "",
        isToday: false,
        entries: [] as BookingEntry[],
      };
    }

    const dateKey = formatDateKey(new Date(year, month, day, 12, 0, 0, 0));
    const dayEntries = [...(entriesByDate.get(dateKey) ?? [])].sort((left, right) =>
      left.startTime.localeCompare(right.startTime),
    );

    return {
      key: dateKey,
      day: String(day),
      isToday: dateKey === currentDate,
      entries: dayEntries,
    };
  });
}

export function BookingMonthGrid({
  activeMonth,
  currentDate,
  entries,
  selectedDate,
}: BookingMonthGridProps) {
  const calendarCells = buildCalendarCells(activeMonth, entries, currentDate);

  return (
    <div className="overflow-x-auto border border-[color:var(--border)] bg-white">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-7 border-b border-[color:var(--border)] text-[11px] font-medium text-[color:var(--muted)]">
          {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((day) => (
            <div key={day} className="border-r border-[color:var(--border)] px-2 py-1.5 last:border-r-0">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
        {calendarCells.map((cell, index) => (
          <div
            key={`${cell.key}-${cell.day || index}`}
            className={
              cell.day
                ? cell.key === selectedDate
                  ? "group min-h-[108px] border-r border-b border-[color:var(--border)] bg-[color:var(--primary)]/5 px-2 py-1.5 transition-colors last:border-r-0"
                  : "group min-h-[108px] border-r border-b border-[color:var(--border)] px-2 py-1.5 transition-colors hover:bg-[color:var(--background)]/55 last:border-r-0"
                : "min-h-[108px] border-r border-b border-[color:var(--border)] px-2 py-1.5 last:border-r-0"
            }
          >
            {cell.day ? (
              <>
                <Link
                  href={`/booking/day?date=${cell.key}`}
                  className={
                    cell.key === selectedDate
                      ? "flex min-h-[28px] items-start justify-between rounded-[4px] px-1 py-0.5 text-[12px] font-semibold text-[color:var(--primary)]"
                      : cell.isToday
                        ? "flex min-h-[28px] items-start justify-between rounded-[4px] px-1 py-0.5 text-[12px] font-semibold text-[color:var(--foreground)] hover:bg-[color:var(--background)]"
                        : "flex min-h-[28px] items-start justify-between rounded-[4px] px-1 py-0.5 text-[12px] font-medium text-[color:var(--foreground)] hover:bg-[color:var(--background)]"
                  }
                >
                  <span>{cell.day}</span>
                  {cell.isToday ? (
                    <span
                      className={
                        cell.key === selectedDate
                          ? "rounded-[4px] bg-[color:var(--primary)]/14 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[color:var(--primary)]"
                          : "rounded-[4px] bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-slate-600"
                      }
                    >
                      Сегодня
                    </span>
                  ) : null}
                </Link>

                <div className="mt-1.5 space-y-1">
                  {cell.entries.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/booking/day?date=${entry.date}`}
                      className="block rounded-[4px] border border-[#ead9ca] bg-[#f8f0ea] px-2 py-1.5 text-[11px] leading-4 text-[color:var(--foreground)] transition-colors hover:border-[#dac6b3] hover:bg-[#f3e7de]"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-[0.04em] text-[#8f6f5a]">
                        {entry.startTime}
                      </div>
                      <div className="mt-0.5 truncate text-[11px] font-medium text-[color:var(--foreground)]">
                        {entry.client}
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}

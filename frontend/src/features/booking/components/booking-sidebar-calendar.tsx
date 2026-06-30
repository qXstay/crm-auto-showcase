"use client";

import clsx from "clsx";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { BookingUpcomingList } from "@/features/booking/components/booking-upcoming-list";
import {
  formatDateKey,
  parseDateKey,
} from "@/features/booking/date-utils";
import type { BookingGroupView } from "@/features/booking/types";

type BookingSidebarCalendarProps = {
  activeDate: string;
  onSelectDate: (date: string) => void;
  onSelectPreviousMonth: () => void;
  onSelectNextMonth: () => void;
  onSelectToday: () => void;
  onSelectTomorrow: () => void;
  upcomingEntries: BookingGroupView[];
  fallbackUpcomingEntries: BookingGroupView[];
  fallbackUpcomingSubtitle: string | null;
};

function buildCalendarDays(activeDate: Date) {
  const year = activeDate.getFullYear();
  const month = activeDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const result: Array<{ key: string; label: string; date: string; inCurrentMonth: boolean }> = [];

  for (let index = 0; index < startOffset; index += 1) {
    result.push({
      key: `empty-${index}`,
      label: "",
      date: "",
      inCurrentMonth: false,
    });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    result.push({
      key: formatDateKey(date),
      label: String(day),
      date: formatDateKey(date),
      inCurrentMonth: true,
    });
  }

  return result;
}

export function BookingSidebarCalendar({
  activeDate,
  onSelectDate,
  onSelectPreviousMonth,
  onSelectNextMonth,
  onSelectToday,
  onSelectTomorrow,
  upcomingEntries,
  fallbackUpcomingEntries,
  fallbackUpcomingSubtitle,
}: BookingSidebarCalendarProps) {
  const selectedDate = parseDateKey(activeDate);
  const monthLabel = selectedDate.toLocaleDateString("ru-RU", {
    month: "long",
  });
  const calendarDays = useMemo(() => buildCalendarDays(selectedDate), [selectedDate]);
  const selectedDayLabel = selectedDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  return (
    <aside className="w-full border-t border-[color:var(--border)] bg-[#fcfcfe] xl:border-l xl:border-t-0">
      <div className="border-b border-[color:var(--border)] px-5 py-4">
        <p className="text-[13px] font-medium text-[color:var(--primary)]">Выбранный день</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <div className="min-h-[3.375rem]">
            <p className="text-[20px] font-semibold capitalize text-[color:var(--foreground)] [font-variant-numeric:tabular-nums]">
              {monthLabel}
            </p>
            <p className="mt-1 text-[14px] capitalize text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
              {selectedDayLabel}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSelectPreviousMonth}
              className="flex h-9 w-9 items-center justify-center border border-[color:var(--border)] bg-white text-[color:var(--muted)]"
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onSelectNextMonth}
              className="flex h-9 w-9 items-center justify-center border border-[color:var(--border)] bg-white text-[color:var(--muted)]"
              aria-label="Следующий месяц"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="grid grid-cols-7 gap-1.5 text-center text-[12px] font-medium text-[color:var(--muted)]">
          {["ПН", "ВТ", "СР", "ЧТ", "ПТ", "СБ", "ВС"].map((day) => (
            <span key={day} className="py-1.5">
              {day}
            </span>
          ))}
        </div>

        <div className="mt-2.5 grid grid-cols-7 gap-1.5">
          {calendarDays.map((day) => (
            <button
              key={day.key}
              type="button"
              onClick={() => day.date && onSelectDate(day.date)}
              className={clsx(
                "flex h-10 items-center justify-center text-[14px] [font-variant-numeric:tabular-nums]",
                day.inCurrentMonth
                  ? "text-[color:var(--foreground)]"
                  : "text-transparent",
                day.date === activeDate
                  ? "bg-[color:var(--primary)] font-medium text-white"
                  : "bg-white",
              )}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-[color:var(--border)] px-5 py-4">
        <p className="text-[14px] font-medium text-[color:var(--foreground)]">Быстрый выбор</p>
        <div className="mt-3 flex flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onSelectToday}
            className="h-9 border border-[color:var(--primary)]/25 bg-[color:var(--primary)]/6 px-4 text-[13px] font-medium text-[color:var(--primary)]"
          >
            Сегодня
          </button>
          <button
            type="button"
            onClick={onSelectTomorrow}
            className="h-9 border border-[color:var(--border)] bg-white px-4 text-[13px] text-[color:var(--foreground)]"
          >
            Завтра
          </button>
        </div>
        <p className="mt-4 text-[13px] leading-5 text-[color:var(--muted)]">
          Выберите день и выделите интервалы в сетке, чтобы собрать одну запись.
        </p>
      </div>

      <div className="min-h-[24rem]">
        <BookingUpcomingList
          title="Записи на выбранный день"
          subtitle={selectedDayLabel}
          entries={upcomingEntries}
          emptyLabel="На выбранный день записей нет"
        />
        {upcomingEntries.length === 0 && fallbackUpcomingEntries.length > 0 ? (
          <BookingUpcomingList
            title={fallbackUpcomingEntries.length === 1 ? "Ближайшая запись" : "Ближайшие записи"}
            subtitle={fallbackUpcomingSubtitle ?? undefined}
            entries={fallbackUpcomingEntries}
            emptyLabel="Нет будущих записей"
          />
        ) : null}
      </div>
    </aside>
  );
}

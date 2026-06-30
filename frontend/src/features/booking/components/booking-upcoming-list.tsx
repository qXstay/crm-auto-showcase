"use client";

import Link from "next/link";
import type { BookingGroupView } from "@/features/booking/types";

type BookingUpcomingListProps = {
  title?: string;
  subtitle?: string;
  entries: BookingGroupView[];
  emptyLabel?: string;
  minBodyHeightClassName?: string;
};

export function BookingUpcomingList({
  title = "Записи на выбранный день",
  subtitle,
  entries,
  emptyLabel = "На выбранный день записей нет",
  minBodyHeightClassName = "min-h-[10.5rem]",
}: BookingUpcomingListProps) {
  return (
    <div className="border-t border-[color:var(--border)] px-4 py-4 sm:px-5">
      <div className="min-h-[3rem]">
        <p className="text-[14px] font-medium text-[color:var(--foreground)]">{title}</p>
        {subtitle ? (
          <p className="mt-1 text-[12px] capitalize text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
            {subtitle}
          </p>
        ) : null}
      </div>

      {entries.length > 0 ? (
        <div className={`mt-3 space-y-2.5 ${minBodyHeightClassName}`}>
          {entries.map((entry) => {
            const content = (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="border border-[color:var(--border)] bg-[#f6f3ef] px-2 py-0.5 text-[12px] font-semibold text-[color:var(--foreground)] shadow-[inset_0_1px_0_rgba(255,255,255,0.55)] [font-variant-numeric:tabular-nums]">
                      {entry.timeLabel}
                    </span>
                    {entry.isOnline ? (
                      <span className="inline-flex shrink-0 border border-[color:var(--primary)]/18 bg-[color:var(--primary)]/8 px-2 py-0.5 text-[11px] font-medium text-[color:var(--primary)]">
                        Онлайн-запись
                      </span>
                    ) : null}
                  </div>
                  <span className="pt-0.5 text-[12px] font-medium text-[color:var(--muted)] sm:shrink-0">
                    {entry.postLabel}
                  </span>
                </div>
                <div
                  className="mt-2 text-[14px] font-semibold leading-5 text-[color:var(--foreground)]"
                  style={{ overflowWrap: "anywhere", wordBreak: "break-word" }}
                >
                  {entry.client}
                </div>
                {entry.phone ? (
                  <div className="mt-1 text-[12px] leading-5 text-[color:var(--muted)]">
                    {entry.phone}
                  </div>
                ) : null}
                {entry.comment ? (
                  <div
                    className="mt-1 text-[12px] leading-5 text-[color:var(--muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                      overflowWrap: "anywhere",
                      wordBreak: "break-word",
                    }}
                  >
                    {entry.comment}
                  </div>
                ) : null}
              </>
            );

            if (entry.clientId) {
              return (
                <Link
                  key={entry.id}
                  href={`/clients/${entry.clientId}`}
                  className="block cursor-pointer rounded-sm border border-[color:var(--border)] bg-white px-3 py-2.5 text-[13px] leading-5 text-[color:var(--foreground)] shadow-[0_1px_0_rgba(15,23,42,0.02)] transition-colors hover:border-[color:var(--primary)]/25 hover:bg-[#fafafa]"
                >
                  {content}
                </Link>
              );
            }

            return (
              <div
                key={entry.id}
                className="rounded-sm border border-[color:var(--border)] bg-white px-3 py-2.5 text-[13px] leading-5 text-[color:var(--foreground)] shadow-[0_1px_0_rgba(15,23,42,0.02)]"
              >
                {content}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={`mt-3 border border-[color:var(--border)] bg-white px-3 py-2.5 text-[13px] leading-5 text-[color:var(--muted)] ${minBodyHeightClassName}`}
        >
          {emptyLabel}
        </div>
      )}
    </div>
  );
}

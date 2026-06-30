"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { X } from "lucide-react";
import type {
  BookingDraftSegment,
  BookingEntry,
  BookingPost,
  BookingPostId,
} from "@/features/booking/types";

const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 21 * 60 + 45;
const SLOT_STEP_MINUTES = 15;
const SLOT_HEIGHT = 24;
const TIME_COLUMN_WIDTH = 96;
const HEADER_HEIGHT = 44;
const TOTAL_SLOTS = (DAY_END_MINUTES - DAY_START_MINUTES) / SLOT_STEP_MINUTES;

type BookingDayGridProps = {
  date?: string;
  todayKey?: string;
  tomorrowKey?: string;
  entries?: BookingEntry[];
  posts: BookingPost[];
  slotWindowMinutes?: number;
  allowMultipleWindows?: boolean;
  draftSegments?: BookingDraftSegment[];
  activeDraftSegmentId?: string | null;
  currentTimeLabel?: string;
  showCurrentTime?: boolean;
  canCreateDraft?: boolean;
  canDeleteEntry?: (entry: BookingEntry) => boolean;
  onDeleteGroupRequest?: (groupId: string) => void;
  onSelectDate?: (date: string) => void;
  onDraftCreate?: (segment: { date: string; postId: BookingPostId; start: string; end: string }) => void;
  onDraftSegmentSelect?: (segmentId: string) => void;
};

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function formatTime(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getSlotIndex(time: string) {
  return Math.max(0, Math.floor((parseTime(time) - DAY_START_MINUTES) / SLOT_STEP_MINUTES));
}

function overlaps(input: {
  startTime: string;
  endTime: string;
  againstStart: string;
  againstEnd: string;
}) {
  return (
    parseTime(input.startTime) < parseTime(input.againstEnd) &&
    parseTime(input.againstStart) < parseTime(input.endTime)
  );
}

export function BookingDayGrid({
  date = "2026-03-15",
  todayKey = date,
  tomorrowKey = date,
  entries = [],
  posts,
  slotWindowMinutes = 15,
  allowMultipleWindows = false,
  draftSegments = [],
  activeDraftSegmentId,
  currentTimeLabel = "00:00",
  showCurrentTime,
  canCreateDraft = true,
  canDeleteEntry,
  onDeleteGroupRequest,
  onSelectDate,
  onDraftCreate,
  onDraftSegmentSelect,
}: BookingDayGridProps) {
  const [mobilePostId, setMobilePostId] = useState<BookingPostId | "any">("any");
  const [mobileSelectedDurationMinutes, setMobileSelectedDurationMinutes] = useState<number | null>(null);
  const [mobileSelectedIntervalKey, setMobileSelectedIntervalKey] = useState<string>("");
  const [dragState, setDragState] = useState<{
    postId: BookingPostId;
    startIndex: number;
    currentIndex: number;
  } | null>(null);

  const slotRows = Array.from({ length: TOTAL_SLOTS }, (_, index) => {
    const minutes = DAY_START_MINUTES + index * SLOT_STEP_MINUTES;
    return {
      index,
      time: formatTime(minutes),
      showHour: minutes % 60 === 0,
    };
  });

  const durationMinutes = allowMultipleWindows ? (mobileSelectedDurationMinutes ?? slotWindowMinutes) : slotWindowMinutes;
  const durationOptions = Array.from({ length: Math.floor((4 * 60) / slotWindowMinutes) }).map(
    (_, i) => (i + 1) * slotWindowMinutes
  );

  function formatDurationLabel(minutes: number) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} мин`;
    if (m === 0) return `${h} ч`;
    return `${h} ч ${m} мин`;
  }

  useEffect(() => {
    if (!dragState) {
      return undefined;
    }

    function handleMouseUp() {
      const currentDragState = dragState;

      if (!currentDragState) {
        return;
      }

      const startIndex = Math.min(currentDragState.startIndex, currentDragState.currentIndex);
      const endIndex = Math.max(currentDragState.startIndex, currentDragState.currentIndex) + 1;

      onDraftCreate?.({
        date,
        postId: currentDragState.postId,
        start: formatTime(DAY_START_MINUTES + startIndex * SLOT_STEP_MINUTES),
        end: formatTime(DAY_START_MINUTES + endIndex * SLOT_STEP_MINUTES),
      });
      setDragState(null);
    }

    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [date, dragState, onDraftCreate]);

  function isIntervalFree(postId: BookingPostId, startTime: string, endTime: string) {
    const blockedByEntries = entries.some(
      (entry) =>
        entry.postId === postId &&
        overlaps({
          startTime,
          endTime,
          againstStart: entry.startTime,
          againstEnd: entry.endTime,
        }),
    );

    if (blockedByEntries) {
      return false;
    }

    return !draftSegments.some(
      (segment) =>
        segment.postId === postId &&
        overlaps({
          startTime,
          endTime,
          againstStart: segment.start,
          againstEnd: segment.end,
        }),
    );
  }

  function buildMobileStartCandidates(durationMinutes: number) {
    const intervalStepMinutes = Math.max(slotWindowMinutes, SLOT_STEP_MINUTES);
    const latestStartMinutes = DAY_END_MINUTES - durationMinutes;
    const candidates: string[] = [];

    for (
      let startMinutes = DAY_START_MINUTES;
      startMinutes <= latestStartMinutes;
      startMinutes += intervalStepMinutes
    ) {
      candidates.push(formatTime(startMinutes));
    }

    return candidates;
  }

  const mobileIntervals = (() => {
    const startCandidates = buildMobileStartCandidates(durationMinutes);

    return startCandidates
      .map((startTime) => {
        const endTime = formatTime(parseTime(startTime) + durationMinutes);
        const matchingPosts = posts.filter((post) => isIntervalFree(post.id, startTime, endTime));
        const resolvedPost =
          mobilePostId === "any"
            ? matchingPosts[0] ?? null
            : matchingPosts.find((post) => post.id === mobilePostId) ?? null;

        if (!resolvedPost) {
          return null;
        }

        return {
          key: `${resolvedPost.id}-${startTime}-${endTime}`,
          postId: resolvedPost.id,
          postLabel: resolvedPost.label,
          startTime,
          endTime,
          durationMinutes,
        };
      })
      .filter((interval): interval is NonNullable<typeof interval> => Boolean(interval));
  })();

  const activeMobileInterval =
    mobileIntervals.find((interval) => interval.key === mobileSelectedIntervalKey) ??
    mobileIntervals[0] ??
    null;

  const mobileDateLabel = new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  const mobilePostOptions: Array<{ value: BookingPostId | "any"; label: string }> = [
    { value: "any", label: "Любой пост" },
    ...posts.map((post) => ({ value: post.id, label: post.label })),
  ];

  function renderExistingEntry(entry: BookingEntry) {
    const postIndex = posts.findIndex((post) => post.id === entry.postId);

    if (postIndex < 0) {
      return null;
    }

    const startIndex = getSlotIndex(entry.startTime);
    const span = Math.max(
      1,
      (parseTime(entry.endTime) - parseTime(entry.startTime)) / SLOT_STEP_MINUTES,
    );
    const currentMinutes = parseTime(currentTimeLabel);
    const entryStart = parseTime(entry.startTime);
    const entryEnd = parseTime(entry.endTime);
    const isPast = Boolean(showCurrentTime && entryEnd <= currentMinutes);
    const isCurrent = Boolean(showCurrentTime && entryStart <= currentMinutes && currentMinutes < entryEnd);
    const durationMinutes = entryEnd - entryStart;
    const isTiny = span <= 1;
    const isCompact = span <= 2;
    const isIntermediate = span === 3;
    const compactTimeLabel = isTiny ? entry.startTime : `${entry.startTime}-${entry.endTime}`;
    const isOnline = entry.service === "Онлайн-запись" || entry.createdByEmployeeId === null;
    const isShortOnline = isOnline && durationMinutes < 45;
    const isLarge = span >= 5;
    const showPhone = !isShortOnline && (!isCompact || isOnline) && Boolean(entry.phone);
    const showComment = isLarge && Boolean(entry.comment);
    const allowDelete = canDeleteEntry ? canDeleteEntry(entry) : true;
    const compactSecondaryLine = isTiny || isShortOnline
      ? ""
      : isOnline
        ? entry.phone || entry.comment || ""
        : entry.comment || entry.phone || "";
    const compactTimeClassName = clsx(
      "shrink-0 font-semibold tracking-[0.01em] text-[color:var(--foreground)]/80",
      isTiny ? "text-[11px] leading-4" : "text-[12px] leading-4",
    );
    const compactNameClassName = clsx(
      "min-w-0 truncate font-semibold leading-4",
      entry.clientId
        ? "text-[color:var(--primary)]"
        : entry.anonymous
          ? "text-[color:var(--muted)]"
          : "text-[color:var(--foreground)]",
      isTiny ? "text-[12px]" : "text-[13px]",
    );
    const timeClassName = clsx(
      "font-semibold tracking-[0.01em]",
      isTiny ? "text-[11px]" : isCompact ? "text-[12px]" : "text-[13px]",
    );
    const nameClassName = clsx(
      "font-semibold leading-5",
      entry.clientId ? "text-[color:var(--primary)]" : entry.anonymous ? "text-[color:var(--muted)]" : "text-[color:var(--foreground)]",
      isTiny ? "mt-0.5 text-[12px] leading-4" : isCompact ? "mt-0.5 text-[13px]" : "mt-1 text-[14px]",
    );
    const cardBodyStyle = {
      overflowWrap: "anywhere" as const,
      wordBreak: "break-word" as const,
    };

    return (
      <div
        key={entry.id}
        className={clsx(
          "group relative z-20 overflow-hidden border-l-2 text-left text-[13px] text-[color:var(--foreground)]",
          isTiny ? "mx-1 mt-0.5 px-1.5 py-0" : isCompact ? "mx-1.5 mt-1.5 px-2.5 py-1.5" : "mx-1.5 mt-1.5 px-3 py-2.5",
          isCurrent
            ? isShortOnline
              ? "border-[color:var(--primary)] bg-[color:var(--primary)]/10"
              : "border-[color:var(--primary)] bg-[color:var(--primary)]/14"
            : isPast
              ? "border-[#cfb7a3] bg-[#f0ebe5] text-[#746a61]"
              : isShortOnline
                ? "border-[color:var(--primary)]/65 bg-[color:var(--primary)]/6"
                : "border-[#d8c0a5] bg-[#f7eee5]",
        )}
        style={{
          gridColumn: postIndex + 2,
          gridRow: `${startIndex + 2} / span ${span}`,
        }}
      >
        {allowDelete ? (
          <button
            type="button"
            onClick={() => onDeleteGroupRequest?.(entry.groupId)}
            className={clsx(
              "absolute z-10 flex shrink-0 items-center justify-center rounded-sm text-[color:var(--muted)] transition-opacity hover:bg-white/70 hover:text-[color:var(--foreground)] hover:opacity-100 focus-visible:bg-white/70 focus-visible:opacity-100",
              isTiny
                ? "right-0.5 top-1/2 h-5 w-5 -translate-y-1/2 opacity-80"
                : isCompact
                ? "right-1 top-1/2 h-6 w-6 -translate-y-1/2 opacity-50"
                : "right-1.5 top-1.5 h-6 w-6 opacity-40",
            )}
            aria-label="Удалить запись"
          >
            <X className={clsx(isTiny ? "h-3.5 w-3.5" : "h-4 w-4")} />
          </button>
        ) : null}
        {entry.clientId ? (
          <Link
            href={`/clients/${entry.clientId}`}
            className={clsx(
              "block pr-5",
              isTiny && "pr-4",
              (isCompact || isIntermediate) && "flex h-full items-center",
            )}
          >
            {isCompact ? (
              <div
                className={clsx(
                  "w-full space-y-0.5 pr-0.5",
                  isTiny ? "min-h-0" : "min-h-0",
                )}
              >
                {isOnline && !isShortOnline ? (
                  <div className="inline-flex w-fit border border-[color:var(--primary)]/18 bg-white/85 px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--primary)]">
                    Онлайн-запись
                  </div>
                ) : null}
                <div className="flex min-w-0 items-center gap-2">
                  <span className={compactTimeClassName}>{compactTimeLabel}</span>
                  <span
                    className={clsx(compactNameClassName, "group-hover:underline")}
                    style={cardBodyStyle}
                  >
                    {entry.client}
                  </span>
                </div>
                {compactSecondaryLine ? (
                  <div
                    className="text-[10px] leading-4 text-[color:var(--muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 1,
                      overflow: "hidden",
                      ...cardBodyStyle,
                    }}
                  >
                    {compactSecondaryLine}
                  </div>
                ) : null}
              </div>
            ) : isIntermediate ? (
              <div className="w-full space-y-1 pr-1">
                {isOnline && !isShortOnline ? (
                  <div className="inline-flex w-fit border border-[color:var(--primary)]/18 bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--primary)]">
                    Онлайн-запись
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[12px] font-semibold leading-4 tracking-[0.01em] text-[color:var(--foreground)]/80">
                    {entry.startTime}-{entry.endTime}
                  </span>
                  <span
                    className="min-w-0 truncate text-[13px] font-semibold leading-4 text-[color:var(--primary)] group-hover:underline"
                    style={cardBodyStyle}
                  >
                    {entry.client}
                  </span>
                </div>
                {compactSecondaryLine ? (
                  <div
                    className="text-[11px] leading-4 text-[color:var(--muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 1,
                      overflow: "hidden",
                      ...cardBodyStyle,
                    }}
                  >
                    {compactSecondaryLine}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {isOnline && !isShortOnline ? (
                  <div className="inline-flex w-fit border border-[color:var(--primary)]/18 bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--primary)]">
                    Онлайн-запись
                  </div>
                ) : null}
                <div className={timeClassName}>
                  {entry.startTime}-{entry.endTime}
                </div>
                <div className={clsx(nameClassName, "group-hover:underline")} style={cardBodyStyle}>
                  {entry.client}
                </div>
                {showPhone ? (
                  <div className="mt-0.5 text-[12px] leading-5 text-[color:var(--muted)]">
                    {entry.phone}
                  </div>
                ) : null}
                {showComment ? (
                  <div
                    className="mt-1 text-[12px] leading-5 text-[color:var(--muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                      ...cardBodyStyle,
                    }}
                  >
                    {entry.comment}
                  </div>
                ) : null}
              </>
            )}
          </Link>
        ) : (
          <div
            className={clsx(
              "pr-6",
              (isCompact || isIntermediate) && "flex h-full items-center",
            )}
          >
            {isCompact ? (
              <div
                className={clsx(
                  "w-full space-y-0.5 pr-0.5",
                  isTiny ? "min-h-0" : "min-h-0",
                )}
              >
                {isOnline && !isShortOnline ? (
                  <div className="inline-flex w-fit border border-[color:var(--primary)]/18 bg-white/85 px-1.5 py-0.5 text-[9px] font-medium text-[color:var(--primary)]">
                    Онлайн-запись
                  </div>
                ) : null}
                <div className="flex min-w-0 items-center gap-2">
                  <span className={compactTimeClassName}>
                    {compactTimeLabel}
                  </span>
                  <span
                    className={compactNameClassName}
                    style={cardBodyStyle}
                  >
                    {entry.client || "Анонимный клиент"}
                  </span>
                </div>
                {compactSecondaryLine ? (
                  <div
                    className="text-[10px] leading-4 text-[color:var(--muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 1,
                      overflow: "hidden",
                      ...cardBodyStyle,
                    }}
                  >
                    {compactSecondaryLine}
                  </div>
                ) : null}
              </div>
            ) : isIntermediate ? (
              <div className="w-full space-y-1 pr-1">
                {isOnline && !isShortOnline ? (
                  <div className="inline-flex w-fit border border-[color:var(--primary)]/18 bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--primary)]">
                    Онлайн-запись
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <span className="shrink-0 text-[12px] font-semibold leading-4 tracking-[0.01em] text-[color:var(--foreground)]/80">
                    {entry.startTime}-{entry.endTime}
                  </span>
                  <span
                    className="min-w-0 truncate text-[13px] font-semibold leading-4"
                    style={cardBodyStyle}
                  >
                    {entry.client || "Анонимный клиент"}
                  </span>
                </div>
                {compactSecondaryLine ? (
                  <div
                    className="text-[11px] leading-4 text-[color:var(--muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 1,
                      overflow: "hidden",
                      ...cardBodyStyle,
                    }}
                  >
                    {compactSecondaryLine}
                  </div>
                ) : null}
              </div>
            ) : (
              <>
                {isOnline && !isShortOnline ? (
                  <div className="inline-flex w-fit border border-[color:var(--primary)]/18 bg-white/85 px-1.5 py-0.5 text-[10px] font-medium text-[color:var(--primary)]">
                    Онлайн-запись
                  </div>
                ) : null}
                <div className={timeClassName}>
                  {entry.startTime}-{entry.endTime}
                </div>
                <div className={nameClassName} style={cardBodyStyle}>
                  <span>{entry.client || "Анонимный клиент"}</span>
                </div>
                {showPhone ? (
                  <div className="mt-0.5 text-[12px] leading-5 text-[color:var(--muted)]">
                    {entry.phone}
                  </div>
                ) : null}
                {showComment ? (
                  <div
                    className="mt-1 text-[12px] leading-5 text-[color:var(--muted)]"
                    style={{
                      display: "-webkit-box",
                      WebkitBoxOrient: "vertical",
                      WebkitLineClamp: 2,
                      overflow: "hidden",
                      ...cardBodyStyle,
                    }}
                  >
                    {entry.comment}
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderDraftSegment(segment: BookingDraftSegment) {
    const postIndex = posts.findIndex((post) => post.id === segment.postId);

    if (postIndex < 0) {
      return null;
    }

    const startIndex = getSlotIndex(segment.start);
    const span = Math.max(
      1,
      (parseTime(segment.end) - parseTime(segment.start)) / SLOT_STEP_MINUTES,
    );
    const active = segment.id === activeDraftSegmentId;

    return (
      <button
        key={segment.id}
        type="button"
        onClick={() => onDraftSegmentSelect?.(segment.id)}
        className={clsx(
          "z-30 mx-1.5 mt-1.5 border-l-2 px-3 py-2.5 text-left text-[13px] font-semibold",
          active
            ? "border-[color:var(--primary)] bg-[color:var(--primary)]/16 text-[color:var(--primary)]"
            : "border-[color:var(--primary)] bg-[color:var(--primary)]/10 text-[color:var(--primary)]",
        )}
        style={{
          gridColumn: postIndex + 2,
          gridRow: `${startIndex + 2} / span ${span}`,
        }}
      >
        <div>{segment.start}-{segment.end}</div>
        <div className="mt-1 text-[12px] font-medium opacity-85">{segment.postName}</div>
      </button>
    );
  }

  function renderDragPreview() {
    if (!dragState) {
      return null;
    }

    const postIndex = posts.findIndex((post) => post.id === dragState.postId);
    const postLabel = posts[postIndex]?.label;

    if (postIndex < 0) {
      return null;
    }

    const startIndex = Math.min(dragState.startIndex, dragState.currentIndex);
    const endIndex = Math.max(dragState.startIndex, dragState.currentIndex) + 1;
    const start = formatTime(DAY_START_MINUTES + startIndex * SLOT_STEP_MINUTES);
    const end = formatTime(DAY_START_MINUTES + endIndex * SLOT_STEP_MINUTES);

    return (
      <div
        className="pointer-events-none z-40 mx-1.5 mt-1.5 border-l-2 border-[color:var(--primary)] bg-[color:var(--primary)]/8 px-3 py-2.5 text-left text-[13px] font-semibold text-[color:var(--primary)]"
        style={{
          gridColumn: postIndex + 2,
          gridRow: `${startIndex + 2} / span ${endIndex - startIndex}`,
        }}
      >
        <div>{start}-{end}</div>
        <div className="mt-1 text-[12px] font-medium opacity-85">{postLabel}</div>
      </div>
    );
  }

  const currentTimeTop = Math.max(
    HEADER_HEIGHT,
    Math.min(
      HEADER_HEIGHT + TOTAL_SLOTS * SLOT_HEIGHT,
      HEADER_HEIGHT +
        ((parseTime(currentTimeLabel) - DAY_START_MINUTES) / SLOT_STEP_MINUTES) * SLOT_HEIGHT,
    ),
  );

  return (
    <>
      <div className="space-y-3 border border-[color:var(--border)] bg-white p-3 sm:hidden">
        <section className="space-y-3 rounded-[4px] border border-[color:var(--border)] bg-[#fcfcfe] p-3">
          <div className="space-y-2">
            <div className="text-[13px] font-medium text-[color:var(--foreground)]">Дата</div>
            <input
              type="date"
              value={date}
              onChange={(event) => onSelectDate?.(event.target.value)}
              className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] outline-none"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onSelectDate?.(todayKey)}
                className={clsx(
                  "h-9 flex-1 border px-3 text-[13px]",
                  date === todayKey
                    ? "border-[color:var(--primary)] bg-[color:var(--primary)]/8 text-[color:var(--primary)]"
                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                )}
              >
                Сегодня
              </button>
              <button
                type="button"
                onClick={() => onSelectDate?.(tomorrowKey)}
                className={clsx(
                  "h-9 flex-1 border px-3 text-[13px]",
                  date === tomorrowKey
                    ? "border-[color:var(--primary)] bg-[color:var(--primary)]/8 text-[color:var(--primary)]"
                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                )}
              >
                Завтра
              </button>
            </div>
            <div className="text-[12px] capitalize leading-5 text-[color:var(--muted)]">
              {mobileDateLabel}
            </div>
          </div>

          <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
            <div className="text-[13px] font-medium text-[color:var(--foreground)]">Место</div>
            <div className="flex flex-wrap gap-2">
              {mobilePostOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setMobilePostId(option.value)}
                  className={clsx(
                    "h-9 border px-3 text-[13px]",
                    mobilePostId === option.value
                      ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                      : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {allowMultipleWindows ? (
            <div className="space-y-4 border-t border-[color:var(--border)] pt-3">
              <div className="space-y-2">
                <div className="text-[13px] font-medium text-[color:var(--foreground)]">Длительность записи</div>
                <div className="relative">
                  <select
                    value={durationMinutes}
                    onChange={(e) => setMobileSelectedDurationMinutes(Number(e.target.value))}
                    className="h-10 w-full appearance-none rounded-[4px] border border-[color:var(--border)] bg-white px-3 pr-8 text-[14px] outline-none"
                  >
                    {durationOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {formatDurationLabel(opt)}
                      </option>
                    ))}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-[color:var(--muted)]">
                    <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
                      <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="space-y-2 border-t border-[color:var(--border)] pt-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[13px] font-medium text-[color:var(--foreground)]">Свободное время</div>
              <div className="text-[12px] text-[color:var(--muted)]">
                {formatDurationLabel(durationMinutes)}
              </div>
            </div>
            <div className="text-[12px] leading-5 text-[color:var(--muted)]">
              Интервалы показаны шагом по {slotWindowMinutes} мин.
            </div>
            {mobileIntervals.length > 0 ? (
              <div className="space-y-2">
                {mobileIntervals.map((interval) => (
                  <button
                    key={interval.key}
                    type="button"
                    onClick={() => setMobileSelectedIntervalKey(interval.key)}
                    className={clsx(
                      "block w-full rounded-[4px] border px-3 py-2.5 text-left text-[13px] leading-5",
                      activeMobileInterval?.key === interval.key
                        ? "border-[color:var(--primary)] bg-[color:var(--primary)]/8 text-[color:var(--foreground)]"
                        : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                    )}
                    >
                      <div className="font-medium">
                        {interval.startTime}-{interval.endTime}
                      </div>
                      <div className="mt-0.5 text-[12px] text-[color:var(--muted)]">
                        {mobilePostId === "any"
                          ? `${interval.postLabel} • ${formatDurationLabel(interval.durationMinutes)}`
                          : `${formatDurationLabel(interval.durationMinutes)}`}
                      </div>
                    </button>
                ))}
                {canCreateDraft && onDraftCreate ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!activeMobileInterval) {
                        return;
                      }

                      onDraftCreate({
                        date,
                        postId: activeMobileInterval.postId,
                        start: activeMobileInterval.startTime,
                        end: activeMobileInterval.endTime,
                      });
                    }}
                    disabled={!activeMobileInterval}
                    className="h-10 w-full border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Выбрать интервал
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="text-[12px] leading-5 text-[color:var(--muted)]">
                На выбранную дату свободных интервалов нет.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="hidden overflow-x-auto border border-[color:var(--border)] bg-white sm:block">
        <div className="min-w-[980px] select-none">
        <div
          className="relative grid"
          style={{
            gridTemplateColumns: `${TIME_COLUMN_WIDTH}px repeat(${Math.max(posts.length, 1)}, minmax(0, 1fr))`,
            gridTemplateRows: `${HEADER_HEIGHT}px repeat(${TOTAL_SLOTS}, ${SLOT_HEIGHT}px)`,
          }}
        >
          <div className="row-start-1 border-b border-[color:var(--border)] px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-[color:var(--foreground)]">
            Время
          </div>
          {posts.map((post, index) => (
            <div
              key={post.id}
              className="row-start-1 border-b border-l border-[color:var(--border)] px-4 py-3 text-[13px] font-semibold uppercase tracking-[0.03em] text-[color:var(--foreground)]"
              style={{ gridColumn: index + 2 }}
            >
              {post.label}
            </div>
          ))}

          {slotRows.map((slot) => (
            <div
              key={`time-${slot.index}`}
              className="border-t border-[color:var(--border)] px-4 text-[13px] text-[color:var(--foreground)]"
              style={{
                gridColumn: 1,
                gridRow: slot.index + 2,
                paddingTop: slot.showHour ? "4px" : "0",
                borderTopColor: slot.showHour ? "var(--border)" : "rgba(0,0,0,0.02)",
              }}
            >
              {slot.showHour ? slot.time : ""}
            </div>
          ))}

          {slotRows.flatMap((slot) =>
            posts.map((post, postIndex) => (
              <button
                key={`${slot.index}-${post.id}`}
                type="button"
                onMouseDown={() => {
                  if (!canCreateDraft) {
                    return;
                  }

                  setDragState({
                    postId: post.id,
                    startIndex: slot.index,
                    currentIndex: slot.index,
                  });
                }}
                onMouseEnter={() => {
                  if (!canCreateDraft) {
                    return;
                  }

                  setDragState((current) =>
                    current && current.postId === post.id
                      ? { ...current, currentIndex: slot.index }
                      : current,
                  );
                }}
                className={clsx(
                  "border-l border-t border-[color:var(--border)] bg-white",
                  canCreateDraft && "hover:bg-[#fbfbff]",
                )}
                style={{
                  gridColumn: postIndex + 2,
                  gridRow: slot.index + 2,
                  borderTopColor: slot.showHour ? "var(--border)" : "rgba(0,0,0,0.02)",
                }}
                aria-label={`${post.label} ${slot.time}`}
              />
            )),
          )}

          {entries.map(renderExistingEntry)}
          {draftSegments.map(renderDraftSegment)}
          {renderDragPreview()}

          {showCurrentTime ? (
            <div
              className="pointer-events-none absolute left-0 right-0 z-50 flex items-center"
              style={{ top: `${currentTimeTop}px` }}
            >
              <span className="ml-4 border border-red-300 bg-white px-2.5 py-1 text-[13px] font-medium text-red-500">
                {currentTimeLabel}
              </span>
              <div
                className="ml-4 h-px bg-red-300"
                style={{ width: `calc(100% - ${TIME_COLUMN_WIDTH + 60}px)` }}
              />
            </div>
          ) : null}
        </div>
      </div>
      </div>
    </>
  );
}

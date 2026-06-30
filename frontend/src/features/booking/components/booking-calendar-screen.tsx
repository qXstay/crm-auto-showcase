"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { BookingDayGrid } from "@/features/booking/components/booking-day-grid";
import { BookingEntryForm } from "@/features/booking/components/booking-entry-form";
import { BookingSidebarCalendar } from "@/features/booking/components/booking-sidebar-calendar";
import {
  createBookingViaApi,
  deleteBookingGroupViaApi,
  fetchBookingsViaApi,
} from "@/features/booking/repository";
import {
  addDays,
  addMonths,
  parseDateKey,
} from "@/features/booking/date-utils";
import {
  buildBookingClientLabel,
  countUniqueBookings,
  getFallbackUpcomingBookingGroups,
  getUpcomingBookingGroups,
} from "@/features/booking/storage";
import type {
  BookingClientOption,
  BookingDraft,
  BookingDraftSegment,
  BookingEntry,
  BookingPost,
  BookingPostId,
} from "@/features/booking/types";
import { createClientViaApi, fetchClientsStore } from "@/features/clients/repository";
import type { DemoClient, DemoClientsStore } from "@/features/clients/types";
import {
  formatOperationalDateKey,
  formatOperationalTimeLabel,
} from "@/shared/operational-time";

type BookingCalendarScreenProps = {
  initialDate?: string;
  initialEntries?: BookingEntry[];
  initialClients?: DemoClient[];
  initialPosts?: BookingPost[];
  slotWindowMinutes?: number;
  allowMultipleWindows?: boolean;
  initialNowIso?: string;
  currentEmployeeId?: string | null;
  canCreateBooking?: boolean;
  canDeleteOwnBookings?: boolean;
  canDeleteAllBookings?: boolean;
  canViewClients?: boolean;
  canCreateClient?: boolean;
};

function parseTime(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function overlaps(left: BookingDraftSegment, right: BookingDraftSegment) {
  return parseTime(left.start) < parseTime(right.end) && parseTime(right.start) < parseTime(left.end);
}

function touchesOrOverlaps(left: BookingDraftSegment, right: BookingDraftSegment) {
  return parseTime(left.start) <= parseTime(right.end) && parseTime(right.start) <= parseTime(left.end);
}

function buildSegment(postId: BookingPostId, start: string, end: string, posts: BookingPost[]) {
  return {
    id: `${postId}-${start}-${end}-${Math.random().toString(36).slice(2, 8)}`,
    postId,
    postName: posts.find((post) => post.id === postId)?.label ?? "ПОСТ",
    start,
    end,
  } satisfies BookingDraftSegment;
}

function mergeSegment(left: BookingDraftSegment, right: BookingDraftSegment) {
  return {
    ...left,
    start: parseTime(left.start) <= parseTime(right.start) ? left.start : right.start,
    end: parseTime(left.end) >= parseTime(right.end) ? left.end : right.end,
  };
}

function getRelativeDraftTitle(activeDate: string, todayKey: string) {
  const active = parseDateKey(activeDate);

  if (activeDate === todayKey) {
    return "Новая запись на сегодня";
  }

  if (activeDate === addDays(todayKey, 1)) {
    return "Новая запись на завтра";
  }

  return `Новая запись на ${active.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  })}`;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatBookingCountLabel(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} запись`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${value} записи`;
  }

  return `${value} записей`;
}

function getHeaderTitle(activeDate: string, todayKey: string, tomorrowKey: string) {
  const active = parseDateKey(activeDate);
  const dayMonth = active.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
  });
  const weekday = active.toLocaleDateString("ru-RU", { weekday: "long" });

  if (activeDate === todayKey) {
    return `Сегодня, ${capitalize(dayMonth)}, ${capitalize(weekday)}`;
  }

  if (activeDate === tomorrowKey) {
    return `Завтра, ${capitalize(dayMonth)}, ${capitalize(weekday)}`;
  }

  return `${capitalize(dayMonth)}, ${capitalize(weekday)}`;
}

function getUpcomingSubtitle(dateKey: string, todayKey: string, tomorrowKey: string) {
  const active = parseDateKey(dateKey);
  const baseLabel = active.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  if (dateKey === todayKey) {
    return `Сегодня, ${capitalize(
      active.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
    )}`;
  }

  if (dateKey === tomorrowKey) {
    return `Завтра, ${capitalize(
      active.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }),
    )}`;
  }

  return capitalize(baseLabel);
}

export function BookingCalendarScreen({
  initialDate,
  initialEntries = [],
  initialClients = [],
  initialPosts = [],
  slotWindowMinutes = 15,
  allowMultipleWindows = false,
  initialNowIso,
  currentEmployeeId = null,
  canCreateBooking = true,
  canDeleteOwnBookings = false,
  canDeleteAllBookings = false,
  canViewClients = false,
  canCreateClient = true,
}: BookingCalendarScreenProps) {
  const [now, setNow] = useState(() =>
    initialNowIso ? new Date(initialNowIso) : new Date(),
  );
  const [activeDate, setActiveDate] = useState(() =>
    initialDate ?? formatOperationalDateKey(now),
  );
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [entries, setEntries] = useState<BookingEntry[]>(initialEntries);
  const [clientsStore, setClientsStore] = useState<DemoClientsStore>(() => ({
    clients: initialClients,
  }));
  const [posts, setPosts] = useState<BookingPost[]>(initialPosts);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isSavingBooking, setIsSavingBooking] = useState(false);
  const [isSavingClient, setIsSavingClient] = useState(false);
  const [isDeletingBooking, setIsDeletingBooking] = useState(false);
  const [mobileScrollToken, setMobileScrollToken] = useState(0);
  const formContainerRef = useRef<HTMLDivElement | null>(null);

  function syncDateQuery(nextDateKey: string) {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("date", nextDateKey);
    window.history.replaceState(window.history.state, "", url);
  }

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setEntries(initialEntries);
  }, [initialEntries]);

  useEffect(() => {
    setClientsStore({ clients: initialClients });
  }, [initialClients]);

  useEffect(() => {
    setPosts(initialPosts);
  }, [initialPosts]);

  useEffect(() => {
    if (!initialDate) {
      return;
    }

    setActiveDate((current) => {
      if (current === initialDate) {
        return current;
      }

      return initialDate;
    });
    resetDraft();
  }, [initialDate]);

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

  useEffect(() => {
    if (!canViewClients) {
      return;
    }

    let cancelled = false;

    void fetchClientsStore()
      .then(({ clients }) => {
        if (!cancelled) {
          setClientsStore({ clients });
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [canViewClients]);

  useEffect(() => {
    if (mobileScrollToken === 0 || typeof window === "undefined") {
      return;
    }

    if (!window.matchMedia("(max-width: 639px)").matches) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      formContainerRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [mobileScrollToken]);

  const todayKey = formatOperationalDateKey(now);
  const tomorrowKey = addDays(todayKey, 1);

  const currentDate = parseDateKey(activeDate);
  const previousDateKey = addDays(activeDate, -1);
  const nextDateKey = addDays(activeDate, 1);
  const previousDate = parseDateKey(previousDateKey);
  const nextDate = parseDateKey(nextDateKey);
  const currentTimeLabel = formatOperationalTimeLabel(now);

  const visibleEntries = useMemo(
    () => entries.filter((entry) => entry.date === activeDate),
    [activeDate, entries],
  );
  const clientOptions = useMemo<BookingClientOption[]>(
    () => [
      { id: "anonymous", label: "Анонимный клиент" },
      ...clientsStore.clients.map((client) => ({
        id: client.id,
        label: buildBookingClientLabel(client),
      })),
    ],
    [clientsStore.clients],
  );
  const upcomingEntries = useMemo(
    () => getUpcomingBookingGroups(entries, posts, activeDate, todayKey, currentTimeLabel),
    [activeDate, currentTimeLabel, entries, posts, todayKey],
  );
  const fallbackUpcomingEntries = useMemo(
    () =>
      getFallbackUpcomingBookingGroups(entries, posts, activeDate, todayKey, currentTimeLabel, 4),
    [activeDate, currentTimeLabel, entries, posts, todayKey],
  );
  const fallbackUpcomingSubtitle =
    fallbackUpcomingEntries[0]?.date
      ? getUpcomingSubtitle(fallbackUpcomingEntries[0].date, todayKey, tomorrowKey)
      : null;
  const title = getHeaderTitle(activeDate, todayKey, tomorrowKey);
  const bookingCountLabel = formatBookingCountLabel(countUniqueBookings(visibleEntries));
  const monthViewHref = `/booking/month?month=${activeDate.slice(0, 7)}&date=${activeDate}`;
  const leftDayLabel = previousDate.toLocaleDateString("ru-RU", { weekday: "short" }).toUpperCase();
  const currentDayLabel = currentDate.toLocaleDateString("ru-RU", { weekday: "short" }).toUpperCase();
  const rightDayLabel = nextDate.toLocaleDateString("ru-RU", { weekday: "short" }).toUpperCase();
  const draftDateLabel = currentDate.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });

  function resetDraft() {
    setDraft(null);
    setActiveSegmentId(null);
    setActionError(null);
  }

  function changeActiveDate(nextDateKey: string) {
    if (nextDateKey === activeDate) {
      return;
    }
    syncDateQuery(nextDateKey);
    setActiveDate(nextDateKey);
    resetDraft();
  }

  function changeCalendarMonth(amount: number) {
    changeActiveDate(addMonths(activeDate, amount));
  }

  function handleDraftCreate(selection: {
    date: string;
    postId: BookingPostId;
    start: string;
    end: string;
  }) {
    if (!canCreateBooking) {
      return;
    }

    const nextSegment = buildSegment(selection.postId, selection.start, selection.end, posts);
    let nextActiveId = nextSegment.id;

    setDraft((current) => {
      const baseDraft =
        current ??
        ({
          date: selection.date,
          clientId: "",
          note: "",
          segments: [],
        } satisfies BookingDraft);

      const activeSegment = baseDraft.segments.find((segment) => segment.id === activeSegmentId);
      const canExtendActive =
        activeSegment &&
        activeSegment.postId === nextSegment.postId &&
        touchesOrOverlaps(activeSegment, nextSegment);

      const nextSegments = baseDraft.segments
        .filter((segment) =>
          canExtendActive
            ? segment.id !== activeSegment?.id
            : !(segment.postId === nextSegment.postId && overlaps(segment, nextSegment)),
        )
        .concat(canExtendActive && activeSegment ? mergeSegment(activeSegment, nextSegment) : nextSegment)
        .sort((left, right) => parseTime(left.start) - parseTime(right.start));

      const effectiveSegment =
        canExtendActive && activeSegment ? mergeSegment(activeSegment, nextSegment) : nextSegment;
      nextActiveId = effectiveSegment.id;

      return {
        ...baseDraft,
        date: selection.date,
        segments: nextSegments,
      };
    });
    setActiveSegmentId(nextActiveId);
    setMobileScrollToken((current) => current + 1);
  }

  async function refreshEntries() {
    const nextEntries = await fetchBookingsViaApi();
    setEntries(nextEntries.entries);
  }

  function handleUpdateSegment(
    segmentId: string,
    updater: (segment: BookingDraftSegment) => BookingDraftSegment | null,
  ) {
    setDraft((current) => {
      if (!current) {
        return current;
      }

      const nextSegments: BookingDraftSegment[] = [];

      for (const segment of current.segments) {
        if (segment.id !== segmentId) {
          nextSegments.push(segment);
          continue;
        }

        const updated = updater(segment);
        if (!updated) {
          continue;
        }

        const conflict = current.segments.some(
          (candidate) =>
            candidate.id !== segmentId &&
            candidate.postId === updated.postId &&
            overlaps(candidate, updated),
        );

        nextSegments.push(conflict ? segment : updated);
      }

      return {
        ...current,
        segments: nextSegments.sort(
          (left, right) => parseTime(left.start) - parseTime(right.start),
        ),
      };
    });
  }

  function handleDeleteSegment(segmentId: string) {
    let nextActiveSegmentId: string | null = null;

    setDraft((current) => {
      if (!current) {
        return current;
      }

      const nextSegments = current.segments.filter((segment) => segment.id !== segmentId);
      nextActiveSegmentId = nextSegments[0]?.id ?? null;

      if (nextSegments.length === 0) {
        return null;
      }

      return {
        ...current,
        segments: nextSegments,
      };
    });
    setActiveSegmentId((active) => (active === segmentId ? nextActiveSegmentId : active));
  }

  async function handleCreateClient(input: {
    firstName: string;
    lastName: string;
    phone: string;
    carBrand: string;
    carModel: string;
    plateNumber: string;
  }) {
    if (isSavingClient || !canCreateClient) {
      return false;
    }

    setActionError(null);
    setIsSavingClient(true);

    try {
      const { client } = await createClientViaApi(input);

      setClientsStore((current) => ({
        clients: [
          client,
          ...current.clients.filter((candidate) => candidate.id !== client.id),
        ],
      }));
      setDraft((current) => (current ? { ...current, clientId: client.id } : current));
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось создать клиента.");
      return false;
    } finally {
      setIsSavingClient(false);
    }
  }

  async function handleSaveBooking() {
    if (!draft || draft.segments.length === 0 || isSavingBooking || !canCreateBooking) {
      return;
    }

    setActionError(null);
    setIsSavingBooking(true);

    try {
      await createBookingViaApi({
        date: draft.date,
        clientId:
          draft.clientId === "anonymous" || draft.clientId.trim().length === 0
            ? null
            : draft.clientId,
        note: draft.note,
        segments: draft.segments,
      });
      await refreshEntries();
      resetDraft();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Не удалось сохранить запись.");
    } finally {
      setIsSavingBooking(false);
    }
  }

  async function handleConfirmDeleteBooking() {
    if (!deleteGroupId || isDeletingBooking) {
      return;
    }

    setDeleteError(null);
    setIsDeletingBooking(true);

    try {
      await deleteBookingGroupViaApi(deleteGroupId);
      await refreshEntries();
      setDeleteGroupId(null);
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : "Не удалось удалить запись.");
    } finally {
      setIsDeletingBooking(false);
    }
  }

  return (
    <section className="-my-2 lg:-mx-5">
      <div className="px-3 pb-3 pt-1 lg:px-4 lg:pb-4">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_420px] 2xl:grid-cols-[minmax(0,1fr)_448px]">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-col gap-x-4 gap-y-2 border-b border-[color:var(--border)] px-1 pb-3 pt-1 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 space-y-0.5">
                <Link
                  href={monthViewHref}
                  className="text-[15px] font-semibold text-[color:var(--primary)] hover:text-[color:var(--primary)]/80"
                >
                  Календарь
                </Link>
                <div className="flex min-h-[2.375rem] flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h1 className="text-[22px] font-semibold capitalize text-[color:var(--foreground)] [font-variant-numeric:tabular-nums]">
                    {title}
                  </h1>
                  <span className="min-w-[5.5rem] text-[15px] text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
                    {bookingCountLabel}
                  </span>
                </div>
              </div>

              <div className="flex w-full flex-wrap items-center justify-between gap-2 text-[14px] text-[color:var(--foreground)] sm:ml-auto sm:w-auto sm:flex-nowrap sm:justify-start">
                <button
                  type="button"
                  onClick={() => changeActiveDate(previousDateKey)}
                  className="flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[44px] text-center text-[color:var(--muted)]">
                  {leftDayLabel}
                </span>
                <span className="min-w-[44px] text-center font-semibold">{currentDayLabel}</span>
                <span className="min-w-[44px] text-center text-[color:var(--muted)]">
                  {rightDayLabel}
                </span>
                <button
                  type="button"
                  onClick={() => changeActiveDate(nextDateKey)}
                  className="flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <BookingDayGrid
              date={activeDate}
              todayKey={todayKey}
              tomorrowKey={tomorrowKey}
              entries={visibleEntries}
              posts={posts}
              slotWindowMinutes={slotWindowMinutes}
              allowMultipleWindows={allowMultipleWindows}
              draftSegments={draft?.segments ?? []}
              activeDraftSegmentId={activeSegmentId}
              currentTimeLabel={currentTimeLabel}
              showCurrentTime={activeDate === todayKey}
              canCreateDraft={canCreateBooking}
              canDeleteEntry={(entry) =>
                canDeleteAllBookings ||
                (canDeleteOwnBookings && entry.createdByEmployeeId === currentEmployeeId)
              }
              onDeleteGroupRequest={(groupId) => {
                setDeleteError(null);
                setDeleteGroupId(groupId);
              }}
              onSelectDate={changeActiveDate}
              onDraftCreate={canCreateBooking ? handleDraftCreate : undefined}
              onDraftSegmentSelect={setActiveSegmentId}
            />
          </div>

          {draft ? (
            <div ref={formContainerRef}>
              <BookingEntryForm
                draft={draft}
                activeSegmentId={activeSegmentId}
                title={getRelativeDraftTitle(activeDate, todayKey)}
                dateLabel={capitalize(draftDateLabel)}
                clientOptions={clientOptions}
                canCreateBooking={canCreateBooking}
                canCreateClient={canCreateClient}
                isSavingBooking={isSavingBooking}
                isSavingClient={isSavingClient}
                errorMessage={actionError}
                onSelectSegment={setActiveSegmentId}
                onUpdateSegment={handleUpdateSegment}
                onDeleteSegment={handleDeleteSegment}
                onClientChange={(clientId) =>
                  setDraft((current) => (current ? { ...current, clientId } : current))
                }
                onSave={handleSaveBooking}
                onCreateClient={handleCreateClient}
                onNoteChange={(note) =>
                  setDraft((current) => (current ? { ...current, note } : current))
                }
                onCancel={resetDraft}
                upcomingEntries={upcomingEntries}
                fallbackUpcomingEntries={fallbackUpcomingEntries}
                fallbackUpcomingSubtitle={fallbackUpcomingSubtitle}
              />
            </div>
          ) : (
            <BookingSidebarCalendar
              activeDate={activeDate}
              onSelectDate={changeActiveDate}
              onSelectPreviousMonth={() => changeCalendarMonth(-1)}
              onSelectNextMonth={() => changeCalendarMonth(1)}
              onSelectToday={() => changeActiveDate(todayKey)}
              onSelectTomorrow={() => changeActiveDate(tomorrowKey)}
              upcomingEntries={upcomingEntries}
              fallbackUpcomingEntries={fallbackUpcomingEntries}
              fallbackUpcomingSubtitle={fallbackUpcomingSubtitle}
            />
          )}
        </div>
      </div>

      {deleteGroupId ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 px-4 py-6">
          <div className="w-full max-w-[380px] border border-[color:var(--border)] bg-white">
            <div className="px-5 py-4 text-[16px] font-medium text-[color:var(--foreground)]">
              Удалить запись?
            </div>
            <div className="px-5 pb-3 text-[13px] leading-6 text-[color:var(--muted)]">
              Запись исчезнет из календаря и карточки клиента, но сам клиент останется в справочнике.
            </div>
            {deleteError ? (
              <div className="px-5 pb-1 text-[12px] leading-5 text-[#b45444]">{deleteError}</div>
            ) : null}
            <div className="flex items-center justify-end gap-2 border-t border-[color:var(--border)] px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setDeleteError(null);
                  setDeleteGroupId(null);
                }}
                disabled={isDeletingBooking}
                className="h-10 border border-[color:var(--border)] bg-white px-4 text-[13px] text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteBooking}
                disabled={isDeletingBooking}
                className="h-10 border border-[#d86a54] bg-[#d86a54] px-4 text-[13px] font-medium text-white"
              >
                {isDeletingBooking ? "Удаление..." : "Удалить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Phone } from "lucide-react";
import {
  formatAuthPhoneDisplay,
  formatAuthPhoneInput,
  normalizeAuthPhoneInput,
} from "@/features/auth/storage";
import { formatDateKey, parseDateKey } from "@/features/booking/date-utils";
import type { BookingEntry, BookingPost } from "@/features/booking/types";
import { apiRequest } from "@/lib/api/client";
import type { PublicBookingContext } from "@/server/repositories/public-booking-repository";

type PublicBookingScreenProps = {
  slug: string;
  initialDate: string;
  initialContext: PublicBookingContext;
};

type PublicBookingStep = "date" | "post" | "time" | "details" | "success";

type SlotOption = {
  startTime: string;
  singleEndTime: string;
  doubleEndTime: string | null;
  singlePosts: BookingPost[];
  doublePosts: BookingPost[];
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

function buildTimeRanges(workStart: string, workEnd: string, windowMinutes: number) {
  const ranges: Array<{ startTime: string; endTime: string }> = [];
  const startMinutes = parseTime(workStart);
  const endMinutes = parseTime(workEnd);

  for (
    let cursor = startMinutes;
    cursor + windowMinutes <= endMinutes;
    cursor += windowMinutes
  ) {
    ranges.push({
      startTime: formatTime(cursor),
      endTime: formatTime(cursor + windowMinutes),
    });
  }

  return ranges;
}

function overlaps(
  entry: BookingEntry,
  target: {
    startTime: string;
    endTime: string;
  },
) {
  return (
    parseTime(target.startTime) < parseTime(entry.endTime) &&
    parseTime(entry.startTime) < parseTime(target.endTime)
  );
}

function formatDayLabel(dateKey: string) {
  return parseDateKey(dateKey).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    weekday: "long",
  });
}

function groupSlotOptions(slotOptions: SlotOption[]) {
  return [
    {
      id: "morning",
      label: "Утро",
      items: slotOptions.filter((slot) => parseTime(slot.startTime) < 12 * 60),
    },
    {
      id: "day",
      label: "День",
      items: slotOptions.filter(
        (slot) => parseTime(slot.startTime) >= 12 * 60 && parseTime(slot.startTime) < 17 * 60,
      ),
    },
    {
      id: "evening",
      label: "Вечер",
      items: slotOptions.filter((slot) => parseTime(slot.startTime) >= 17 * 60),
    },
  ].filter((group) => group.items.length > 0);
}

function addMinutes(value: string, amount: number) {
  return formatTime(parseTime(value) + amount);
}

function getStepNumber(step: PublicBookingStep) {
  switch (step) {
    case "date":
      return 1;
    case "post":
      return 2;
    case "time":
      return 3;
    case "details":
      return 4;
    case "success":
      return 5;
  }
}

function formatDurationLabel(totalMinutes: number) {
  if (totalMinutes % 60 === 0) {
    const hours = totalMinutes / 60;
    return hours === 1 ? "1 час" : `${hours} ч`;
  }

  return `${totalMinutes} мин`;
}

export function PublicBookingScreen({
  slug,
  initialDate,
  initialContext,
}: PublicBookingScreenProps) {
  const [activeDate, setActiveDate] = useState(initialDate);
  const [context, setContext] = useState(initialContext);
  const [step, setStep] = useState<PublicBookingStep>("date");
  const [selectedPostId, setSelectedPostId] = useState("any");
  const [selectedStartTime, setSelectedStartTime] = useState<string | null>(null);
  const [selectedWindowCount, setSelectedWindowCount] = useState<1 | 2>(1);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [comment, setComment] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const todayKey = formatDateKey(new Date());
  const [successState, setSuccessState] = useState<{
    branchName: string;
    date: string;
    startTime: string;
    endTime: string;
    postLabel: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("date", activeDate);
    window.history.replaceState(window.history.state, "", url);
  }, [activeDate]);

  useEffect(() => {
    if (activeDate < todayKey) {
      setActiveDate(todayKey);
    }
  }, [activeDate, todayKey]);

  useEffect(() => {
    let cancelled = false;

    setIsLoading(true);
    setLoadError(null);

    void apiRequest<{ context: PublicBookingContext }>(
      `/api/public/booking/${slug}?date=${activeDate}`,
    )
      .then(({ context: nextContext }) => {
        if (!cancelled) {
          setContext(nextContext);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Не удалось обновить расписание.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeDate, slug]);

  useEffect(() => {
    if (!context.allowPostChoice) {
      setSelectedPostId("any");
    }
  }, [context.allowPostChoice]);

  useEffect(() => {
    setSelectedStartTime(null);
    setSelectedWindowCount(1);
    setSubmitError(null);
    setSuccessState(null);

    setStep((current) =>
      current === "details" || current === "success"
        ? context.allowPostChoice
          ? "post"
          : "time"
        : current,
    );
  }, [activeDate, context.allowPostChoice, selectedPostId]);

  const canSubmit =
    clientName.trim().length > 0 && normalizeAuthPhoneInput(clientPhone).length === 10;
  const dayLabel = formatDayLabel(activeDate);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = formatDateKey(tomorrow);

  const slotOptions = useMemo(() => {
    const ranges = buildTimeRanges(
      context.workStart,
      context.workEnd,
      context.slotWindowMinutes,
    );

    return ranges
      .map((range) => {
        const singlePosts = context.posts.filter(
          (post) =>
            !context.entries.some(
              (entry) =>
                entry.postId === post.id &&
                overlaps(entry, {
                  startTime: range.startTime,
                  endTime: range.endTime,
                }),
            ),
        );
        const doubleEndTime =
          context.allowMultipleWindows &&
          parseTime(range.startTime) + context.slotWindowMinutes * 2 <= parseTime(context.workEnd)
            ? addMinutes(range.startTime, context.slotWindowMinutes * 2)
            : null;
        const doublePosts = doubleEndTime
          ? context.posts.filter(
              (post) =>
                !context.entries.some(
                  (entry) =>
                    entry.postId === post.id &&
                    overlaps(entry, {
                      startTime: range.startTime,
                      endTime: doubleEndTime,
                    }),
                ),
            )
          : [];

        return {
          startTime: range.startTime,
          singleEndTime: range.endTime,
          doubleEndTime,
          singlePosts,
          doublePosts,
        } satisfies SlotOption;
      })
      .filter((slot) =>
        selectedPostId === "any"
          ? slot.singlePosts.length > 0
          : slot.singlePosts.some((post) => post.id === selectedPostId),
      );
  }, [
    context.allowMultipleWindows,
    context.entries,
    context.posts,
    context.slotWindowMinutes,
    context.workEnd,
    context.workStart,
    selectedPostId,
  ]);

  useEffect(() => {
    if (!selectedStartTime) {
      return;
    }

    const activeSlot = slotOptions.find((slot) => slot.startTime === selectedStartTime);

    if (!activeSlot) {
      setSelectedStartTime(null);
      setSelectedWindowCount(1);
      return;
    }

    const canUseDouble =
      activeSlot.doubleEndTime &&
      (selectedPostId === "any"
        ? activeSlot.doublePosts.length > 0
        : activeSlot.doublePosts.some((post) => post.id === selectedPostId));

    if (!canUseDouble && selectedWindowCount === 2) {
      setSelectedWindowCount(1);
    }
  }, [selectedPostId, selectedStartTime, selectedWindowCount, slotOptions]);

  const selectedSlotOption =
    selectedStartTime !== null
      ? slotOptions.find((slot) => slot.startTime === selectedStartTime) ?? null
      : null;
  const canUseDoubleWindow = Boolean(
    selectedSlotOption?.doubleEndTime &&
      (selectedPostId === "any"
        ? selectedSlotOption.doublePosts.length > 0
        : selectedSlotOption.doublePosts.some((post) => post.id === selectedPostId)),
  );
  const selectedEndTime =
    selectedSlotOption && selectedWindowCount === 2 && selectedSlotOption.doubleEndTime
      ? selectedSlotOption.doubleEndTime
      : selectedSlotOption?.singleEndTime ?? null;
  const selectedDurationMinutes = context.slotWindowMinutes * selectedWindowCount;
  const selectedDurationLabel = formatDurationLabel(selectedDurationMinutes);
  const selectedIntervalLabel =
    selectedStartTime && selectedEndTime ? `${selectedStartTime}-${selectedEndTime}` : "Не выбрано";
  const selectedPostLabel =
    selectedPostId === "any"
      ? "Любое место"
      : context.posts.find((post) => post.id === selectedPostId)?.label ?? "Место";
  const slotGroups = groupSlotOptions(slotOptions);

  function resetForNewBooking() {
    setStep("date");
    setSelectedPostId("any");
    setSelectedStartTime(null);
    setSelectedWindowCount(1);
    setClientName("");
    setClientPhone("");
    setComment("");
    setSubmitError(null);
    setSuccessState(null);
  }

  async function handleSubmit() {
    if (!selectedStartTime || !selectedEndTime || !canSubmit || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { booking, chosenPostLabel } = await apiRequest<{
        booking: BookingEntry | null;
        chosenPostLabel: string;
      }>(`/api/public/booking/${slug}`, {
        method: "POST",
        body: JSON.stringify({
          date: activeDate,
          startTime: selectedStartTime,
          slotCount: selectedWindowCount,
          postId: selectedPostId === "any" ? null : selectedPostId,
          name: clientName.trim(),
          phone: formatAuthPhoneDisplay(normalizeAuthPhoneInput(clientPhone)),
          comment: comment.trim(),
        }),
      });

      const confirmedDate = booking?.date ?? activeDate;
      const confirmedStartTime = booking?.startTime ?? selectedStartTime;
      const confirmedEndTime = booking?.endTime ?? selectedEndTime;

      setSuccessState({
        branchName: context.branchName,
        date: confirmedDate,
        startTime: confirmedStartTime,
        endTime: confirmedEndTime,
        postLabel: chosenPostLabel,
      });
      setClientName("");
      setClientPhone("");
      setComment("");
      setSelectedStartTime(null);
      setSelectedWindowCount(1);
      setStep("success");

      const { context: nextContext } = await apiRequest<{ context: PublicBookingContext }>(
        `/api/public/booking/${slug}?date=${activeDate}`,
      );
      setContext(nextContext);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Не удалось создать запись.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f7f5f2] px-3 py-4 text-[color:var(--foreground)] sm:px-4 sm:py-5">
      <div className="mx-auto max-w-[520px] space-y-4">
        <section className="border border-[color:var(--border)] bg-white px-4 py-4">
          <div className="space-y-1">
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
              Онлайн-запись
            </div>
            <h1 className="text-[22px] font-semibold leading-7">{context.branchName}</h1>
            <div className="text-[13px] leading-5 text-[color:var(--muted)]">
              {context.address}
            </div>
            {context.phone ? (
              <div className="flex items-center gap-2 text-[14px] text-[color:var(--muted)]">
                <Phone className="h-4 w-4" />
                <span>{context.phone}</span>
              </div>
            ) : null}
          </div>
        </section>

        {!context.onlineEnabled ? (
          <section className="border border-[color:var(--border)] bg-white px-4 py-5 text-[14px] leading-6 text-[color:var(--muted)]">
            Онлайн-запись для этого филиала сейчас недоступна. Если нужно, позвоните по телефону филиала.
          </section>
        ) : (
          <>
            <section className="border border-[color:var(--border)] bg-white px-4 py-4">
              <div className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
                <span>Шаг {getStepNumber(step)} из 5</span>
              </div>

              {step !== "date" && step !== "details" && step !== "success" ? (
                <div className="mt-3 space-y-2 border-b border-[color:var(--border)] pb-3 text-[13px] leading-5">
                  <button
                    type="button"
                    onClick={() => setStep("date")}
                    className="block text-left text-[color:var(--foreground)]"
                  >
                    <span className="font-medium">Дата:</span> <span className="capitalize">{dayLabel}</span>
                  </button>
                  {step === "time" ? (
                    <button
                      type="button"
                      onClick={() => setStep(context.allowPostChoice ? "post" : "time")}
                      className="block text-left text-[color:var(--foreground)]"
                    >
                      <span className="font-medium">Место:</span> {selectedPostLabel}
                    </button>
                  ) : null}
                </div>
              ) : null}

              {step === "date" ? (
                <div className="mt-4 space-y-4">
                  <div>
                    <label className="block text-[14px] font-medium">Выберите дату</label>
                    <input
                      type="date"
                      value={activeDate}
                      min={todayKey}
                      onChange={(event) =>
                        setActiveDate(event.target.value < todayKey ? todayKey : event.target.value)
                      }
                      className="mt-2 h-12 w-full rounded-[6px] border border-[color:var(--border)] bg-white px-3 text-[16px] outline-none [color-scheme:light] [&::-webkit-calendar-picker-indicator]:h-5 [&::-webkit-calendar-picker-indicator]:w-5 [&::-webkit-calendar-picker-indicator]:cursor-pointer"
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setActiveDate(todayKey)}
                        className={`h-9 border px-3 text-[13px] ${
                          activeDate === todayKey
                            ? "border-[color:var(--primary)] bg-[color:var(--primary)]/8 text-[color:var(--primary)]"
                            : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                        }`}
                      >
                        Сегодня
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveDate(tomorrowKey)}
                        className={`h-9 border px-3 text-[13px] ${
                          activeDate === tomorrowKey
                            ? "border-[color:var(--primary)] bg-[color:var(--primary)]/8 text-[color:var(--primary)]"
                            : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                        }`}
                      >
                        Завтра
                      </button>
                    </div>
                    <div className="mt-2 text-[13px] capitalize text-[color:var(--muted)]">
                      {dayLabel}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStep(context.allowPostChoice ? "post" : "time")}
                    className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white sm:w-auto"
                  >
                    Продолжить
                  </button>
                </div>
              ) : null}

              {step === "post" ? (
                <div className="mt-4 space-y-4">
                  <div className="text-[14px] font-medium">Выберите место</div>
                  {context.allowPostChoice ? (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedPostId("any")}
                        className={`h-10 border px-3 text-[14px] ${
                          selectedPostId === "any"
                            ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                            : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                        }`}
                      >
                        Любое место
                      </button>
                      {context.posts.map((post) => (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => setSelectedPostId(post.id)}
                          className={`h-10 border px-3 text-[14px] ${
                            selectedPostId === post.id
                              ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                              : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                          }`}
                        >
                          {post.label}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="border border-[color:var(--border)] bg-[#faf8f5] px-3 py-3 text-[13px] leading-5 text-[color:var(--muted)]">
                      Место подберётся автоматически из свободных на выбранное время.
                    </div>
                  )}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setStep("date")}
                      className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--border)] bg-white px-4 text-[15px] sm:w-auto"
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("time")}
                      className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white sm:w-auto"
                    >
                      Продолжить
                    </button>
                  </div>
                </div>
              ) : null}

              {step === "time" ? (
                <div className="mt-4 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-[14px] font-medium">Выберите время</div>
                    {isLoading ? (
                      <div className="text-[12px] text-[color:var(--muted)]">Обновляем...</div>
                    ) : null}
                  </div>
                  {loadError ? (
                    <div className="text-[13px] leading-5 text-[#b45444]">{loadError}</div>
                  ) : null}
                  {slotGroups.length > 0 ? (
                    <div className="space-y-4">
                      {slotGroups.map((group) => (
                        <div key={group.id} className="space-y-2">
                          <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
                            {group.label}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.items.map((slot) => (
                              <button
                                key={slot.startTime}
                                type="button"
                                onClick={() => {
                                  setSelectedStartTime(slot.startTime);
                                  setSelectedWindowCount(1);
                                }}
                                className={`min-w-[136px] border px-3 py-2 text-left text-[14px] transition-colors sm:min-w-[148px] ${
                                  selectedStartTime === slot.startTime
                                    ? "border-[color:var(--primary)] bg-[color:var(--primary)]/8 text-[color:var(--foreground)]"
                                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)]/35"
                                }`}
                              >
                                <div className="font-semibold">
                                  {slot.startTime}-{slot.singleEndTime}
                                </div>
                                <div className="mt-1 text-[11px] text-[color:var(--muted)]">
                                  {selectedPostId === "any"
                                    ? `${slot.singlePosts.length} свободн. мест`
                                    : "Свободно"}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}

                      {selectedSlotOption ? (
                        <div className="border border-[color:var(--border)] bg-[#faf8f5] px-3 py-3">
                          <div className="text-[14px] font-medium">Длительность записи</div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedWindowCount(1)}
                              className={`border px-3 py-2 text-[14px] ${
                                selectedWindowCount === 1
                                  ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                                  : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                              }`}
                            >
                              1 окно · {formatDurationLabel(context.slotWindowMinutes)} · {selectedSlotOption.startTime}-{selectedSlotOption.singleEndTime}
                            </button>
                            {canUseDoubleWindow && selectedSlotOption.doubleEndTime ? (
                              <button
                                type="button"
                                onClick={() => setSelectedWindowCount(2)}
                                className={`border px-3 py-2 text-[14px] ${
                                  selectedWindowCount === 2
                                    ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]"
                                }`}
                              >
                                2 окна подряд · {formatDurationLabel(context.slotWindowMinutes * 2)} · {selectedSlotOption.startTime}-{selectedSlotOption.doubleEndTime}
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <div className="border border-[color:var(--border)] bg-[#faf8f5] px-3 py-3 text-[13px] leading-5 text-[color:var(--muted)]">
                      На выбранную дату свободных слотов нет.
                    </div>
                  )}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setStep(context.allowPostChoice ? "post" : "date")}
                      className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--border)] bg-white px-4 text-[15px] sm:w-auto"
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep("details")}
                      disabled={!selectedStartTime}
                      className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      Продолжить
                    </button>
                  </div>
                </div>
              ) : null}

              {step === "details" ? (
                <div className="mt-4 space-y-4">
                  <div className="border border-[color:var(--border)] bg-[#faf8f5] px-3 py-3">
                    <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-[color:var(--muted)]">
                      Подтвердите запись
                    </div>
                    <div className="mt-3 space-y-2 text-[13px] leading-5">
                      <div>
                        <span className="font-medium">Филиал:</span> {context.branchName}
                      </div>
                      <div>
                        <span className="font-medium">Дата:</span>{" "}
                        <span className="capitalize">{dayLabel}</span>
                      </div>
                      <div>
                        <span className="font-medium">Место:</span> {selectedPostLabel}
                      </div>
                      <div>
                        <span className="font-medium">Время:</span>{" "}
                        {selectedIntervalLabel}
                      </div>
                      <div>
                        <span className="font-medium">Длительность:</span> {selectedDurationLabel}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[14px] font-medium">Имя</label>
                      <input
                        value={clientName}
                        onChange={(event) => setClientName(event.target.value)}
                        className="mt-2 h-11 w-full border border-[color:var(--border)] bg-white px-3 text-[16px] outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[14px] font-medium">Телефон</label>
                      <div className="mt-2 flex h-11 items-center overflow-hidden rounded-[6px] border border-[color:var(--border)] bg-white">
                        <div className="flex h-full items-center border-r border-[color:var(--border)] px-3 text-[15px] font-medium text-[color:var(--foreground)]">
                          +7
                        </div>
                        <input
                          value={formatAuthPhoneInput(clientPhone)}
                          onChange={(event) =>
                            setClientPhone(normalizeAuthPhoneInput(event.target.value))
                          }
                          inputMode="numeric"
                          autoComplete="tel-national"
                          maxLength={13}
                          className="h-full w-full min-w-0 bg-white px-3 text-[16px] outline-none"
                          placeholder="999 123-45-67"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[14px] font-medium">Комментарий</label>
                      <textarea
                        value={comment}
                        onChange={(event) => setComment(event.target.value)}
                        rows={3}
                        className="mt-2 w-full border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] outline-none"
                        placeholder="Если нужно, оставьте короткий комментарий"
                      />
                    </div>
                  </div>

                  {submitError ? (
                    <div className="text-[13px] leading-5 text-[#b45444]">{submitError}</div>
                  ) : null}

                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => setStep("time")}
                      className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--border)] bg-white px-4 text-[15px] sm:w-auto"
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!canSubmit || isSubmitting}
                      className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                    >
                      {isSubmitting ? "Записываем..." : "Записаться"}
                    </button>
                  </div>
                </div>
              ) : null}

              {step === "success" && successState ? (
                <div className="mt-4 space-y-4">
                  <div className="flex items-start gap-3 border border-[color:var(--border)] bg-[#faf8f5] px-3 py-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--primary)]/10 text-[color:var(--primary)]">
                      <Check className="h-4 w-4" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[15px] font-semibold">Запись создана</div>
                      <div className="space-y-1 text-[13px] leading-5 text-[color:var(--muted)]">
                        <div>{successState.branchName}</div>
                        <div>
                          {parseDateKey(successState.date).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "long",
                          })}
                        </div>
                        <div>
                          {successState.startTime}-{successState.endTime} · {successState.postLabel}
                        </div>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (typeof window !== "undefined") {
                        window.location.assign("/book");
                        return;
                      }

                      resetForNewBooking();
                    }}
                    className="inline-flex h-11 w-full items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white sm:w-auto"
                  >
                    Записать ещё одного клиента
                  </button>
                </div>
              ) : null}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

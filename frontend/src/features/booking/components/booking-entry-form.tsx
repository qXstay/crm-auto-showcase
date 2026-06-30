"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, Minus, Plus, Trash2 } from "lucide-react";
import {
  formatAuthPhoneDisplay,
  formatAuthPhoneInput,
  normalizeAuthPhoneInput,
} from "@/features/auth/storage";
import { BookingUpcomingList } from "@/features/booking/components/booking-upcoming-list";
import type {
  BookingClientOption,
  BookingDraft,
  BookingDraftSegment,
  BookingGroupView,
} from "@/features/booking/types";

const STEP_MINUTES = 15;
const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 20 * 60;

type BookingEntryFormProps = {
  draft: BookingDraft;
  activeSegmentId: string | null;
  title: string;
  dateLabel: string;
  clientOptions: BookingClientOption[];
  canCreateBooking?: boolean;
  canCreateClient?: boolean;
  isSavingBooking?: boolean;
  isSavingClient?: boolean;
  errorMessage?: string | null;
  onSelectSegment: (segmentId: string) => void;
  onUpdateSegment: (
    segmentId: string,
    updater: (segment: BookingDraftSegment) => BookingDraftSegment | null,
  ) => void;
  onDeleteSegment: (segmentId: string) => void;
  onClientChange: (clientId: string) => void;
  onSave: () => void | Promise<void>;
  onCreateClient: (input: {
    firstName: string;
    lastName: string;
    phone: string;
    carBrand: string;
    carModel: string;
    plateNumber: string;
  }) => boolean | Promise<boolean>;
  onNoteChange: (note: string) => void;
  onCancel: () => void;
  upcomingEntries: BookingGroupView[];
  fallbackUpcomingEntries: BookingGroupView[];
  fallbackUpcomingSubtitle: string | null;
};

type QuickClientForm = {
  firstName: string;
  lastName: string;
  phone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
};

const EMPTY_QUICK_CLIENT_FORM: QuickClientForm = {
  firstName: "",
  lastName: "",
  phone: "",
  carBrand: "",
  carModel: "",
  plateNumber: "",
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

function adjustSegmentTime(
  segment: BookingDraftSegment,
  edge: "start" | "end",
  delta: number,
) {
  const start = parseTime(segment.start);
  const end = parseTime(segment.end);

  if (edge === "start") {
    const nextStart = Math.max(DAY_START_MINUTES, Math.min(start + delta, end - STEP_MINUTES));
    return {
      ...segment,
      start: formatTime(nextStart),
    };
  }

  const nextEnd = Math.min(DAY_END_MINUTES, Math.max(end + delta, start + STEP_MINUTES));
  return {
    ...segment,
    end: formatTime(nextEnd),
  };
}

export function BookingEntryForm({
  draft,
  activeSegmentId,
  title,
  dateLabel,
  clientOptions,
  canCreateBooking = true,
  canCreateClient = true,
  isSavingBooking = false,
  isSavingClient = false,
  errorMessage,
  onSelectSegment,
  onUpdateSegment,
  onDeleteSegment,
  onClientChange,
  onSave,
  onCreateClient,
  onNoteChange,
  onCancel,
  upcomingEntries,
  fallbackUpcomingEntries,
  fallbackUpcomingSubtitle,
}: BookingEntryFormProps) {
  const [clientMode, setClientMode] = useState<"existing" | "new">("existing");
  const [showOptionalClientFields, setShowOptionalClientFields] = useState(false);
  const [quickClientForm, setQuickClientForm] = useState<QuickClientForm>(EMPTY_QUICK_CLIENT_FORM);

  const sortedSegments = [...draft.segments].sort((left, right) => {
    const startDiff = parseTime(left.start) - parseTime(right.start);
    return startDiff !== 0 ? startDiff : left.postName.localeCompare(right.postName, "ru");
  });
  const normalizedQuickPhone = normalizeAuthPhoneInput(quickClientForm.phone);
  const canCreateQuickClient =
    canCreateClient &&
    !isSavingClient &&
    quickClientForm.firstName.trim().length > 0 &&
    normalizedQuickPhone.length === 10;
  const canSaveBooking =
    canCreateBooking &&
    !isSavingBooking &&
    clientMode === "existing" &&
    (draft.clientId === "anonymous" || draft.clientId.trim().length > 0);

  function handleSave() {
    if (!canSaveBooking) {
      return;
    }

    onSave();
  }

  function updateQuickClient<K extends keyof QuickClientForm>(key: K, value: QuickClientForm[K]) {
    setQuickClientForm((current) => ({
      ...current,
      [key]:
        key === "phone"
          ? (normalizeAuthPhoneInput(String(value)) as QuickClientForm[K])
          : value,
    }));
  }

  async function handleCreateClient() {
    if (!canCreateQuickClient) {
      return;
    }

    const created = await onCreateClient({
      ...quickClientForm,
      phone: formatAuthPhoneDisplay(normalizedQuickPhone),
    });

    if (!created) {
      return;
    }

    setClientMode("existing");
    setShowOptionalClientFields(false);
    setQuickClientForm(EMPTY_QUICK_CLIENT_FORM);
  }

  return (
    <>
      <div className="border-t border-[color:var(--border)] bg-[#fcfcfe] xl:border-l xl:border-t-0">
        <div className="border-b border-[color:var(--border)] px-4 py-4 sm:px-5">
          <p className="text-[14px] font-medium text-[color:var(--primary)]">Текущая запись</p>
          <h2 className="mt-1 min-h-[1.75rem] text-[20px] font-semibold text-[color:var(--foreground)] [font-variant-numeric:tabular-nums]">
            {title}
          </h2>
          <p className="mt-1 min-h-[1.25rem] text-[14px] capitalize text-[color:var(--muted)] [font-variant-numeric:tabular-nums]">
            {dateLabel}
          </p>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-5">
          <div className="divide-y divide-[color:var(--border)] border-y border-[color:var(--border)]">
            {sortedSegments.map((segment) => {
              const active = segment.id === activeSegmentId;

              return (
                <div
                  key={segment.id}
                  className={`px-4 py-4 ${
                    active
                      ? "bg-[color:var(--primary)]/5"
                      : "bg-transparent"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSegment(segment.id)}
                    className="flex w-full items-start justify-between gap-3 text-left"
                  >
                    <div>
                      <span className="block text-[15px] font-semibold text-[color:var(--foreground)]">
                        {segment.postName}
                      </span>
                      <span className="mt-1 block text-[14px] text-[color:var(--muted)]">
                        {segment.start}-{segment.end}
                      </span>
                    </div>
                    <span className="pt-0.5 text-[12px] font-medium text-[color:var(--primary)]">
                      {active ? "Активный" : "Выбрать"}
                    </span>
                  </button>

                  <div className="mt-3 grid grid-cols-1 items-center gap-3 text-[13px] text-[color:var(--foreground)] sm:grid-cols-[1fr_auto_1fr_auto]">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSegment(segment.id, (current) =>
                            adjustSegmentTime(current, "start", -STEP_MINUTES),
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-[62px] text-center font-medium">{segment.start}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSegment(segment.id, (current) =>
                            adjustSegmentTime(current, "start", STEP_MINUTES),
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <span className="hidden text-[color:var(--muted)] sm:block">—</span>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSegment(segment.id, (current) =>
                            adjustSegmentTime(current, "end", -STEP_MINUTES),
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="min-w-[62px] text-center font-medium">{segment.end}</span>
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSegment(segment.id, (current) =>
                            adjustSegmentTime(current, "end", STEP_MINUTES),
                          )
                        }
                        className="flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => onDeleteSegment(segment.id)}
                      className="flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white text-[color:var(--muted)] sm:ml-auto"
                      aria-label="Удалить сегмент"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <span className="text-[13px] font-medium text-[color:var(--foreground)]">
              Клиент
            </span>

            {clientMode === "existing" ? (
              <div className="space-y-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <select
                    value={draft.clientId}
                    onChange={(event) => onClientChange(event.target.value)}
                    className="h-10 w-full border border-[color:var(--border)] bg-white px-3.5 text-[14px] outline-none focus:border-[color:var(--primary)]"
                  >
                    <option value="">Выберите клиента</option>
                    {clientOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {canCreateClient ? (
                    <button
                      type="button"
                      onClick={() => setClientMode("new")}
                      className="flex h-10 w-full items-center justify-center border border-[color:var(--border)] bg-white text-[16px] text-[color:var(--foreground)] sm:w-10"
                      aria-label="Добавить клиента"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>

                {draft.clientId === "anonymous" ? (
                  <div className="border border-[color:var(--border)] bg-[#f6f1eb] px-3 py-2 text-[12px] leading-5 text-[color:var(--muted)]">
                    Выбран анонимный клиент. Запись сохранится без карточки клиента.
                  </div>
                ) : draft.clientId.trim().length === 0 ? (
                  <div className="text-[12px] leading-5 text-[color:var(--muted)]">
                    Выберите клиента из базы, создайте нового или укажите анонимного клиента.
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-3 border border-[color:var(--border)] bg-white px-3.5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                    Новый клиент
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setClientMode("existing");
                      setShowOptionalClientFields(false);
                      setQuickClientForm(EMPTY_QUICK_CLIENT_FORM);
                    }}
                    className="text-[12px] text-[color:var(--primary)]"
                  >
                    Назад
                  </button>
                </div>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-[color:var(--foreground)]">Имя</span>
                  <input
                    value={quickClientForm.firstName}
                    onChange={(event) => updateQuickClient("firstName", event.target.value)}
                    placeholder="Введите имя"
                    className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] outline-none focus:border-[color:var(--primary)]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-[12px] font-medium text-[color:var(--foreground)]">Телефон</span>
                  <div className="flex h-9 w-full items-center border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] focus-within:border-[color:var(--primary)]">
                    <span className="mr-2 shrink-0 text-[color:var(--muted)]">+7</span>
                    <input
                      value={formatAuthPhoneInput(quickClientForm.phone)}
                      onChange={(event) => updateQuickClient("phone", event.target.value)}
                      placeholder="999 999-99-99"
                      className="w-full bg-transparent outline-none"
                      inputMode="numeric"
                    />
                  </div>
                </label>

                <button
                  type="button"
                  onClick={() => setShowOptionalClientFields((current) => !current)}
                  className="flex items-center gap-1 text-[12px] font-medium text-[color:var(--primary)]"
                >
                  {showOptionalClientFields ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  Дополнительно
                </button>

                {showOptionalClientFields ? (
                  <div className="space-y-2.5 border-t border-[color:var(--border)] pt-3">
                    <label className="block space-y-1">
                      <span className="text-[12px] font-medium text-[color:var(--foreground)]">Фамилия</span>
                      <input
                        value={quickClientForm.lastName}
                        onChange={(event) => updateQuickClient("lastName", event.target.value)}
                        placeholder="Введите фамилию"
                        className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] outline-none focus:border-[color:var(--primary)]"
                      />
                    </label>

                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="block space-y-1">
                        <span className="text-[12px] font-medium text-[color:var(--foreground)]">Марка</span>
                        <input
                          value={quickClientForm.carBrand}
                          onChange={(event) => updateQuickClient("carBrand", event.target.value)}
                          placeholder="Например, Kia"
                          className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] outline-none focus:border-[color:var(--primary)]"
                        />
                      </label>
                      <label className="block space-y-1">
                        <span className="text-[12px] font-medium text-[color:var(--foreground)]">Модель</span>
                        <input
                          value={quickClientForm.carModel}
                          onChange={(event) => updateQuickClient("carModel", event.target.value)}
                          placeholder="Например, Rio"
                          className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] outline-none focus:border-[color:var(--primary)]"
                        />
                      </label>
                    </div>

                    <label className="block space-y-1">
                      <span className="text-[12px] font-medium text-[color:var(--foreground)]">Госномер</span>
                      <input
                        value={quickClientForm.plateNumber}
                        onChange={(event) => updateQuickClient("plateNumber", event.target.value)}
                        placeholder="Например, А123АА 196"
                        className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] outline-none focus:border-[color:var(--primary)]"
                      />
                    </label>
                  </div>
                ) : null}

                <div className="flex justify-stretch sm:justify-end">
                  <button
                    type="button"
                    onClick={handleCreateClient}
                    disabled={!canCreateQuickClient}
                    className="h-9 w-full border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                  >
                    {isSavingClient ? "Сохранение..." : "Сохранить клиента"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <label className="space-y-1.5">
            <span className="text-[13px] font-medium text-[color:var(--foreground)]">
              Примечание
            </span>
            <textarea
              value={draft.note}
              onChange={(event) => onNoteChange(event.target.value)}
              rows={4}
              className="w-full resize-none border border-[color:var(--border)] bg-white px-3.5 py-2.5 text-[14px] leading-6 outline-none focus:border-[color:var(--primary)]"
            />
          </label>

          {errorMessage ? (
            <div className="text-[12px] leading-5 text-[#b45444]">{errorMessage}</div>
          ) : null}

          <div className="flex flex-col gap-2.5 pt-1 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSaveBooking}
              className="h-10 w-full border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {isSavingBooking ? "Сохранение..." : "Сохранить запись"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              disabled={isSavingBooking || isSavingClient}
              className="h-10 w-full border border-[color:var(--border)] bg-white px-5 text-[14px] text-[color:var(--foreground)] sm:w-auto"
            >
              Сбросить
            </button>
          </div>
        </div>

        <div className="min-h-[24rem]">
          <BookingUpcomingList
            title="Записи на выбранный день"
            subtitle={dateLabel}
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
      </div>
    </>
  );
}

"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import {
  BadgeDollarSign,
  CalendarClock,
  ChevronDown,
  NotebookTabs,
  PencilLine,
  Plus,
  ReceiptText,
  UserRound,
  X,
} from "lucide-react";
import { formatPrice } from "@/features/pricing/config";
import type { ClientVehicle, DemoClient } from "@/features/clients/types";
import {
  createClientVehicleViaApi,
  fetchClientsStore,
  updateClientVehicleViaApi,
  updateClientViaApi,
} from "@/features/clients/repository";
import {
  formatPlateForDisplay,
  isCompleteRussianPlate,
  normalizePhone,
} from "@/features/clients/client-contract";
import {
  buildSamePlateConfirmationKey,
  findClientPlateDuplicate,
  type ClientDuplicateConflict,
} from "@/features/clients/client-dedup";
import { PlateInput } from "@/features/orders/components/plate-input";
import { VehicleMakeModelPicker } from "@/features/orders/components/vehicle-make-model-picker";
import { fetchClientSourceSettingsViaApi } from "@/features/settings-client-sources/repository";

type EditClientDraft = {
  fullName: string;
};

type EditContactsDraft = {
  phone: string;
  email: string;
};

type VehicleDraft = {
  vehicleId: string | null;
  brand: string;
  model: string;
  plateNumber: string;
  radius: string;
};

const EMPTY_VEHICLE_DRAFT: VehicleDraft = {
  vehicleId: null,
  brand: "",
  model: "",
  plateNumber: "",
  radius: "",
};

function getVehicleNameLabel(vehicle: ClientVehicle) {
  const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ").trim();

  return brandModel || "Не указан";
}

function getVehiclePlateLabel(vehicle: ClientVehicle) {
  return formatPlateForDisplay(vehicle.plateNumber) || "Не указан";
}

function buildSourceOptions(currentSource: string, sourceNames: string[]) {
  const options = new Set(["Не выбран", ...sourceNames]);

  if (currentSource.trim()) {
    options.add(currentSource.trim());
  }

  return [...options];
}

function DuplicateVehicleWarning({
  conflict,
  onSelect,
  onConfirm,
  confirmed = false,
}: {
  conflict: ClientDuplicateConflict;
  onSelect: () => void;
  onConfirm?: () => void;
  confirmed?: boolean;
}) {
  const title = conflict.requiresConfirmation
    ? "Такой госномер уже есть у другой машины."
    : `Госномер ${conflict.plateNumber} уже есть в базе.`;
  const detail = conflict.requiresConfirmation
    ? "Можно выбрать существующий автомобиль или создать отдельный."
    : conflict.sameClient
      ? "Выберите существующий автомобиль в автопарке клиента, чтобы не создавать дубль."
      : `Он привязан к клиенту ${conflict.clientName}. Выберите существующего клиента/автомобиль.`;

  return (
    <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] leading-5 text-amber-900">
      <div className="font-semibold">{title}</div>
      <div className="mt-0.5">{detail}</div>
      <button
        type="button"
        onClick={onSelect}
        className="mt-1.5 font-semibold text-[color:var(--primary)] hover:underline"
      >
        Использовать существующего
      </button>
      {conflict.requiresConfirmation && onConfirm ? (
        <button
          type="button"
          onClick={onConfirm}
          className="ml-3 mt-1.5 font-semibold text-[color:var(--primary)] hover:underline"
        >
          {confirmed ? "Отдельный автомобиль подтверждён" : "Создать отдельный"}
        </button>
      ) : null}
    </div>
  );
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-[17px] font-semibold text-[color:var(--foreground)]">{title}</h2>
        {action}
      </div>
      <div className="border border-[color:var(--border)] bg-white">{children}</div>
    </div>
  );
}

function ModalFrame({
  title,
  onClose,
  children,
  maxWidthClassName = "max-w-[348px]",
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/38 px-4 py-8">
      <div className={clsx("w-full rounded-[4px] border border-[#dfe3ee] bg-white shadow-[0_10px_24px_rgba(15,23,42,0.10)]", maxWidthClassName)}>
        <div className="relative px-4 pb-2 pt-4 text-center">
          <h3 className="text-[16px] font-medium text-[color:var(--foreground)]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center text-[#9aa3b2]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-4 pb-4">{children}</div>
      </div>
    </div>
  );
}

export function ClientDetailScreen({ client }: { client: DemoClient | null }) {
  const [clientState, setClientState] = useState<DemoClient | null>(client);
  const [duplicateClients, setDuplicateClients] = useState<DemoClient[]>(client ? [client] : []);
  const [saveError, setSaveError] = useState("");
  const [savingSection, setSavingSection] = useState<"name" | "contacts" | "source" | "note" | "vehicle" | null>(
    null,
  );
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [contactsModalOpen, setContactsModalOpen] = useState(false);
  const [sourceModalOpen, setSourceModalOpen] = useState(false);
  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);
  const [availableSources, setAvailableSources] = useState<string[]>(() =>
    buildSourceOptions(client?.source ?? "", []),
  );
  const [nameDraft, setNameDraft] = useState<EditClientDraft>({
    fullName: client?.name ?? "",
  });
  const [contactsDraft, setContactsDraft] = useState<EditContactsDraft>({
    phone: client?.phone ?? "",
    email: client?.email ?? "",
  });
  const [sourceDraft, setSourceDraft] = useState(client?.source || "Не выбран");
  const [noteDraft, setNoteDraft] = useState(client?.note || "");
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft>(EMPTY_VEHICLE_DRAFT);
  const [confirmedVehicleSamePlateKey, setConfirmedVehicleSamePlateKey] = useState("");

  const clientView = useMemo(() => clientState, [clientState]);

  async function refreshAvailableSources(currentSource: string) {
    try {
      const response = await fetchClientSourceSettingsViaApi();
      setAvailableSources(buildSourceOptions(currentSource, response.settings.sources.map((source) => source.name)));
    } catch {
      setAvailableSources((current) => buildSourceOptions(currentSource, current));
    }
  }

  async function refreshDuplicateClients(fallbackClient = clientState) {
    try {
      const response = await fetchClientsStore();
      setDuplicateClients(response.clients);
    } catch {
      setDuplicateClients(fallbackClient ? [fallbackClient] : []);
    }
  }

  const kpis = useMemo(
    () =>
      clientView
        ? [
            {
              id: "total",
              label: "Общая сумма заказов",
              value: formatPrice(clientView.totalSpent),
              icon: BadgeDollarSign,
            },
            {
              id: "average",
              label: "Средний чек",
              value: formatPrice(clientView.averageCheck),
              icon: ReceiptText,
            },
            {
              id: "orders",
              label: "Количество заказов",
              value: String(clientView.ordersCount),
              icon: NotebookTabs,
            },
            {
              id: "gap",
              label: "Среднее время между заказами",
              value: clientView.averageVisitGapLabel || "—",
              icon: CalendarClock,
            },
          ]
        : [],
    [clientView],
  );

  async function persistClient(
    section: "name" | "contacts" | "source" | "note",
    input: {
      fullName?: string;
      firstName?: string;
      lastName?: string;
      middleName?: string;
      phone?: string;
      email?: string;
      note?: string;
      source?: string;
    },
  ) {
    if (!clientState) {
      return null;
    }

    setSaveError("");
    setSavingSection(section);

    try {
      const response = await updateClientViaApi(clientState.id, input);

      setClientState(response.client);
      setAvailableSources((current) => buildSourceOptions(response.client.source, current));

      return response.client;
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить клиента.");
      return null;
    } finally {
      setSavingSection(null);
    }
  }

  function openNameModal() {
    if (!clientState) {
      return;
    }

    setSaveError("");
    setNameDraft({
      fullName: clientState.name,
    });
    setNameModalOpen(true);
  }

  function openContactsModal() {
    if (!clientState) {
      return;
    }

    setSaveError("");
    setContactsDraft({
      phone: clientState.phone,
      email: clientState.email,
    });
    setContactsModalOpen(true);
  }

  function openSourceModal() {
    if (!clientState) {
      return;
    }

    setSaveError("");
    void refreshAvailableSources(clientState.source ?? "");
    setSourceDraft(clientState.source || "Не выбран");
    setSourceDropdownOpen(false);
    setSourceModalOpen(true);
  }

  function openNoteModal() {
    if (!clientState) {
      return;
    }

    setSaveError("");
    setNoteDraft(clientState.note || "");
    setNoteModalOpen(true);
  }

  function openAddVehicleModal() {
    if (!clientState) {
      return;
    }

    setSaveError("");
    setConfirmedVehicleSamePlateKey("");
    setVehicleDraft(EMPTY_VEHICLE_DRAFT);
    setVehicleModalOpen(true);
    void refreshDuplicateClients();
  }

  function openEditVehicleModal(vehicle: ClientVehicle) {
    setSaveError("");
    setConfirmedVehicleSamePlateKey("");
    setVehicleDraft({
      vehicleId: vehicle.id,
      brand: vehicle.brand,
      model: vehicle.model,
      plateNumber: vehicle.plateNumber,
      radius: vehicle.radius,
    });
    setVehicleModalOpen(true);
    void refreshDuplicateClients();
  }

  async function saveClientName() {
    if (!clientState) {
      return;
    }

    const nextClient = await persistClient("name", {
      fullName: nameDraft.fullName,
    });

    if (nextClient) {
      setNameModalOpen(false);
    }
  }

  async function saveContacts() {
    if (!clientState) {
      return;
    }

    const trimmedPhone = (contactsDraft.phone ?? "").trim();
    if (!trimmedPhone) {
      setSaveError("Номер телефона обязателен для заполнения.");
      return;
    }

    const normalized = normalizePhone(trimmedPhone);
    if (!normalized) {
      setSaveError("Номер телефона должен содержать 10 цифр (например, 999 123-45-67).");
      return;
    }

    const nextClient = await persistClient("contacts", {
      phone: normalized,
      email: contactsDraft.email,
    });

    if (nextClient) {
      setContactsModalOpen(false);
    }
  }

  async function saveClientSource() {
    if (!clientState) {
      return;
    }

    const nextClient = await persistClient("source", {
      source: sourceDraft === "Не выбран" ? "" : sourceDraft,
    });

    if (nextClient) {
      setSourceModalOpen(false);
      setSourceDropdownOpen(false);
    }
  }

  async function saveClientNote() {
    if (!clientState) {
      return;
    }

    const nextClient = await persistClient("note", {
      note: noteDraft,
    });

    if (nextClient) {
      setNoteModalOpen(false);
    }
  }

  const vehicleDuplicateConflict =
    clientState && vehicleModalOpen
      ? findClientPlateDuplicate(duplicateClients, vehicleDraft.plateNumber, {
          targetClientId: clientState.id,
          excludeVehicleId: vehicleDraft.vehicleId,
          carBrand: vehicleDraft.brand,
          carModel: vehicleDraft.model,
        })
      : null;
  const vehicleConfirmationKey = buildSamePlateConfirmationKey({
    scope: "client-detail-vehicle",
    clientId: clientState?.id,
    vehicleId: vehicleDraft.vehicleId,
    carBrand: vehicleDraft.brand,
    carModel: vehicleDraft.model,
    plateNumber: vehicleDraft.plateNumber,
  });
  const vehicleSamePlateConfirmed = Boolean(
    vehicleDuplicateConflict?.requiresConfirmation &&
      confirmedVehicleSamePlateKey === vehicleConfirmationKey,
  );
  const vehiclePlateIncomplete = Boolean(
    vehicleDraft.plateNumber.trim() && !isCompleteRussianPlate(vehicleDraft.plateNumber),
  );

  async function saveVehicle() {
    if (!clientState) {
      return;
    }

    setSaveError("");
    setSavingSection("vehicle");

    try {
      if (vehicleDuplicateConflict && !vehicleSamePlateConfirmed) {
        setSaveError(
          vehicleDuplicateConflict.requiresConfirmation
            ? "Подтвердите создание отдельного автомобиля с таким госномером."
            : "Такой госномер уже есть в базе. Выберите существующую запись.",
        );
        return;
      }

      if (vehiclePlateIncomplete) {
        setSaveError("Укажите номер и регион.");
        return;
      }

      const input = {
        brand: vehicleDraft.brand,
        model: vehicleDraft.model,
        plateNumber: vehicleDraft.plateNumber,
        radius: vehicleDraft.radius,
        allowSamePlateDifferentVehicle: vehicleSamePlateConfirmed,
      };
      const response = vehicleDraft.vehicleId
        ? await updateClientVehicleViaApi(clientState.id, vehicleDraft.vehicleId, input)
        : await createClientVehicleViaApi(clientState.id, input);

      setClientState(response.client);
      setDuplicateClients((current) => [
        response.client,
        ...current.filter((item) => item.id !== response.client.id),
      ]);
      setVehicleModalOpen(false);
      setVehicleDraft(EMPTY_VEHICLE_DRAFT);
      setConfirmedVehicleSamePlateKey("");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Не удалось сохранить автомобиль.");
    } finally {
      setSavingSection(null);
    }
  }

  if (!clientView) {
    return (
      <section className="space-y-3">
        <div className="flex items-center gap-6 px-1 text-[15px]">
          <Link
            href="/clients"
            className="font-medium text-[color:var(--foreground)] hover:text-[color:var(--primary)]"
          >
            Клиенты
          </Link>
          <span className="font-medium text-[color:var(--primary)]">Просмотр клиента</span>
        </div>

        <div className="border border-[color:var(--border)] bg-white px-5 py-6 text-[16px] text-[color:var(--foreground)]">
          Клиент не найден.
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-6 px-1 text-[15px]">
        <Link
          href="/clients"
          className="font-medium text-[color:var(--foreground)] hover:text-[color:var(--primary)]"
        >
          Клиенты
        </Link>
        <span className="font-medium text-[color:var(--primary)]">Просмотр клиента</span>
      </div>

      <div className="border border-[color:var(--border)] bg-white px-4 py-4 sm:px-5 sm:py-4.5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#2b2b2b] text-white">
            <UserRound className="h-7 w-7" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[26px] font-semibold leading-none text-[color:var(--foreground)] sm:text-[32px]">
                {clientView.name}
              </h1>
              <button
                type="button"
                onClick={openNameModal}
                className="mt-0.5 flex h-6 w-6 items-center justify-center text-[color:var(--foreground)]"
                aria-label="Редактировать клиента"
              >
                <PencilLine className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[14px] text-[color:var(--muted)]">
              Дата регистрации: {clientView.registrationDate}
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((item) => {
          const Icon = item.icon;

          return (
            <div
              key={item.id}
              className="flex min-h-[88px] items-center gap-3.5 border border-[color:var(--border)] bg-white px-4 py-3.5"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] bg-[color:var(--primary)] text-white">
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="text-[14px] text-[color:var(--muted)]">{item.label}</p>
                <p className="mt-1.5 text-[28px] font-semibold leading-none text-[color:var(--foreground)]">
                  {item.value}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-x-4 gap-y-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Section
            title="Персональная информация"
            action={
              <button
                type="button"
                onClick={openContactsModal}
                className="flex h-6 w-6 items-center justify-center text-[color:var(--foreground)]"
                aria-label="Редактировать персональную информацию"
              >
                <PencilLine className="h-3.5 w-3.5" />
              </button>
            }
          >
            <div className="grid min-h-[84px] gap-3 px-4 py-4.5 md:grid-cols-2">
              <div>
                <p className="text-[14px] text-[color:var(--muted)]">Контактный телефон</p>
                <p className="mt-2 text-[16px] font-medium text-[color:var(--foreground)]">
                  {clientView.phone || "Не указан"}
                </p>
              </div>
              <div>
                <p className="text-[14px] text-[color:var(--muted)]">E-mail</p>
                <p className="mt-2 text-[16px] font-medium text-[color:var(--foreground)]">
                  {clientView.email || "—"}
                </p>
              </div>
            </div>
          </Section>

          <Section
            title="Заметка"
            action={
              <button
                type="button"
                onClick={openNoteModal}
                className="flex h-6 w-6 items-center justify-center text-[color:var(--foreground)]"
                aria-label="Редактировать заметку"
              >
                <PencilLine className="h-3.5 w-3.5" />
              </button>
            }
          >
            <div className="min-h-[88px] px-4 py-4.5 text-[16px] leading-6 text-[color:var(--foreground)]">
              {clientView.note || "—"}
            </div>
          </Section>

          <Section
            title="Источник клиента"
            action={
              <button
                type="button"
                onClick={openSourceModal}
                className="flex h-6 w-6 items-center justify-center text-[color:var(--foreground)]"
                aria-label="Редактировать источник клиента"
              >
                <PencilLine className="h-3.5 w-3.5" />
              </button>
            }
          >
            <div className="min-h-[76px] px-4 py-4.5 text-[16px] text-[color:var(--foreground)]">
              {clientView.source || "—"}
            </div>
          </Section>

          <Section title="Запись">
            <div className="min-h-[92px] sm:hidden">
              {clientView.bookings.length > 0 ? (
                <div className="divide-y divide-[color:var(--border)]">
                  {clientView.bookings.map((booking) => (
                    <div key={booking.id} className="px-4 py-3">
                      <div className="text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
                        {booking.date}
                      </div>
                      {booking.branch ? (
                        <div className="mt-0.5 text-[13px] leading-5 text-[color:var(--muted)]">
                          {booking.branch}
                        </div>
                      ) : null}
                      <div className="mt-2 text-[14px] leading-5 text-[color:var(--foreground)]">
                        {booking.note}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                  Нет данных
                </div>
              )}
            </div>

            <div className="hidden min-h-[92px] overflow-x-auto sm:block">
              <div className="min-w-[420px]">
                <div className="grid grid-cols-[168px_minmax(0,1fr)] border-b border-[color:var(--border)] px-4 py-4 text-[14px] text-[color:var(--muted)]">
                  <span>Дата</span>
                  <span>Заметка</span>
                </div>
                {clientView.bookings.length > 0 ? (
                  clientView.bookings.map((booking) => (
                    <div
                      key={booking.id}
                      className="grid grid-cols-[168px_minmax(0,1fr)] px-4 py-4 text-[16px] leading-6 text-[color:var(--foreground)]"
                    >
                      <span className="leading-5">
                        <span className="block">{booking.date}</span>
                        {booking.branch ? (
                          <span className="mt-0.5 block text-[13px] leading-5 text-[color:var(--muted)]">
                            {booking.branch}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="min-w-0"
                        style={{
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: 2,
                          overflow: "hidden",
                          overflowWrap: "anywhere",
                          wordBreak: "break-word",
                        }}
                      >
                        {booking.note}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                    Нет данных
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section
            title="Автомобили"
            action={
              <button
                type="button"
                onClick={openAddVehicleModal}
                className="flex h-7 items-center gap-1.5 border border-[color:var(--border)] bg-white px-2 text-[13px] font-medium text-[color:var(--foreground)] hover:border-[color:var(--primary)] hover:text-[color:var(--primary)]"
              >
                <Plus className="h-3.5 w-3.5" />
                Добавить
              </button>
            }
          >
            <div className="min-h-[92px] sm:hidden">
              {clientView.vehicles.length > 0 ? (
                <div className="divide-y divide-[color:var(--border)]">
                  {clientView.vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
                            {getVehicleNameLabel(vehicle)}
                          </div>
                          <div className="mt-0.5 text-[13px] leading-5 text-[color:var(--muted)]">
                            Госномер: {getVehiclePlateLabel(vehicle)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => openEditVehicleModal(vehicle)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--primary)]"
                          aria-label="Редактировать автомобиль"
                        >
                          <PencilLine className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
                        Сумма заказов
                      </div>
                      <div className="mt-0.5 text-[14px] leading-5 text-[color:var(--foreground)]">
                        {vehicle.totalSpent ? formatPrice(vehicle.totalSpent) : "—"}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                  Нет данных
                </div>
              )}
            </div>

            <div className="hidden min-h-[92px] overflow-x-auto sm:block">
              <div className="min-w-[360px]">
                <div className="grid grid-cols-[minmax(0,1fr)_128px_160px_48px] border-b border-[color:var(--border)] px-4 py-4 text-[14px] text-[color:var(--muted)]">
                  <span>Автомобиль</span>
                  <span>Госномер</span>
                  <span>Сумма заказов</span>
                  <span />
                </div>
                {clientView.vehicles.length > 0 ? (
                  clientView.vehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="grid grid-cols-[minmax(0,1fr)_128px_160px_48px] items-center px-4 py-4 text-[16px] leading-6 text-[color:var(--foreground)]"
                    >
                      <span className="truncate">{getVehicleNameLabel(vehicle)}</span>
                      <span className="truncate font-mono text-[13px] uppercase">{getVehiclePlateLabel(vehicle)}</span>
                      <span>{vehicle.totalSpent ? formatPrice(vehicle.totalSpent) : "—"}</span>
                      <button
                        type="button"
                        onClick={() => openEditVehicleModal(vehicle)}
                        className="flex h-7 w-7 items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--primary)]"
                        aria-label="Редактировать автомобиль"
                      >
                        <PencilLine className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                    Нет данных
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section title="Заказы">
            <div className="min-h-[96px] sm:hidden">
              {clientView.orders.length > 0 ? (
                <div className="divide-y divide-[color:var(--border)]">
                  {clientView.orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/view/${order.id}`}
                      className="block px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15px] font-medium leading-5 text-[color:var(--primary)]">
                            {order.orderNumber}
                          </div>
                          <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
                            {order.dateTime.split(",")[0]}
                          </div>
                          <div className="text-[13px] leading-5 text-[color:var(--muted)]">
                            {order.branch}
                          </div>
                        </div>
                        <div
                          className={clsx(
                            "shrink-0 text-right text-[13px] font-medium leading-5",
                            order.status === "Выполнен" && "text-[#c28b35]",
                            order.status === "Оплачен" && "text-[color:var(--primary)]",
                            order.status === "Ожидает оплаты" && "text-[#c28b35]",
                          )}
                        >
                          {order.status === "Выполнен" ? "Завершен" : order.status}
                        </div>
                      </div>
                      <div className="mt-2 flex items-start justify-between gap-3">
                        <div className="min-w-0 text-[13px] leading-5 text-[color:var(--muted)]">
                          <div className="truncate">{order.carLabel.split(" · ")[0]}</div>
                        </div>
                        <div className="shrink-0 text-[15px] font-medium leading-5 text-[color:var(--foreground)]">
                          {formatPrice(order.amount)}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                  Нет данных
                </div>
              )}
            </div>

            <div className="hidden min-h-[96px] overflow-x-auto sm:block">
              <div className="min-w-[624px]">
                <div className="grid grid-cols-[60px_156px_132px_minmax(0,1fr)_138px] border-b border-[color:var(--border)] px-4 py-4 text-[14px] text-[color:var(--muted)]">
                  <span>№</span>
                  <span>Дата</span>
                  <span>Сумма</span>
                  <span>Автомобиль</span>
                  <span>Статус</span>
                </div>
                {clientView.orders.length > 0 ? (
                  clientView.orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/view/${order.id}`}
                      className="grid grid-cols-[60px_156px_132px_minmax(0,1fr)_138px] items-center px-4 py-4 text-[16px] leading-6 text-[color:var(--foreground)]"
                    >
                      <span className="font-medium text-[color:var(--primary)] hover:underline">
                        {order.orderNumber}
                      </span>
                      <span className="leading-5">
                        <span className="block">{order.dateTime.split(",")[0]}</span>
                        <span className="mt-0.5 block text-[13px] leading-5 text-[color:var(--muted)]">
                          {order.branch}
                        </span>
                      </span>
                      <span>{formatPrice(order.amount)}</span>
                      <span className="truncate">{order.carLabel.split(" · ")[0]}</span>
                      <span
                        className={clsx(
                          order.status === "Выполнен" && "text-[#c28b35]",
                          order.status === "Оплачен" && "text-[color:var(--primary)]",
                          order.status === "Ожидает оплаты" && "text-[#c28b35]",
                        )}
                      >
                        {order.status === "Выполнен" ? "Завершен" : order.status}
                      </span>
                    </Link>
                  ))
                ) : (
                  <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                    Нет данных
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section title="Хранения">
            <div className="min-h-[84px] sm:hidden">
              {clientView.storages.length > 0 ? (
                <div className="divide-y divide-[color:var(--border)]">
                  {clientView.storages.map((storage) => (
                    <div key={storage.id} className="px-4 py-3">
                      <div className="text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
                        {storage.name}
                      </div>
                      {storage.branch ? (
                        <div className="mt-0.5 text-[13px] leading-5 text-[color:var(--muted)]">
                          {storage.branch}
                        </div>
                      ) : null}
                      <div className="mt-2 text-[13px] leading-5 text-[color:var(--muted)]">
                        {storage.status}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                  Нет данных
                </div>
              )}
            </div>

            <div className="hidden min-h-[84px] overflow-x-auto sm:block">
              <div className="min-w-[420px]">
                <div className="grid grid-cols-[minmax(0,1fr)_196px] border-b border-[color:var(--border)] px-4 py-4 text-[14px] text-[color:var(--muted)]">
                  <span>Наименование</span>
                  <span>Статус</span>
                </div>
                {clientView.storages.length > 0 ? (
                  clientView.storages.map((storage) => (
                    <div
                      key={storage.id}
                      className="grid grid-cols-[minmax(0,1fr)_196px] px-4 py-4 text-[16px] leading-6 text-[color:var(--foreground)]"
                    >
                      <span className="leading-5">
                        <span className="block truncate">{storage.name}</span>
                        {storage.branch ? (
                          <span className="mt-0.5 block text-[13px] leading-5 text-[color:var(--muted)]">
                            {storage.branch}
                          </span>
                        ) : null}
                      </span>
                      <span className="text-[color:var(--muted)]">{storage.status}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-9 text-center text-[16px] text-[color:var(--muted)]">
                    Нет данных
                  </div>
                )}
              </div>
            </div>
          </Section>
        </div>
      </div>

      {nameModalOpen ? (
        <ModalFrame title="Редактирование клиента" onClose={() => setNameModalOpen(false)}>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-[color:var(--foreground)]">ФИО</span>
              <input
                value={nameDraft.fullName}
                onChange={(event) =>
                  setNameDraft((current) => ({ ...current, fullName: event.target.value }))
                }
                placeholder="Антон, Антон Иванов или Иванов Антон Петрович"
                className="h-8 w-full rounded-[4px] border border-[#dfe3ee] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              />
            </label>

            {saveError ? (
              <p className="text-[13px] text-[#c45b5b]">{saveError}</p>
            ) : null}

            {vehiclePlateIncomplete && !saveError ? (
              <p className="text-[13px] text-[#c45b5b]">Укажите номер и регион.</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNameModalOpen(false)}
                disabled={savingSection === "name"}
                className="h-8 rounded-[4px] border border-[#cdd6ec] bg-white text-[13px] font-medium text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveClientName}
                disabled={savingSection === "name"}
                className="h-8 rounded-[4px] bg-[color:var(--primary)] text-[13px] font-medium text-white"
              >
                {savingSection === "name" ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {contactsModalOpen ? (
        <ModalFrame title="Редактирование клиента" onClose={() => setContactsModalOpen(false)}>
          <div className="space-y-3">
            <label className="block space-y-1.5 pt-2">
              <span className="text-[13px] font-medium text-[color:var(--foreground)]">Телефон</span>
              <input
                value={contactsDraft.phone}
                onChange={(event) =>
                  setContactsDraft((current) => ({ ...current, phone: event.target.value }))
                }
                className="h-8 w-full rounded-[4px] border border-[#dfe3ee] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-[13px] font-medium text-[color:var(--foreground)]">E-mail</span>
              <input
                value={contactsDraft.email}
                onChange={(event) =>
                  setContactsDraft((current) => ({ ...current, email: event.target.value }))
                }
                className="h-8 w-full rounded-[4px] border border-[#dfe3ee] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              />
            </label>

            {saveError ? (
              <p className="text-[13px] text-[#c45b5b]">{saveError}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setContactsModalOpen(false)}
                disabled={savingSection === "contacts"}
                className="h-8 rounded-[4px] border border-[#cdd6ec] bg-white text-[13px] font-medium text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveContacts}
                disabled={savingSection === "contacts"}
                className="h-8 rounded-[4px] bg-[color:var(--primary)] text-[13px] font-medium text-white"
              >
                {savingSection === "contacts" ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {sourceModalOpen ? (
        <ModalFrame title="Редактирование клиента" onClose={() => setSourceModalOpen(false)}>
          <div className="space-y-3">
            <div className="relative pt-4">
              {sourceDropdownOpen ? (
                <div className="absolute left-0 top-0 z-10 w-[156px] rounded-[4px] border border-[#e3e6ef] bg-white shadow-[0_8px_20px_rgba(15,23,42,0.10)]">
                  {availableSources.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setSourceDraft(option);
                        setSourceDropdownOpen(false);
                      }}
                      className="block w-full px-4 py-3 text-left text-[14px] text-[color:var(--foreground)] hover:bg-[#f7f8fc]"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => setSourceDropdownOpen((current) => !current)}
                className="flex h-8 w-full items-center justify-between rounded-[4px] border border-[#dfe3ee] bg-white px-3 text-[14px] text-[color:var(--foreground)]"
              >
                <span>{sourceDraft || "Не выбран"}</span>
                <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
              </button>
            </div>

            {saveError ? (
              <p className="text-[13px] text-[#c45b5b]">{saveError}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setSourceModalOpen(false)}
                disabled={savingSection === "source"}
                className="h-8 rounded-[4px] border border-[#cdd6ec] bg-white text-[13px] font-medium text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveClientSource}
                disabled={savingSection === "source"}
                className="h-8 rounded-[4px] bg-[color:var(--primary)] text-[13px] font-medium text-white"
              >
                {savingSection === "source" ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {noteModalOpen ? (
        <ModalFrame title="Редактирование клиента" onClose={() => setNoteModalOpen(false)}>
          <div className="space-y-3">
            <label className="block space-y-1.5 pt-3">
              <span className="text-[13px] font-medium text-[color:var(--foreground)]">Заметка</span>
              <input
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                className="h-8 w-full rounded-[4px] border border-[#dfe3ee] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              />
            </label>

            {saveError ? (
              <p className="text-[13px] text-[#c45b5b]">{saveError}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setNoteModalOpen(false)}
                disabled={savingSection === "note"}
                className="h-8 rounded-[4px] border border-[#cdd6ec] bg-white text-[13px] font-medium text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveClientNote}
                disabled={savingSection === "note"}
                className="h-8 rounded-[4px] bg-[color:var(--primary)] text-[13px] font-medium text-white"
              >
                {savingSection === "note" ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}

      {vehicleModalOpen ? (
        <ModalFrame
          title={vehicleDraft.vehicleId ? "Редактирование автомобиля" : "Новый автомобиль"}
          onClose={() => setVehicleModalOpen(false)}
          maxWidthClassName="max-w-[560px]"
        >
          <div className="space-y-3 pt-2">
            <VehicleMakeModelPicker
              brandValue={vehicleDraft.brand}
              modelValue={vehicleDraft.model}
              onBrandChange={(value) =>
                setVehicleDraft((current) => ({ ...current, brand: value }))
              }
              onModelChange={(value) =>
                setVehicleDraft((current) => ({ ...current, model: value }))
              }
              compact
            />

            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px]">
              <PlateInput
                value={vehicleDraft.plateNumber}
                onChange={(value) =>
                  setVehicleDraft((current) => ({ ...current, plateNumber: value }))
                }
                compact
              />
              <label className="block space-y-1.5">
                <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                  Радиус
                </span>
                <input
                  value={vehicleDraft.radius}
                  onChange={(event) =>
                    setVehicleDraft((current) => ({ ...current, radius: event.target.value }))
                  }
                  placeholder="R16"
                  className="h-10 w-full rounded-[4px] border border-[#dfe3ee] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                />
              </label>
            </div>

            {vehicleDuplicateConflict ? (
              <DuplicateVehicleWarning
                conflict={vehicleDuplicateConflict}
                onSelect={() => {
                  setVehicleModalOpen(false);
                  setConfirmedVehicleSamePlateKey("");

                  if (
                    clientState &&
                    vehicleDuplicateConflict.clientId !== clientState.id &&
                    typeof window !== "undefined"
                  ) {
                    window.location.href = `/clients/${vehicleDuplicateConflict.clientId}`;
                  }
                }}
                onConfirm={() => {
                  setSaveError("");
                  setConfirmedVehicleSamePlateKey(vehicleConfirmationKey);
                }}
                confirmed={vehicleSamePlateConfirmed}
              />
            ) : null}

            {saveError ? (
              <p className="text-[13px] text-[#c45b5b]">{saveError}</p>
            ) : null}

            <div className="grid grid-cols-2 gap-2 pt-2">
              <button
                type="button"
                onClick={() => setVehicleModalOpen(false)}
                disabled={savingSection === "vehicle"}
                className="h-8 rounded-[4px] border border-[#cdd6ec] bg-white text-[13px] font-medium text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={saveVehicle}
                disabled={
                  savingSection === "vehicle" ||
                  !(
                    vehicleDraft.brand.trim() ||
                    vehicleDraft.model.trim() ||
                    vehicleDraft.plateNumber.trim()
                  ) ||
                  vehiclePlateIncomplete ||
                  Boolean(vehicleDuplicateConflict && !vehicleSamePlateConfirmed)
                }
                className="h-8 rounded-[4px] bg-[color:var(--primary)] text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {savingSection === "vehicle" ? "Сохранение..." : "Сохранить"}
              </button>
            </div>
          </div>
        </ModalFrame>
      ) : null}
    </section>
  );
}

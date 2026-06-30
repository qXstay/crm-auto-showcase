"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import clsx from "clsx";
import { Plus, Search, X } from "lucide-react";
import {
  formatAuthPhoneDisplay,
  formatAuthPhoneInput,
  normalizeAuthPhoneInput,
} from "@/features/auth/storage";
import { fetchClientsStore } from "@/features/clients/repository";
import type { DemoClient } from "@/features/clients/types";
import { fetchStorageSettingsViaApi } from "@/features/settings-storage/repository";
import type { DemoStorageWarehouseRecord } from "@/features/settings-storage/types";
import {
  buildStorageCarLabel,
  buildStoragePlaceLabel,
  formatStorageDateLabel,
  matchesDemoStorageQuery,
  getNextDemoStorageNumber,
} from "@/features/storage/storage";
import type { DemoStorageItem } from "@/features/storage/types";
import {
  createStorageItemViaApi,
  fetchStorageStore,
  releaseStorageItemViaApi,
} from "@/features/storage/repository";

type StorageView = "in-stock" | "released";
type ReceiveFormState = {
  storageNumber: string;
  clientId: string;
  clientName: string;
  clientPhone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
  kitLabel: string;
  warehouseId: string;
  shelfLabel: string;
  cellLabel: string;
  note: string;
};

function statusClassName(status: string) {
  switch (status) {
    case "На хранении":
      return "text-[color:var(--primary)]";
    case "Готово к выдаче":
      return "text-amber-600";
    case "Выдано":
      return "text-emerald-600";
    default:
      return "text-[color:var(--muted)]";
  }
}

function StorageModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/28 px-3 py-3 sm:flex sm:items-center sm:justify-center sm:px-5 sm:py-6">
      <div className="w-full max-w-[760px] overflow-hidden border border-[color:var(--border)] bg-white shadow-[0_14px_36px_rgba(15,23,42,0.14)]">
        <div className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 flex-col sm:max-h-[calc(100dvh-3rem)]">
          <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-2.5">
            <h2 className="text-[15px] font-semibold text-[color:var(--foreground)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-8 w-8 items-center justify-center text-[color:var(--muted)]"
              aria-label="Закрыть окно"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 overflow-y-auto px-4 py-3.5">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function StoragePage() {
  const [view, setView] = useState<StorageView>("in-stock");
  const [searchValue, setSearchValue] = useState("");
  const [items, setItems] = useState<DemoStorageItem[]>([]);
  const [clients, setClients] = useState<DemoClient[]>([]);
  const [warehouses, setWarehouses] = useState<DemoStorageWarehouseRecord[]>([]);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [releaseItem, setReleaseItem] = useState<DemoStorageItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const [clientSearchTerm, setClientSearchTerm] = useState("");
  const filteredClients = useMemo(() => {
    if (!clientSearchTerm.trim()) return clients;
    const q = clientSearchTerm.trim().toLocaleLowerCase("ru-RU");
    return clients.filter((c) => {
      const nameMatch = c.name.toLocaleLowerCase("ru-RU").includes(q);
      const phoneMatch = normalizeAuthPhoneInput(c.phone).replace(/\s+/g, "").includes(q.replace(/\s+/g, ""));
      const plateMatch = c.vehicles?.some((v) => v.plateNumber.toLocaleLowerCase("ru-RU").includes(q)) ?? false;
      return nameMatch || phoneMatch || plateMatch;
    });
  }, [clients, clientSearchTerm]);
  const [form, setForm] = useState<ReceiveFormState>({
    storageNumber: "",
    clientId: "",
    clientName: "",
    clientPhone: "",
    carBrand: "",
    carModel: "",
    plateNumber: "",
    kitLabel: "",
    warehouseId: "",
    shelfLabel: "",
    cellLabel: "",
    note: "",
  });

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      fetchStorageStore(),
      fetchClientsStore(),
      fetchStorageSettingsViaApi(),
    ]).then(([itemsResult, clientsResult, settingsResult]) => {
      if (cancelled) {
        return;
      }

      setItems(itemsResult.status === "fulfilled" ? itemsResult.value.items : []);
      setClients(clientsResult.status === "fulfilled" ? clientsResult.value.clients : []);
      setWarehouses(
        settingsResult.status === "fulfilled" ? settingsResult.value.settings.warehouses : [],
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        view === "in-stock" ? item.status !== "Выдано" : item.status === "Выдано",
      ),
    [items, view],
  );
  const visibleItems = useMemo(
    () => filteredItems.filter((item) => matchesDemoStorageQuery(item, searchValue)),
    [filteredItems, searchValue],
  );
  const normalizedStorageNumber = form.storageNumber.trim().toLocaleLowerCase("ru-RU");
  const hasSelectedClient = form.clientId.trim().length > 0;
  const hasClientName = form.clientName.trim().length > 0;
  const hasClientPhone = normalizeAuthPhoneInput(form.clientPhone).length === 10;
  const storageNumberTaken = items.some(
    (item) => item.storageNumber.trim().toLocaleLowerCase("ru-RU") === normalizedStorageNumber,
  );
  const canSaveReceive =
    normalizedStorageNumber.length > 0 &&
    !storageNumberTaken &&
    (hasSelectedClient || (hasClientName && hasClientPhone)) &&
    form.kitLabel.trim().length > 0 &&
    form.warehouseId.trim().length > 0 &&
    form.shelfLabel.trim().length > 0 &&
    form.cellLabel.trim().length > 0;

  function openReceiveModal() {
    const defaultWarehouseId = warehouses[0]?.id ?? "";
    setActionError(null);

    setForm({
      storageNumber: getNextDemoStorageNumber(items),
      clientId: "",
      clientName: "",
      clientPhone: "",
      carBrand: "",
      carModel: "",
      plateNumber: "",
      kitLabel: "",
      warehouseId: defaultWarehouseId,
      shelfLabel: "",
      cellLabel: "",
      note: "",
    });
    setReceiveModalOpen(true);
  }

  function closeReceiveModal() {
    setActionError(null);
    setReceiveModalOpen(false);
  }

  function openReleaseModal(item: DemoStorageItem) {
    setActionError(null);
    setReleaseItem(item);
  }

  function closeReleaseModal() {
    setActionError(null);
    setReleaseItem(null);
  }

  function handleClientSelect(clientId: string) {
    setActionError(null);
    const client = clients.find((item) => item.id === clientId) ?? null;
    const vehicle = client?.vehicles[0] ?? null;

    setForm((current) => ({
      ...current,
      clientId,
      clientName: client?.name ?? "",
      clientPhone: client ? normalizeAuthPhoneInput(client.phone) : "",
      carBrand: vehicle?.brand ?? current.carBrand,
      carModel: vehicle?.model ?? current.carModel,
      plateNumber: vehicle?.plateNumber ?? current.plateNumber,
    }));
  }

  function updateForm<K extends keyof ReceiveFormState>(key: K, value: ReceiveFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]:
        key === "clientPhone"
          ? (normalizeAuthPhoneInput(value as string) as ReceiveFormState[K])
          : value,
    }));
  }

  async function handleReceiveSave() {
    if (!canSaveReceive) {
      return;
    }

    const warehouse = warehouses.find((item) => item.id === form.warehouseId) ?? null;
    setActionError(null);
    setIsMutating(true);

    try {
      const { item } = await createStorageItemViaApi({
        storageNumber: form.storageNumber,
        clientId: form.clientId || null,
        clientName: form.clientName.trim(),
        clientPhone: formatAuthPhoneDisplay(form.clientPhone),
        carBrand: form.carBrand,
        carModel: form.carModel,
        plateNumber: form.plateNumber,
        kitLabel: form.kitLabel,
        warehouseId: warehouse?.id ?? null,
        warehouseName: warehouse?.name ?? "Не указан",
        shelfLabel: form.shelfLabel,
        cellLabel: form.cellLabel,
        note: form.note,
      });

      setItems((current) => [item, ...current.filter((entry) => entry.id !== item.id)]);
      setReceiveModalOpen(false);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось принять позицию на хранение.",
      );
    } finally {
      setIsMutating(false);
    }
  }

  async function handleReleaseConfirm() {
    if (!releaseItem) {
      return;
    }

    setActionError(null);
    setIsMutating(true);

    try {
      const { item } = await releaseStorageItemViaApi(releaseItem.id);

      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? item : entry)),
      );
      setReleaseItem(null);
      setView("released");
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Не удалось выдать позицию из хранения.",
      );
    } finally {
      setIsMutating(false);
    }
  }

  return (
    <>
      <section className="w-full min-w-0 space-y-2">
        <div className="flex items-center gap-6 px-1 py-1 text-[16px]">
          <button
            type="button"
            onClick={() => setView("in-stock")}
            className={clsx(
              "font-medium",
              view === "in-stock"
                ? "text-[color:var(--primary)]"
                : "text-[color:var(--foreground)]",
            )}
          >
            На складе
          </button>
          <button
            type="button"
            onClick={() => setView("released")}
            className={clsx(
              "font-medium",
              view === "released"
                ? "text-[color:var(--primary)]"
                : "text-[color:var(--foreground)]",
            )}
          >
            Выданы
          </button>
        </div>

        <div className="border border-[color:var(--border)] bg-white">
          <div className="flex flex-col gap-2.5 border-b border-[color:var(--border)] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-[16px] font-medium text-[color:var(--foreground)]">
              {visibleItems.length} {view === "in-stock" ? "позиции на складе" : "позиций выдано"}
            </p>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center lg:w-auto lg:justify-end">
              <label className="relative w-full sm:flex-1 lg:w-[460px] xl:w-[560px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
                <input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Поиск по номеру хранения, гос. номеру, ФИО и телефону"
                  className="h-10 w-full border border-[color:var(--border)] bg-white pl-9 pr-3 text-[14px] text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted)]"
                />
              </label>
              {view === "in-stock" ? (
                <button
                  type="button"
                  onClick={openReceiveModal}
                  className="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  Принять
                </button>
              ) : null}
            </div>
          </div>

          <div className="divide-y divide-[color:var(--border)] lg:hidden">
            {visibleItems.map((item) => {
              const carLabel = buildStorageCarLabel(item);
              const placeLabel = buildStoragePlaceLabel(item);

              return (
                <div key={item.id} className="bg-white px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[15px] font-semibold leading-5 text-[color:var(--foreground)]">
                        {item.storageNumber}
                      </div>
                      <div className={clsx("mt-1 text-[13px] font-medium leading-5", statusClassName(item.status))}>
                        {item.status}
                      </div>
                    </div>
                    {view === "in-stock" ? (
                      <button
                        type="button"
                        onClick={() => openReleaseModal(item)}
                        className="inline-flex h-9 shrink-0 items-center justify-center border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)]"
                      >
                        Выдать
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-2.5 space-y-2 text-[13px] leading-5">
                    <div>
                      <div className="font-medium text-[color:var(--foreground)]">{item.kitLabel}</div>
                      <div className="text-[color:var(--muted)]">{item.note || "Без примечания"}</div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <div className="text-[color:var(--muted)]">Автомобиль</div>
                        <div className="mt-0.5 text-[color:var(--foreground)]">{carLabel}</div>
                        <div className="text-[color:var(--muted)]">
                          {item.plateNumber || "Госномер не указан"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[color:var(--muted)]">Клиент</div>
                        <div className="mt-0.5 text-[color:var(--foreground)]">{item.clientName}</div>
                        <div className="text-[color:var(--muted)]">
                          {item.clientPhone || "Телефон не указан"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[color:var(--muted)]">Склад / место</div>
                        <div className="mt-0.5 text-[color:var(--foreground)]">{placeLabel.primary}</div>
                        <div className="text-[color:var(--muted)]">{placeLabel.secondary}</div>
                      </div>
                      <div>
                        <div className="text-[color:var(--muted)]">
                          {view === "in-stock" ? "Дата приёма" : "Дата выдачи"}
                        </div>
                        <div className="mt-0.5 text-[color:var(--foreground)]">
                          {formatStorageDateLabel(
                            view === "in-stock" ? item.acceptedAt : item.releasedAt,
                          )}
                        </div>
                        <div className="text-[color:var(--muted)]">
                          Принят {formatStorageDateLabel(item.acceptedAt)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {visibleItems.length === 0 ? (
              <div className="px-4 py-12 text-center">
                <div className="text-[15px] text-[color:var(--muted)]">Нет данных</div>
                <div className="mt-1 text-[13px] text-[color:var(--muted)]">
                  {searchValue.trim()
                    ? "Попробуйте изменить строку поиска."
                    : view === "in-stock"
                      ? "Пока нет позиций на хранении."
                      : "История выдачи пока пуста."}
                </div>
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <div className="min-w-[1144px]">
              <div className="grid grid-cols-[78px_112px_minmax(160px,1fr)_170px_176px_172px_108px_80px] gap-x-2 border-b border-[color:var(--border)] px-4 py-2.5 text-[13px] leading-5 text-[color:var(--muted)]">
                <span>№</span>
                <span>Статус</span>
                <span>Наименование</span>
                <span>Автомобиль</span>
                <span>Клиент</span>
                <span>Склад / место</span>
                <span>{view === "in-stock" ? "Дата приёма" : "Дата выдачи"}</span>
                <span />
              </div>

              <div className="divide-y divide-[color:var(--border)]">
                {visibleItems.map((item) => {
                  const carLabel = buildStorageCarLabel(item);
                  const placeLabel = buildStoragePlaceLabel(item);

                  return (
                    <div
                      key={item.id}
                      className="grid grid-cols-[78px_112px_minmax(160px,1fr)_170px_176px_172px_108px_80px] items-start gap-x-2 px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                    >
                      <span className="font-medium">{item.storageNumber}</span>
                      <span className={clsx("font-medium", statusClassName(item.status))}>
                        {item.status}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.kitLabel}</span>
                        <span className="block truncate text-[13px] text-[color:var(--muted)]">
                          {item.note || "Без примечания"}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{carLabel}</span>
                        <span className="block truncate text-[13px] text-[color:var(--muted)]">
                          {item.plateNumber || "Госномер не указан"}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.clientName}</span>
                        <span className="block truncate text-[13px] text-[color:var(--muted)]">
                          {item.clientPhone || "Телефон не указан"}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{placeLabel.primary}</span>
                        <span className="block truncate text-[13px] text-[color:var(--muted)]">
                          {placeLabel.secondary}
                        </span>
                      </span>
                      <span>
                        <span className="block font-medium">
                          {formatStorageDateLabel(
                            view === "in-stock" ? item.acceptedAt : item.releasedAt,
                          )}
                        </span>
                        <span className="block text-[13px] text-[color:var(--muted)]">
                          {view === "in-stock"
                            ? `Принят ${formatStorageDateLabel(item.acceptedAt)}`
                            : `Принят ${formatStorageDateLabel(item.acceptedAt)}`}
                        </span>
                      </span>
                      <span className="flex justify-end pr-1">
                        {view === "in-stock" ? (
                          <button
                            type="button"
                            onClick={() => openReleaseModal(item)}
                            className="inline-flex h-9 items-center justify-center border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)]"
                          >
                            Выдать
                          </button>
                        ) : (
                          <span className="text-[13px] text-[color:var(--muted)]">—</span>
                        )}
                      </span>
                    </div>
                  );
                })}

                {visibleItems.length === 0 ? (
                  <div className="px-4 py-12 text-center">
                    <div className="text-[15px] text-[color:var(--muted)]">Нет данных</div>
                    <div className="mt-1 text-[13px] text-[color:var(--muted)]">
                      {searchValue.trim()
                        ? "Попробуйте изменить строку поиска."
                        : view === "in-stock"
                          ? "Пока нет позиций на хранении."
                          : "История выдачи пока пуста."}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {receiveModalOpen ? (
        <StorageModal title="Принять на хранение" onClose={closeReceiveModal}>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">
                Номер хранения <span className="text-[#b42318]">*</span>
              </span>
              <input
                value={form.storageNumber}
                onChange={(event) => updateForm("storageNumber", event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
              />
              {storageNumberTaken ? (
                <span className="text-[12px] text-rose-600">Такой номер хранения уже есть.</span>
              ) : null}
            </label>
            <div className="space-y-1">
              <input
                value={clientSearchTerm}
                onChange={(e) => setClientSearchTerm(e.target.value)}
                placeholder="Поиск клиента (ФИО, телефон, гос. номер)"
                className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] outline-none"
              />
            </div>
            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">
                Клиент из базы
              </span>
              <select
                value={form.clientId}
                onChange={(event) => handleClientSelect(event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] outline-none"
              >
                <option value="">Выбрать клиента</option>
                {filteredClients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">
                Клиент {!hasSelectedClient ? <span className="text-[#b42318]">*</span> : null}
              </span>
              <input
                value={form.clientName}
                onChange={(event) => updateForm("clientName", event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
                placeholder="ФИО клиента"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">
                Телефон {!hasSelectedClient ? <span className="text-[#b42318]">*</span> : null}
              </span>
              <div className="flex h-9 items-center border border-[color:var(--border)] bg-white px-3">
                <span className="mr-2 shrink-0 text-[color:var(--muted)]">+7</span>
                <input
                  value={formatAuthPhoneInput(form.clientPhone)}
                  onChange={(event) => updateForm("clientPhone", event.target.value)}
                  className="w-full bg-transparent text-[13px] text-[color:var(--foreground)] outline-none"
                  placeholder="900 123-45-67"
                />
              </div>
            </label>

            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">Марка</span>
              <input
                value={form.carBrand}
                onChange={(event) => updateForm("carBrand", event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
                placeholder="Например, BMW"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">Модель</span>
              <input
                value={form.carModel}
                onChange={(event) => updateForm("carModel", event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
                placeholder="Например, 3 серии"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">Госномер</span>
              <input
                value={form.plateNumber}
                onChange={(event) => updateForm("plateNumber", event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
                placeholder="Например, О313АА 196"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">
                Наименование позиции <span className="text-[#b42318]">*</span>
              </span>
              <input
                value={form.kitLabel}
                onChange={(event) => updateForm("kitLabel", event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
                placeholder="Например, Комплект колёс BMW R17"
              />
            </label>

            <label className="space-y-1">
              <span className="text-[12px] text-[color:var(--muted)]">
                Склад <span className="text-[#b42318]">*</span>
              </span>
              <select
                value={form.warehouseId}
                onChange={(event) => updateForm("warehouseId", event.target.value)}
                className="h-9 w-full border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] outline-none"
              >
                <option value="">Выбрать склад</option>
                {warehouses.map((warehouse) => (
                  <option key={warehouse.id} value={warehouse.id}>
                    {warehouse.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-[12px] text-[color:var(--muted)]">
                  Стеллаж <span className="text-[#b42318]">*</span>
                </span>
                <input
                  value={form.shelfLabel}
                  onChange={(event) => updateForm("shelfLabel", event.target.value)}
                  className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
                  placeholder="2"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[12px] text-[color:var(--muted)]">
                  Ячейка <span className="text-[#b42318]">*</span>
                </span>
                <input
                  value={form.cellLabel}
                  onChange={(event) => updateForm("cellLabel", event.target.value)}
                  className="h-9 w-full border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)] outline-none"
                  placeholder="4"
                />
              </label>
            </div>

            <label className="space-y-1 sm:col-span-2">
              <span className="text-[12px] text-[color:var(--muted)]">Примечание</span>
              <textarea
                value={form.note}
                onChange={(event) => updateForm("note", event.target.value)}
                className="min-h-16 w-full border border-[color:var(--border)] px-3 py-2 text-[13px] text-[color:var(--foreground)] outline-none"
                placeholder="Например, хранение до осени"
              />
            </label>
          </div>

          <div className="mt-2 text-[12px] leading-5 text-[color:var(--muted)]">
            <span className="text-[#b42318]">*</span> Обязательные поля
          </div>

          {actionError ? (
            <div className="mt-3 text-[13px] leading-5 text-[#b42318]">{actionError}</div>
          ) : null}

          <div className="mt-3 flex flex-col-reverse gap-2 border-t border-[color:var(--border)] pt-2.5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={closeReceiveModal}
              disabled={isMutating}
              className="inline-flex h-9 items-center justify-center border border-[color:var(--border)] bg-white px-4 text-[13px] text-[color:var(--foreground)]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleReceiveSave}
              disabled={!canSaveReceive || isMutating}
              className="inline-flex h-9 items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Сохранить
            </button>
          </div>
        </StorageModal>
      ) : null}

      {releaseItem ? (
        <StorageModal title="Выдать из хранения" onClose={closeReleaseModal}>
          <div className="space-y-3 text-[13px] leading-5 text-[color:var(--foreground)]">
            <p>
              Подтвердите выдачу позиции <span className="font-medium">{releaseItem.storageNumber}</span>.
            </p>
            <div className="grid gap-3 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-3 sm:grid-cols-2">
              <div>
                <div className="text-[12px] text-[color:var(--muted)]">Клиент</div>
                <div className="font-medium">{releaseItem.clientName}</div>
              </div>
              <div>
                <div className="text-[12px] text-[color:var(--muted)]">Автомобиль</div>
                <div className="font-medium">{buildStorageCarLabel(releaseItem)}</div>
              </div>
              <div>
                <div className="text-[12px] text-[color:var(--muted)]">Наименование</div>
                <div className="font-medium">{releaseItem.kitLabel}</div>
              </div>
              <div>
                <div className="text-[12px] text-[color:var(--muted)]">Место</div>
                <div className="font-medium">
                  {buildStoragePlaceLabel(releaseItem).primary}
                  <span className="text-[color:var(--muted)]">
                    {" "}
                    · {buildStoragePlaceLabel(releaseItem).secondary}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {actionError ? (
            <div className="mt-3 text-[13px] leading-5 text-[#b42318]">{actionError}</div>
          ) : null}

          <div className="mt-3 flex flex-col-reverse gap-2 border-t border-[color:var(--border)] pt-2.5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={closeReleaseModal}
              disabled={isMutating}
              className="inline-flex h-9 items-center justify-center border border-[color:var(--border)] bg-white px-4 text-[13px] text-[color:var(--foreground)]"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleReleaseConfirm}
              disabled={isMutating}
              className="inline-flex h-9 items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[13px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              Подтвердить выдачу
            </button>
          </div>
        </StorageModal>
      ) : null}
    </>
  );
}

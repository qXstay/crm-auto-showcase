"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import {
  formatWarehouseMeta,
  sanitizeWarehouseName,
} from "@/features/settings-storage/storage";
import {
  fetchStorageSettingsViaApi,
  saveStorageSettingsViaApi,
} from "@/features/settings-storage/repository";
import type {
  DemoStorageSettingsStore,
  DemoStorageWarehouseRecord,
} from "@/features/settings-storage/types";

type WarehouseModalState = {
  open: boolean;
  mode: "create" | "edit";
  warehouseId: string | null;
  name: string;
  shelvesCount: string;
  cellsCount: string;
  touched: boolean;
};

const CLOSED_MODAL: WarehouseModalState = {
  open: false,
  mode: "create",
  warehouseId: null,
  name: "",
  shelvesCount: "",
  cellsCount: "",
  touched: false,
};

function parsePositiveInteger(value: string) {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    return null;
  }

  const parsedValue = Number(trimmedValue);

  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    return null;
  }

  return parsedValue;
}

export default function StorageSettingsPage() {
  const [store, setStore] = useState<DemoStorageSettingsStore | null>(null);
  const [modal, setModal] = useState<WarehouseModalState>(CLOSED_MODAL);
  const [notice, setNotice] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const saveStateTimeoutRef = useRef<number | null>(null);
  const warehouses = useMemo(() => store?.warehouses ?? [], [store]);

  const trimmedName = sanitizeWarehouseName(modal.name);
  const shelvesCountValue = parsePositiveInteger(modal.shelvesCount);
  const cellsCountValue = parsePositiveInteger(modal.cellsCount);

  const hasDuplicateName = useMemo(
    () =>
      warehouses.some(
        (warehouse) =>
          warehouse.id !== modal.warehouseId &&
          sanitizeWarehouseName(warehouse.name).toLocaleLowerCase("ru-RU") ===
            trimmedName.toLocaleLowerCase("ru-RU"),
      ),
    [modal.warehouseId, trimmedName, warehouses],
  );

  const canSaveWarehouse =
    trimmedName.length > 0 &&
    shelvesCountValue !== null &&
    cellsCountValue !== null &&
    !hasDuplicateName;

  useEffect(() => {
    let cancelled = false;

    fetchStorageSettingsViaApi()
      .then(({ settings }) => {
        if (cancelled) {
          return;
        }

        setStore(settings);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setLoadError(
          error instanceof Error ? error.message : "Не удалось загрузить настройки складов.",
        );
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
      if (saveStateTimeoutRef.current) {
        window.clearTimeout(saveStateTimeoutRef.current);
      }
    };
  }, []);

  function clearSaveFeedback() {
    if (saveStateTimeoutRef.current) {
      window.clearTimeout(saveStateTimeoutRef.current);
      saveStateTimeoutRef.current = null;
    }

    if (saveState !== "idle") {
      setSaveState("idle");
    }
  }

  async function persistStore(nextStore: DemoStorageSettingsStore) {
    clearSaveFeedback();
    setSaveState("saving");
    setNotice(null);

    try {
      const { settings } = await saveStorageSettingsViaApi(nextStore);
      setStore(settings);
      setSaveState("saved");
      saveStateTimeoutRef.current = window.setTimeout(() => {
        setSaveState("idle");
        saveStateTimeoutRef.current = null;
      }, 1600);
      return true;
    } catch (error) {
      setSaveState("failed");
      setNotice(
        error instanceof Error ? error.message : "Не удалось сохранить настройки складов.",
      );
      return false;
    }
  }

  function openCreateModal() {
    setNotice(null);
    setModal({
      open: true,
      mode: "create",
      warehouseId: null,
      name: "",
      shelvesCount: "",
      cellsCount: "",
      touched: false,
    });
  }

  function openEditModal(warehouse: DemoStorageWarehouseRecord) {
    setNotice(null);
    setModal({
      open: true,
      mode: "edit",
      warehouseId: warehouse.id,
      name: warehouse.name,
      shelvesCount: String(warehouse.shelvesCount),
      cellsCount: String(warehouse.cellsCount),
      touched: false,
    });
  }

  function closeModal() {
    setModal(CLOSED_MODAL);
  }

  async function saveWarehouse() {
    if (!store || !canSaveWarehouse || shelvesCountValue === null || cellsCountValue === null) {
      setModal((current) => ({ ...current, touched: true }));
      return;
    }

    const timestamp = new Date().toISOString();

    if (modal.mode === "edit" && modal.warehouseId) {
      const saved = await persistStore({
        warehouses: store.warehouses.map((warehouse) =>
          warehouse.id === modal.warehouseId
            ? {
                ...warehouse,
                name: trimmedName,
                shelvesCount: shelvesCountValue,
                cellsCount: cellsCountValue,
                updatedAt: timestamp,
              }
            : warehouse,
        ),
      });
      if (saved) {
        closeModal();
      }
    } else {
      const saved = await persistStore({
        warehouses: [
          ...store.warehouses,
          {
            id: `warehouse-${Date.now()}`,
            name: trimmedName,
            shelvesCount: shelvesCountValue,
            cellsCount: cellsCountValue,
            protected: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          },
        ],
      });
      if (saved) {
        closeModal();
      }
    }
  }

  async function deleteWarehouse(warehouse: DemoStorageWarehouseRecord) {
    if (!store) {
      return;
    }

    if (warehouse.protected) {
      setNotice("Базовый склад нельзя удалить.");
      return;
    }

    const saved = await persistStore({
      warehouses: store.warehouses.filter((item) => item.id !== warehouse.id),
    });
    if (saved) {
      setNotice(null);
    }
  }

  return (
    <>
      <section className="max-w-[1220px] space-y-4">
        <div className="max-w-[1120px] bg-white">
          <SettingsSectionsTabs activeSection="Хранение" />
        </div>

        <div className="max-w-[620px] px-4 pt-2">
          {!isLoaded ? (
            <div className="border border-[color:var(--border)] bg-white px-4 py-4 text-[14px] leading-5 text-[color:var(--muted)]">
              Загружаем настройки складов...
            </div>
          ) : null}

          {loadError ? (
            <div className="border border-[#e7c7c0] bg-[#fff7f5] px-4 py-4 text-[14px] leading-5 text-[#b45444]">
              {loadError}
            </div>
          ) : null}

          <div className="space-y-1">
            {warehouses.map((warehouse) => (
              <div
                key={warehouse.id}
                className="flex min-h-11 items-center justify-between gap-4 border-b border-[color:var(--border)] py-2 text-[15px]"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[16px] text-[color:var(--foreground)]">
                    {warehouse.name}
                  </span>
                  <span className="text-[13px] text-[color:var(--muted)]">
                    {formatWarehouseMeta(
                      warehouse.shelvesCount,
                      warehouse.cellsCount,
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center"
                    aria-label={`Редактировать склад ${warehouse.name}`}
                    onClick={() => openEditModal(warehouse)}
                    disabled={!isLoaded || saveState === "saving"}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center"
                    aria-label={`Удалить склад ${warehouse.name}`}
                    onClick={() => {
                      void deleteWarehouse(warehouse);
                    }}
                    disabled={!isLoaded || saveState === "saving"}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {notice ? (
            <div className="mt-3 text-[13px] text-[#9a5b16]">{notice}</div>
          ) : null}

          {saveState === "saving" ? (
            <div className="mt-3 text-[13px] text-[color:var(--muted)]">Сохраняем...</div>
          ) : null}
          {saveState === "saved" ? (
            <div className="mt-3 text-[13px] text-[color:var(--primary)]">Сохранено</div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-[4px] border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white"
              onClick={openCreateModal}
              disabled={!isLoaded || Boolean(loadError) || saveState === "saving"}
            >
              Добавить склад
            </button>
          </div>
        </div>
      </section>

      {modal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-[520px] border border-[color:var(--border)] bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[24px] font-medium leading-7 text-[color:var(--foreground)]">
                {modal.mode === "edit" ? "Редактирование склада" : "Новый склад"}
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center text-[color:var(--muted)]"
                onClick={closeModal}
                aria-label="Закрыть"
                disabled={saveState === "saving"}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="space-y-2">
                <span className="block text-[16px] font-medium leading-6">
                  Введите название склада
                  {modal.mode === "create" ? (
                    <span className="ml-2 text-[13px] font-normal text-[color:var(--muted)]">
                      обязательно
                    </span>
                  ) : null}
                </span>
                <input
                  value={modal.name}
                  onChange={(event) =>
                    setModal((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="h-12 w-full border border-[color:var(--border)] px-4 text-[16px] outline-none"
                  disabled={saveState === "saving"}
                />
              </label>

              <label className="space-y-2">
                <span className="block text-[16px] font-medium leading-6">
                  Количество стеллажей
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={modal.shelvesCount}
                  onChange={(event) =>
                    setModal((current) => ({
                      ...current,
                      shelvesCount: event.target.value,
                    }))
                  }
                  className="h-12 w-full border border-[color:var(--border)] px-4 text-[16px] outline-none"
                  disabled={saveState === "saving"}
                />
              </label>

              <label className="space-y-2">
                <span className="block text-[16px] font-medium leading-6">
                  Количество ячеек
                </span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={modal.cellsCount}
                  onChange={(event) =>
                    setModal((current) => ({
                      ...current,
                      cellsCount: event.target.value,
                    }))
                  }
                  className="h-12 w-full border border-[color:var(--border)] px-4 text-[16px] outline-none"
                  disabled={saveState === "saving"}
                />
              </label>

              {modal.touched && !canSaveWarehouse ? (
                <div className="text-[13px] leading-5 text-[#b45309]">
                  {trimmedName.length === 0
                    ? "Укажите название склада."
                    : hasDuplicateName
                      ? "Склад с таким названием уже есть."
                      : "Укажите корректное количество стеллажей и ячеек."}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="inline-flex h-11 items-center border border-[color:var(--border)] bg-white px-6 text-[15px]"
                onClick={closeModal}
                disabled={saveState === "saving"}
              >
                Отмена
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-6 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  void saveWarehouse();
                }}
                disabled={!canSaveWarehouse || saveState === "saving"}
              >
                {saveState === "saving" ? "Сохраняем..." : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

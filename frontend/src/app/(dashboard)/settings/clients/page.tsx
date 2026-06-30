"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import {
  createInitialClientSourcesStore,
  formatClientCount,
  normalizeClientSourceName,
  sanitizeClientSourceName,
} from "@/features/settings-client-sources/defaults";
import type {
  DemoClientSourceRecord,
  DemoClientSourcesStore,
} from "@/features/settings-client-sources/types";
import {
  fetchClientSourceSettingsViaApi,
  saveClientSourceSettingsViaApi,
} from "@/features/settings-client-sources/repository";

type SourceModalState = {
  open: boolean;
  mode: "create" | "edit";
  sourceId: string | null;
  name: string;
  touched: boolean;
};

const CLOSED_MODAL: SourceModalState = {
  open: false,
  mode: "create",
  sourceId: null,
  name: "",
  touched: false,
};

export default function ClientSourcesSettingsPage() {
  const [store, setStore] = useState<DemoClientSourcesStore>(() =>
    createInitialClientSourcesStore(),
  );
  const [usageCounts, setUsageCounts] = useState<Record<string, number>>({});
  const [modal, setModal] = useState<SourceModalState>(CLOSED_MODAL);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void fetchClientSourceSettingsViaApi()
      .then((response) => {
        setStore(response.settings);
        setUsageCounts(response.usageCounts);
      })
      .catch((error) =>
        setNotice(error instanceof Error ? error.message : "Не удалось загрузить источники клиентов."),
      );
  }, []);

  const sourcesWithCounts = useMemo(
    () =>
      store.sources.map((source) => ({
        ...source,
        clientsCount: usageCounts[source.id] ?? 0,
      })),
    [store, usageCounts],
  );

  const trimmedSourceName = sanitizeClientSourceName(modal.name);
  const normalizedSourceName = normalizeClientSourceName(modal.name);
  const hasDuplicateSource = sourcesWithCounts.some(
    (source) =>
      source.id !== modal.sourceId &&
      normalizeClientSourceName(source.name) === normalizedSourceName,
  );
  const canSaveSource = trimmedSourceName.length > 0 && !hasDuplicateSource;

  async function persistStore(nextStore: DemoClientSourcesStore) {
    const response = await saveClientSourceSettingsViaApi(nextStore);
    setStore(response.settings);
    setUsageCounts(response.usageCounts);
  }

  function openCreateModal() {
    setNotice(null);
    setModal({
      open: true,
      mode: "create",
      sourceId: null,
      name: "",
      touched: false,
    });
  }

  function openEditModal(source: DemoClientSourceRecord) {
    setNotice(null);
    setModal({
      open: true,
      mode: "edit",
      sourceId: source.id,
      name: source.name,
      touched: false,
    });
  }

  function closeModal() {
    setModal(CLOSED_MODAL);
  }

  async function saveSource() {
    if (!canSaveSource) {
      setModal((current) => ({ ...current, touched: true }));
      return;
    }

    const timestamp = new Date().toISOString();

    if (modal.mode === "edit" && modal.sourceId) {
      try {
        await persistStore({
          sources: store.sources.map((source) =>
            source.id === modal.sourceId
              ? {
                  ...source,
                  name: trimmedSourceName,
                  updatedAt: timestamp,
                }
              : source,
          ),
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Не удалось сохранить источник.");
        return;
      }
    } else {
      try {
        await persistStore({
          sources: [
            ...store.sources,
            {
              id: `client-source-${Date.now()}`,
              name: trimmedSourceName,
              protected: false,
              createdAt: timestamp,
              updatedAt: timestamp,
            },
          ],
        });
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "Не удалось сохранить источник.");
        return;
      }
    }

    setNotice(null);
    closeModal();
  }

  async function deleteSource(source: DemoClientSourceRecord, clientsCount: number) {
    if (source.protected) {
      setNotice("Базовый источник пока нельзя удалить из настроек.");
      return;
    }

    if (clientsCount > 0) {
      setNotice("Источник нельзя удалить, пока он используется клиентами.");
      return;
    }

    try {
      await persistStore({
        sources: store.sources.filter((item) => item.id !== source.id),
      });
      setNotice(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Не удалось удалить источник.");
    }
  }

  return (
    <>
      <section className="max-w-[1220px] space-y-4">
        <div className="max-w-[1120px] bg-white">
          <SettingsSectionsTabs activeSection="Клиенты" />
        </div>

        <div className="max-w-[560px] px-4 pt-2">
          <div className="text-[16px] font-medium text-[color:var(--foreground)]">
            Источники клиентов
          </div>

          <div className="mt-3 space-y-1">
            {sourcesWithCounts.map((source) => (
              <div
                key={source.id}
                className="flex min-h-11 items-center justify-between gap-4 border-b border-[color:var(--border)] py-2 text-[15px]"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[16px] text-[color:var(--foreground)]">
                    {source.name}
                  </span>
                  <span className="text-[13px] text-[color:var(--muted)]">
                    {formatClientCount(source.clientsCount)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center"
                    aria-label={`Редактировать источник ${source.name}`}
                    onClick={() => openEditModal(source)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center"
                    aria-label={`Удалить источник ${source.name}`}
                    onClick={() => deleteSource(source, source.clientsCount)}
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

          <div className="mt-4">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-[4px] border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white"
              onClick={openCreateModal}
            >
              Добавить новый источник
            </button>
          </div>
        </div>
      </section>

      {modal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-[420px] border border-[color:var(--border)] bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[20px] font-medium text-[color:var(--foreground)]">
                {modal.mode === "edit"
                  ? "Редактирование источника клиента"
                  : "Новый источник клиента"}
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center text-[color:var(--muted)]"
                onClick={closeModal}
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-2">
              <label className="space-y-1.5">
                <span className="block text-[14px] font-medium">
                  Название
                  {modal.mode === "create" ? (
                    <span className="ml-2 text-[12px] text-[color:var(--muted)]">
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
                  className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none"
                  placeholder={
                    modal.mode === "create" ? "Введите название" : undefined
                  }
                />
              </label>

              {modal.touched && !canSaveSource ? (
                <div className="text-[12px] text-[#b45309]">
                  {trimmedSourceName.length === 0
                    ? "Укажите название источника."
                    : "Источник с таким названием уже есть."}
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center border border-[color:var(--border)] bg-white px-5 text-[14px]"
                onClick={closeModal}
              >
                Отмена
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={saveSource}
                disabled={!canSaveSource}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

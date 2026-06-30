"use client";

import { startTransition, useEffect, useState } from "react";
import { X } from "lucide-react";
import { RADII, VEHICLE_TYPES } from "@/features/pricing/config";
import {
  cloneService,
  createEmptyPriceMatrix,
  getDefaultModifierMatrix,
  PRICE_TYPE_OPTIONS,
  SALARY_RULE_OPTIONS,
  SERVICE_TYPE_OPTIONS,
} from "@/features/services-admin/mock-data";
import type { ServicesAdminService } from "@/features/services-admin/types";

type ServiceEditModalProps = {
  open: boolean;
  initialService: ServicesAdminService | null;
  isSaving?: boolean;
  saveError?: string | null;
  onClose: () => void;
  onSave: (service: ServicesAdminService) => void;
};

type ModifierType = "low_profile" | "runflat";

type ConfirmDialogState =
  | { kind: "close_unsaved" }
  | { kind: "clear_modifier"; modifierType: ModifierType }
  | { kind: "restore_modifier"; modifierType: ModifierType };

function createDraftService(): ServicesAdminService {
  return {
    id: "",
    categoryId: "",
    name: "",
    serviceType: "base",
    pricingMode: "service",
    priceType: "matrix",
    fixedPrice: 0,
    priceFrom: 0,
    matrixPrices: createEmptyPriceMatrix(),
    modifierMatrixPrices: {},
    modifierEnabled: {
      low_profile: false,
      runflat: false,
    },
    modifierExplicitlyCleared: {
      low_profile: false,
      runflat: false,
    },
    displayPriceLabel: "",
    displayPriceLabelOverride: undefined,
    priceBands: [],
    salaryRuleType: "percent_of_work",
    salaryPercent: 35,
    salaryFixedAmount: 0,
    salaryPerUnitAmount: 0,
    usesCostPrice: false,
    costPrice: 0,
    reducedEmployeePercentEnabled: false,
    reducedEmployeePercentValue: 30,
  };
}

function parseNumberInput(value: string) {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function getModifierLabel(modifierType: ModifierType) {
  return modifierType === "low_profile" ? "Низкий профиль" : "RunFlat";
}

function getServiceValidationMessage(service: ServicesAdminService) {
  if (
    service.salaryRuleType === "percent_of_work" &&
    service.reducedEmployeePercentEnabled &&
    (service.reducedEmployeePercentValue <= 0 ||
      service.reducedEmployeePercentValue > service.salaryPercent)
  ) {
    return "Пониженный процент должен быть больше 0 и не выше основного процента.";
  }

  return null;
}

type MatrixEditorProps = {
  matrix: ServicesAdminService["matrixPrices"];
  onChange: (
    radius: (typeof RADII)[number],
    vehicleTypeId: (typeof VEHICLE_TYPES)[number]["id"],
    value: number,
  ) => void;
};

function PriceMatrixEditor({ matrix, onChange }: MatrixEditorProps) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[820px] space-y-3">
        <div className="grid grid-cols-[86px_repeat(4,minmax(0,1fr))] gap-3 text-[13px] text-[color:var(--muted)]">
          <span>Диаметр</span>
          <span>Легковой</span>
          <span>SUV</span>
          <span>Внедорожник</span>
          <span>Коммерческий</span>
        </div>
        {RADII.map((radius) => (
          <div
            key={radius}
            className="grid grid-cols-[86px_repeat(4,minmax(0,1fr))] gap-3"
          >
            <div className="flex items-center text-[14px] font-medium text-[color:var(--foreground)]">
              {radius}
            </div>
            {VEHICLE_TYPES.map((vehicleType) => (
              <input
                key={`${radius}-${vehicleType.id}`}
                value={matrix[radius][vehicleType.id]}
                onChange={(event) =>
                  onChange(
                    radius,
                    vehicleType.id,
                    parseNumberInput(event.target.value),
                  )
                }
                className="h-10 border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function getComparableServiceDraft(service: ServicesAdminService) {
  return JSON.stringify(cloneService(service));
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30 px-4 py-6">
      <div className="w-full max-w-[420px] border border-[color:var(--border)] bg-white">
        <div className="border-b border-[color:var(--border)] px-5 py-4 text-[16px] font-medium text-[color:var(--foreground)]">
          {title}
        </div>
        <div className="px-5 py-4 text-[13px] leading-6 text-[color:var(--muted)]">
          {description}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-[color:var(--border)] px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="h-10 border border-[color:var(--border)] bg-white px-4 text-[13px] text-[color:var(--foreground)]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-10 border border-rose-600 bg-rose-600 px-4 text-[13px] font-medium text-white"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ServiceEditModal({
  open,
  initialService,
  isSaving,
  saveError,
  onClose,
  onSave,
}: ServiceEditModalProps) {
  const [service, setService] = useState<ServicesAdminService>(createDraftService());
  const [initialDraftSnapshot, setInitialDraftSnapshot] = useState("");
  const [confirmState, setConfirmState] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    startTransition(() => {
      if (initialService) {
        const nextService = cloneService(initialService);
        setService(nextService);
        setInitialDraftSnapshot(getComparableServiceDraft(nextService));
        return;
      }

      const nextService = createDraftService();
      setService(nextService);
      setInitialDraftSnapshot(getComparableServiceDraft(nextService));
    });
  }, [initialService, open]);

  const isDirty = getComparableServiceDraft(service) !== initialDraftSnapshot;
  const validationMessage = getServiceValidationMessage(service);
  const usesCostPriceForStage1Profit = service.salaryRuleType === "percent_of_profit";
  const usesReducedPercentForPercentOfWork = service.salaryRuleType === "percent_of_work";

  function handleRequestClose() {
    if (isDirty) {
      setConfirmState({ kind: "close_unsaved" });
      return;
    }

    onClose();
  }

  function handleResetModifierMatrix(modifierType: ModifierType) {
    setConfirmState({ kind: "clear_modifier", modifierType });
  }

  function handleRestoreModifierMatrix(modifierType: ModifierType) {
    setConfirmState({ kind: "restore_modifier", modifierType });
  }

  function handleConfirmAction() {
    if (!confirmState) {
      return;
    }

    if (confirmState.kind === "close_unsaved") {
      setConfirmState(null);
      onClose();
      return;
    }

    if (confirmState.kind === "restore_modifier") {
      const defaultMatrix = getDefaultModifierMatrix(service.id, confirmState.modifierType);

      if (!defaultMatrix) {
        setConfirmState(null);
        return;
      }

      setService((current) => ({
        ...current,
        modifierMatrixPrices: {
          ...current.modifierMatrixPrices,
          [confirmState.modifierType]: defaultMatrix,
        },
        modifierExplicitlyCleared: {
          ...current.modifierExplicitlyCleared,
          [confirmState.modifierType]: false,
        },
      }));
      setConfirmState(null);
      return;
    }

    setService((current) => ({
      ...current,
      modifierMatrixPrices: {
        ...current.modifierMatrixPrices,
        [confirmState.modifierType]: createEmptyPriceMatrix(),
      },
      modifierExplicitlyCleared: {
        ...current.modifierExplicitlyCleared,
        [confirmState.modifierType]: true,
      },
    }));

    setConfirmState(null);
  }

  if (!open) {
    return null;
  }

  const confirmTitle =
    confirmState?.kind === "close_unsaved"
      ? "Закрыть без сохранения?"
      : confirmState?.kind === "restore_modifier"
        ? `Восстановить "${getModifierLabel(confirmState.modifierType)}" по умолчанию?`
        : confirmState
        ? `Очистить цены для "${getModifierLabel(confirmState.modifierType)}"?`
        : "";

  const confirmDescription =
    confirmState?.kind === "close_unsaved"
      ? "Изменения в этой услуге не будут сохранены. Если вы закрываете окно случайно, вернитесь назад и нажмите «Сохранить»."
      : confirmState?.kind === "restore_modifier"
        ? `Будут восстановлены исходные цены заказчика для модификатора "${getModifierLabel(confirmState.modifierType)}". Текущие значения этого модификатора будут заменены значениями по умолчанию.`
        : confirmState
        ? `Будут очищены все цены для модификатора "${getModifierLabel(confirmState.modifierType)}". После подтверждения матрица станет пустой. Если этот модификатор должен участвовать в расчёте, цены нужно будет заполнить заново.`
        : "";

  const confirmLabel =
    confirmState?.kind === "close_unsaved"
      ? "Закрыть без сохранения"
      : confirmState?.kind === "restore_modifier"
        ? "Восстановить значения"
        : "Очистить матрицу";

  return (
    <div className="fixed inset-0 z-50 overflow-x-hidden bg-black/40 p-3 sm:flex sm:items-center sm:justify-center">
      <div className="flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full min-w-0 max-w-[1080px] flex-col overflow-hidden border border-[color:var(--border)] bg-white sm:max-h-[92vh]">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-[17px] font-semibold text-[color:var(--foreground)]">
            Редактирование услуги
          </h2>
          <button
            type="button"
            onClick={handleRequestClose}
            className="rounded-md p-1.5 text-[color:var(--muted)] transition-colors hover:bg-slate-100 hover:text-[color:var(--foreground)]"
            aria-label="Закрыть"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4.5 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-5 sm:py-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                Тип услуги
              </span>
              <select
                value={service.serviceType}
                onChange={(event) =>
                  setService((current) => ({
                    ...current,
                    serviceType: event.target.value as ServicesAdminService["serviceType"],
                  }))
                }
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              >
                {SERVICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1.5">
              <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                Тип цены
              </span>
              <select
                value={service.priceType}
                onChange={(event) =>
                  setService((current) => ({
                    ...current,
                    priceType: event.target.value as ServicesAdminService["priceType"],
                  }))
                }
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              >
                {PRICE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="space-y-1.5">
            <span className="text-[14px] font-medium text-[color:var(--foreground)]">
              Название услуги
            </span>
            <input
              value={service.name}
              onChange={(event) =>
                setService((current) => ({
                  ...current,
                  name: event.target.value,
                }))
              }
              className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
            />
          </label>

          {service.priceType === "matrix" ? (
            <div className="space-y-2">
              <PriceMatrixEditor
                matrix={service.matrixPrices}
                onChange={(radius, vehicleTypeId, value) =>
                  setService((current) => ({
                    ...current,
                    matrixPrices: {
                      ...current.matrixPrices,
                      [radius]: {
                        ...current.matrixPrices[radius],
                        [vehicleTypeId]: value,
                      },
                    },
                  }))
                }
              />

              <div className="space-y-4 border-t border-[color:var(--border)] pt-4">
                <div className="text-[14px] font-medium text-[color:var(--foreground)]">
                  Модификаторы матрицы
                </div>

                {[
                  { id: "low_profile" as const, label: "Низкий профиль" },
                  { id: "runflat" as const, label: "RunFlat" },
                ].map((modifier) => {
                  const modifierMatrix = service.modifierMatrixPrices[modifier.id];
                  const hasDefaultModifierMatrix = Boolean(
                    getDefaultModifierMatrix(service.id, modifier.id),
                  );

                  return (
                    <div key={modifier.id} className="space-y-2.5 border border-[color:var(--border)] p-3">
                      <div className="flex flex-col gap-3 text-[14px] text-[color:var(--foreground)] sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-2">
                          <input
                            id={`modifier-${modifier.id}`}
                            type="checkbox"
                            checked={service.modifierEnabled[modifier.id]}
                            onChange={(event) => {
                              const checked = event.target.checked;

                              setService((current) => ({
                                ...current,
                                modifierEnabled: {
                                  ...current.modifierEnabled,
                                  [modifier.id]: checked,
                                },
                                modifierExplicitlyCleared:
                                  checked && !current.modifierMatrixPrices[modifier.id]
                                    ? {
                                        ...current.modifierExplicitlyCleared,
                                        [modifier.id]: false,
                                      }
                                    : current.modifierExplicitlyCleared,
                                modifierMatrixPrices:
                                  checked && !current.modifierMatrixPrices[modifier.id]
                                    ? {
                                        ...current.modifierMatrixPrices,
                                        [modifier.id]: createEmptyPriceMatrix(),
                                      }
                                    : current.modifierMatrixPrices,
                              }));
                            }}
                          />
                          <label
                            htmlFor={`modifier-${modifier.id}`}
                            className="cursor-pointer select-none"
                          >
                            {modifier.label}
                          </label>
                        </div>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          {hasDefaultModifierMatrix ? (
                            <button
                              type="button"
                              onClick={() => handleRestoreModifierMatrix(modifier.id)}
                              className="border border-[color:var(--border)] px-3 py-2 text-[13px] text-[color:var(--foreground)]"
                            >
                              Восстановить значения
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => handleResetModifierMatrix(modifier.id)}
                            disabled={!modifierMatrix}
                            className="border border-[color:var(--border)] px-3 py-2 text-[13px] text-[color:var(--foreground)] disabled:bg-[color:var(--background)] disabled:text-[color:var(--muted)]"
                          >
                            Очистить матрицу
                          </button>
                        </div>
                      </div>

                      {service.modifierEnabled[modifier.id] && modifierMatrix ? (
                        <PriceMatrixEditor
                          matrix={modifierMatrix}
                          onChange={(radius, vehicleTypeId, value) =>
                            setService((current) => ({
                              ...current,
                              modifierMatrixPrices: {
                                ...current.modifierMatrixPrices,
                                [modifier.id]: {
                                  ...(current.modifierMatrixPrices[modifier.id] ??
                                    createEmptyPriceMatrix()),
                                  [radius]: {
                                    ...(current.modifierMatrixPrices[modifier.id]?.[radius] ??
                                      createEmptyPriceMatrix()[radius]),
                                    [vehicleTypeId]: value,
                                  },
                                },
                              },
                              modifierExplicitlyCleared: {
                                ...current.modifierExplicitlyCleared,
                                [modifier.id]: false,
                              },
                            }))
                          }
                        />
                      ) : service.modifierEnabled[modifier.id] ? (
                        <div className="border border-dashed border-[color:var(--border)] px-3 py-3 text-[13px] text-[color:var(--muted)]">
                          Матрица будет создана после первого ввода значения.
                        </div>
                      ) : (
                        <div className="border border-dashed border-[color:var(--border)] px-3 py-3 text-[13px] text-[color:var(--muted)]">
                          Модификатор сейчас выключен. Сохранённые цены не удаляются, но не участвуют в расчёте, пока вы не включите его снова.
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          {service.priceType === "fixed" ? (
            <label className="space-y-1.5">
              <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                Фиксированная цена
              </span>
              <input
                value={service.fixedPrice}
                onChange={(event) =>
                  setService((current) => ({
                    ...current,
                    fixedPrice: Number(event.target.value || 0),
                  }))
                }
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              />
            </label>
          ) : null}

          {service.priceType === "from" ? (
            <div className="space-y-4">
              <label className="space-y-1.5">
                <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                  Цена от
                </span>
                <input
                  value={service.priceFrom}
                  onChange={(event) =>
                    setService((current) => ({
                      ...current,
                      priceFrom: parseNumberInput(event.target.value),
                    }))
                  }
                  className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                />
              </label>

              <div className="space-y-2.5 border-t border-[color:var(--border)] pt-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[14px] font-medium text-[color:var(--foreground)]">
                      Тарифы / диапазоны
                    </div>
                    <div className="text-[13px] text-[color:var(--muted)]">
                      Используются для услуг с операторским выбором цены
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setService((current) => ({
                        ...current,
                        priceBands: [
                          ...current.priceBands,
                          {
                            label: `Тариф ${current.priceBands.length + 1}`,
                            radiusLabels: [],
                            price: current.priceFrom || 0,
                          },
                        ],
                      }))
                    }
                    className="border border-[color:var(--border)] px-3 py-2 text-[13px] text-[color:var(--foreground)]"
                  >
                    Добавить тариф
                  </button>
                </div>

                {service.priceBands.length > 0 ? (
                  <div className="space-y-2">
                    {service.priceBands.map((band, index) => (
                      <div
                        key={`${band.label}-${index}`}
                        className="grid gap-2 border border-[color:var(--border)] p-3 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_auto]"
                      >
                        <input
                          value={band.label}
                          onChange={(event) =>
                            setService((current) => ({
                              ...current,
                              priceBands: current.priceBands.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, label: event.target.value }
                                  : item,
                              ),
                            }))
                          }
                          className="h-10 border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                          placeholder="Название тарифа"
                        />
                        <input
                          value={band.radiusLabels.join(", ")}
                          onChange={(event) =>
                            setService((current) => ({
                              ...current,
                              priceBands: current.priceBands.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      radiusLabels: event.target.value
                                        .split(",")
                                        .map((value) => value.trim())
                                        .filter(Boolean),
                                    }
                                  : item,
                              ),
                            }))
                          }
                          className="h-10 border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                          placeholder="R15, R16 или любой текст"
                        />
                        <input
                          value={band.price}
                          onChange={(event) =>
                            setService((current) => ({
                              ...current,
                              priceBands: current.priceBands.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      price: parseNumberInput(event.target.value),
                                    }
                                  : item,
                              ),
                            }))
                          }
                          className="h-10 border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                          placeholder="Цена"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setService((current) => ({
                              ...current,
                              priceBands: current.priceBands.filter(
                                (_, itemIndex) => itemIndex !== index,
                              ),
                            }))
                          }
                          className="h-10 border border-[color:var(--border)] px-3 text-[13px] text-[color:var(--foreground)]"
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[13px] text-[color:var(--muted)]">
                    Для этой услуги пока не задано ни одного тарифного варианта.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {service.priceType === "manual" ? (
            <div className="border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-3 text-[14px] text-[color:var(--muted)]">
              Для этой услуги используется свободная цена. Итоговая стоимость
              задаётся вручную при оформлении.
            </div>
          ) : null}

          <div className="grid gap-4 border-t border-[color:var(--border)] pt-4 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                Правило зарплаты
              </span>
              <select
                value={service.salaryRuleType}
                onChange={(event) =>
                  setService((current) => ({
                    ...current,
                    salaryRuleType:
                      event.target.value as ServicesAdminService["salaryRuleType"],
                    usesCostPrice: event.target.value === "percent_of_profit",
                    reducedEmployeePercentEnabled:
                      event.target.value === "percent_of_work"
                        ? current.reducedEmployeePercentEnabled
                        : false,
                  }))
                }
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              >
                {SALARY_RULE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="text-[13px] leading-5 text-[color:var(--muted)]">
                Как считается зарплата мастера по этой услуге.
              </p>
            </label>

            {(service.salaryRuleType === "percent_of_work" ||
              service.salaryRuleType === "percent_of_profit") && (
              <label className="space-y-1.5">
                <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                  Основной процент услуги
                </span>
                <input
                  value={service.salaryPercent}
                  onChange={(event) =>
                    setService((current) => ({
                      ...current,
                      salaryPercent: Number(event.target.value || 0),
                    }))
                  }
                  className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                />
              </label>
            )}

            {service.salaryRuleType === "fixed" && (
              <label className="space-y-1.5">
                <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                  Фиксированное начисление
                </span>
                <input
                  value={service.salaryFixedAmount}
                  onChange={(event) =>
                    setService((current) => ({
                      ...current,
                      salaryFixedAmount: Number(event.target.value || 0),
                    }))
                  }
                  className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                />
              </label>
            )}

            {service.salaryRuleType === "per_unit" && (
              <label className="space-y-1.5">
                <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                  Начисление за штуку
                </span>
                <input
                  value={service.salaryPerUnitAmount}
                  onChange={(event) =>
                    setService((current) => ({
                      ...current,
                      salaryPerUnitAmount: Number(event.target.value || 0),
                    }))
                  }
                  className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
                />
              </label>
            )}
          </div>

          <div className="flex flex-col gap-2.5 md:flex-row md:items-center">
            <label className="flex items-center gap-2 text-[14px] text-[color:var(--foreground)]">
              <input
                type="checkbox"
                checked={usesCostPriceForStage1Profit}
                disabled
                readOnly
              />
              Себестоимость обязательна для `% от прибыли`
            </label>
            <p className="text-[13px] leading-5 text-[color:var(--muted)]">
              {usesCostPriceForStage1Profit
                ? "Можно взять из карточки или указать в заказе."
                : "Для остальных правил это поле сейчас в расчёте не участвует."}
            </p>
          </div>

          {usesCostPriceForStage1Profit ? (
            <label className="space-y-1.5">
              <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                Подтверждённая себестоимость
              </span>
              <input
                value={service.costPrice}
                onChange={(event) =>
                  setService((current) => ({
                    ...current,
                    costPrice: parseNumberInput(event.target.value),
                  }))
                }
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none focus:border-[color:var(--primary)]"
              />
            </label>
          ) : null}

          <div className="space-y-2.5 border-t border-[color:var(--border)] pt-4">
            <div className="text-[14px] font-medium text-[color:var(--foreground)]">
              Пониженный процент исполнителя
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <label className="flex items-center gap-2 text-[14px] text-[color:var(--foreground)]">
                <input
                  type="checkbox"
                  checked={service.reducedEmployeePercentEnabled}
                  disabled={!usesReducedPercentForPercentOfWork}
                  onChange={(event) =>
                    setService((current) => ({
                      ...current,
                      reducedEmployeePercentEnabled: event.target.checked,
                    }))
                  }
                />
                {service.reducedEmployeePercentEnabled
                  ? "Включён"
                  : "Выключен"}
              </label>
              <p className="max-w-[520px] text-[13px] leading-5 text-[color:var(--muted)]">
                Для исключений: часть процента уходит мастеру 2/3 уровня, остаток — мастеру 1 уровня.
              </p>
            </div>
            {!usesReducedPercentForPercentOfWork ? (
              <p className="text-[13px] leading-5 text-[color:var(--muted)]">
                Доступно только для `% от работ`.
              </p>
            ) : null}
          </div>

          {service.reducedEmployeePercentEnabled &&
          usesReducedPercentForPercentOfWork ? (
            <label className="space-y-1.5">
              <span className="text-[14px] font-medium text-[color:var(--foreground)]">
                Процент мастера 2/3 уровня
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={service.reducedEmployeePercentValue}
                onChange={(event) =>
                  setService((current) => ({
                    ...current,
                    reducedEmployeePercentValue: parseNumberInput(event.target.value),
                  }))
                }
                className="h-10 w-full max-w-[220px] border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)]"
              />
            </label>
          ) : null}

          {validationMessage ? (
            <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] leading-5 text-rose-700">
              {validationMessage}
            </div>
          ) : null}

          {saveError ? (
            <div className="border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
              {saveError}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 flex flex-col-reverse gap-2 border-t border-[color:var(--border)] bg-white px-4 py-3 sm:flex-row sm:px-5 sm:py-4">
          <button
            type="button"
            onClick={handleRequestClose}
            className="flex-1 border border-[color:var(--primary)]/35 bg-white px-4 py-2 text-[14px] font-medium text-[color:var(--foreground)]"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => onSave(service)}
            disabled={Boolean(validationMessage) || isSaving}
            className="flex-1 border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 py-2 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
          >
            {isSaving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>

      {confirmState ? (
        <ConfirmDialog
          title={confirmTitle}
          description={confirmDescription}
          confirmLabel={confirmLabel}
          onCancel={() => setConfirmState(null)}
          onConfirm={handleConfirmAction}
        />
      ) : null}
    </div>
  );
}

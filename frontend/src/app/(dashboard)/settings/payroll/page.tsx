"use client";

import { FormEvent, useEffect, useState } from "react";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import {
  fetchPayrollFormulaSettings,
  savePayrollFormulaSettings,
  type PayrollFormulaSettingsDto,
} from "@/features/payroll/payroll-settings-api";
import { defaultPayrollFormulaSettings } from "@/features/payroll/payroll-formula-settings";
import { STAGE22_OPTIONAL_MATRIX_RULES } from "@/features/payroll/stage22-calculator";

type PayrollSettingsForm = {
  fourPlusFundPercent: string;
  level_1: string;
  level_2: string;
  level_3: string;
  matrixRules: Array<{
    key: string;
    label: string;
    shares: string[];
    isOptional: boolean;
  }>;
};

function formatBasisPointsInputValue(value: number) {
  const percent = value / 100;

  return Number.isInteger(percent) ? String(percent) : percent.toFixed(2).replace(/0$/, "");
}

function formatMatrixRuleLabel(key: string, fallback: string) {
  switch (key) {
    case "level_1":
      return "1 уровень";
    case "level_2":
      return "2 уровень";
    case "level_3":
      return "3 уровень";
    default:
      return fallback;
  }
}

function settingsToForm(settings: PayrollFormulaSettingsDto): PayrollSettingsForm {
  const matrixRulesByKey = new Map(settings.matrixRules.map((rule) => [rule.key, rule]));

  return {
    fourPlusFundPercent: formatNumberInputValue(settings.fourPlusFundPercent),
    level_1: formatNumberInputValue(settings.fourPlusWeights.level_1),
    level_2: formatNumberInputValue(settings.fourPlusWeights.level_2),
    level_3: formatNumberInputValue(settings.fourPlusWeights.level_3),
    matrixRules: [
      ...settings.matrixRules
        .filter((rule) => !STAGE22_OPTIONAL_MATRIX_RULES.some((optionalRule) => optionalRule.key === rule.key))
        .map((rule) => ({
          key: rule.key,
          label: formatMatrixRuleLabel(rule.key, rule.label),
          shares: rule.sharesBasisPoints.map(formatBasisPointsInputValue),
          isOptional: false,
        })),
      ...STAGE22_OPTIONAL_MATRIX_RULES.map((optionalRule) => {
        const storedRule = matrixRulesByKey.get(optionalRule.key);

        return {
          key: optionalRule.key,
          label: formatMatrixRuleLabel(optionalRule.key, optionalRule.label),
          shares: storedRule
            ? storedRule.sharesBasisPoints.map(formatBasisPointsInputValue)
            : optionalRule.sharesBasisPoints.map(() => ""),
          isOptional: true,
        };
      }),
    ],
  };
}

const DEFAULT_FORM: PayrollSettingsForm = {
  ...settingsToForm(defaultPayrollFormulaSettings()),
};

function formatNumberInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

function dtoToForm(settings: PayrollFormulaSettingsDto): PayrollSettingsForm {
  return settingsToForm(settings);
}

function parseRequiredPositiveNumber(value: string, label: string) {
  const parsed = Number(value.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label}: укажите число больше 0.`);
  }

  return parsed;
}

function parseNullablePercent(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed.replace(",", "."));

  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    throw new Error("Процент фонда при 4+ сотрудниках должен быть пустым или числом больше 0 и не больше 100.");
  }

  return parsed;
}

function parseMatrixShareBasisPoints(value: string, label: string) {
  const parsed = Number(value.trim().replace(",", "."));

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    throw new Error(`${label}: укажите процент от 0 до 100.`);
  }

  return Math.round(parsed * 100);
}

function formToDto(form: PayrollSettingsForm): PayrollFormulaSettingsDto {
  return {
    fourPlusFundPercent: parseNullablePercent(form.fourPlusFundPercent),
    fourPlusWeights: {
      level_1: parseRequiredPositiveNumber(form.level_1, "Вес мастера 1 уровня"),
      level_2: parseRequiredPositiveNumber(form.level_2, "Вес мастера 2 уровня"),
      level_3: parseRequiredPositiveNumber(form.level_3, "Вес мастера 3 уровня"),
    },
    matrixRules: form.matrixRules.flatMap((rule) => {
      if (rule.isOptional && rule.shares.every((share) => share.trim().length === 0)) {
        return [];
      }

      const sharesBasisPoints = rule.shares.map((share, index) =>
        parseMatrixShareBasisPoints(share, `${rule.label}, мастер ${index + 1}`),
      );
      const totalBasisPoints = sharesBasisPoints.reduce((sum, share) => sum + share, 0);

      if (totalBasisPoints <= 0 || totalBasisPoints > 10_000) {
        throw new Error(`${rule.label}: общий процент должен быть больше 0 и не больше 100.`);
      }

      return [{
        key: rule.key,
        label: rule.label,
        sharesBasisPoints,
      }];
    }),
  };
}

export default function PayrollSettingsPage() {
  const [form, setForm] = useState<PayrollSettingsForm>(DEFAULT_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [affectedFourPlusOrderCount, setAffectedFourPlusOrderCount] = useState<number | null>(
    null,
  );
  const percentIsEmpty = form.fourPlusFundPercent.trim().length === 0;

  useEffect(() => {
    let cancelled = false;

    fetchPayrollFormulaSettings()
      .then((response) => {
        if (!cancelled) {
          setForm(dtoToForm(response.settings));
          setAffectedFourPlusOrderCount(response.affectedFourPlusOrderCount ?? null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : "Не удалось загрузить настройки формулы зарплаты.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!message) {
      return;
    }

    const timeoutId = window.setTimeout(() => setMessage(null), 1800);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  function updateField(field: keyof PayrollSettingsForm, value: string) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
    setErrorMessage(null);
  }

  function updateMatrixShare(ruleIndex: number, shareIndex: number, value: string) {
    setForm((current) => ({
      ...current,
      matrixRules: current.matrixRules.map((rule, currentRuleIndex) =>
        currentRuleIndex === ruleIndex
          ? {
              ...rule,
              shares: rule.shares.map((share, currentShareIndex) =>
                currentShareIndex === shareIndex ? value : share,
              ),
            }
          : rule,
      ),
    }));
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setErrorMessage(null);
    setMessage(null);

    try {
      const nextSettings = await savePayrollFormulaSettings(formToDto(form));
      setForm(dtoToForm(nextSettings));
      setMessage("Настройки формулы зарплаты сохранены");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Не удалось сохранить настройки формулы зарплаты.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-[1120px] space-y-4">
      <div className="border border-[color:var(--border)] bg-white">
        <SettingsSectionsTabs activeSection="Зарплата" />
        <div className="space-y-4 px-4 py-4">
          <h1 className="text-[24px] font-medium leading-8 text-[color:var(--foreground)]">
            Формула зарплаты
          </h1>
          <p className="max-w-[880px] text-[13px] leading-6 text-slate-600">
            Эти настройки используются только для новых заказов и заказов, которые
            заново сохранят после изменения. Уже сохранённые заказы, начисления и
            выплаты не пересчитываются.
          </p>
          <div className="grid max-w-[880px] gap-3 border border-slate-200 bg-slate-50 px-3 py-3 text-[13px] leading-5 text-slate-700 md:grid-cols-3">
            <div>
              Заказы с 1-3 исполнителями считаются по общей матрице уровней.
            </div>
            <div>
              Матрица применяется глобально к новым или заново сохранённым
              заказам с шиномонтажными строками.
            </div>
            <div>
              Для 4+ сотрудников остаётся отдельное правило фонда и весов
              уровней.
            </div>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="max-w-[980px] space-y-5 border border-[color:var(--border)] bg-white px-4 py-4"
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-[16px] font-semibold leading-6 text-[color:var(--foreground)]">
              Матрица 1-3 мастера
            </h2>
            <p className="max-w-[760px] text-[13px] leading-5 text-[color:var(--muted)]">
              Это глобальная таблица распределения для шиномонтажной матрицы. По
              умолчанию строки совпадают с согласованной Excel-матрицей.
            </p>
          </div>

          <div className="overflow-x-auto border border-[color:var(--border)]">
            <table className="min-w-[720px] w-full border-collapse text-left text-[13px]">
              <thead className="bg-slate-50 text-[12px] uppercase tracking-[0.02em] text-slate-500">
                <tr>
                  <th className="border-b border-[color:var(--border)] px-3 py-2 font-medium">
                    Комбинация
                  </th>
                  <th className="border-b border-[color:var(--border)] px-3 py-2 font-medium">
                    Мастер 1
                  </th>
                  <th className="border-b border-[color:var(--border)] px-3 py-2 font-medium">
                    Мастер 2
                  </th>
                  <th className="border-b border-[color:var(--border)] px-3 py-2 font-medium">
                    Мастер 3
                  </th>
                </tr>
              </thead>
              <tbody>
                {form.matrixRules.map((rule, ruleIndex) => (
                  <tr key={rule.key} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-medium text-[color:var(--foreground)]">
                      {rule.label}
                      {rule.isOptional ? (
                        <div className="text-[11px] font-normal leading-4 text-[color:var(--muted)]">
                          Можно оставить пустым до настройки
                        </div>
                      ) : null}
                    </td>
                    {[0, 1, 2].map((shareIndex) => (
                      <td key={`${rule.key}-${shareIndex}`} className="px-3 py-2">
                        {shareIndex < rule.shares.length ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              inputMode="decimal"
                              step="0.01"
                              min="0"
                              max="100"
                              value={rule.shares[shareIndex]}
                              onChange={(event) =>
                                updateMatrixShare(ruleIndex, shareIndex, event.target.value)
                              }
                              disabled={loading || saving}
                              className="h-9 w-24 border border-[color:var(--border)] bg-white px-2 text-[14px] text-[color:var(--foreground)] outline-none disabled:cursor-wait disabled:bg-slate-50"
                            />
                            <span className="text-[12px] text-[color:var(--muted)]">%</span>
                          </div>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[12px] leading-5 text-[color:var(--muted)]">
            Строка `2 + 2 + 3` добавлена как отдельная настройка. Пока её не сохраняли с процентами,
            текущие заказы продолжают работать по прежней матрице без неё.
          </p>
        </div>

        <div className="border-t border-slate-100" />

        <div className="space-y-1">
          <h2 className="text-[16px] font-semibold leading-6 text-[color:var(--foreground)]">
            Заказы с 4+ сотрудниками
          </h2>
          <p className="max-w-[680px] text-[13px] leading-5 text-[color:var(--muted)]">
            Для таких заказов сначала считается зарплатный фонд, затем он делится
            между выбранными исполнителями по уровню мастерства.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-2">
            <span className="block text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
              Процент зарплатного фонда
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              placeholder="Например, 35 или 40"
              value={form.fourPlusFundPercent}
              onChange={(event) => updateField("fourPlusFundPercent", event.target.value)}
              disabled={loading || saving}
              className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[15px] text-[color:var(--foreground)] outline-none disabled:cursor-wait disabled:bg-slate-50"
            />
            <span className="block text-[12px] leading-5 text-[color:var(--muted)]">
              По умолчанию 40%. Какая часть оплаченной суммы заказа идёт в зарплатный фонд для 4+ сотрудников.
            </span>
          </label>

          <label className="space-y-2">
            <span className="block text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
              Вес мастера 1 уровня
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.level_1}
              onChange={(event) => updateField("level_1", event.target.value)}
              disabled={loading || saving}
              className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[15px] text-[color:var(--foreground)] outline-none disabled:cursor-wait disabled:bg-slate-50"
            />
            <span className="block text-[12px] leading-5 text-[color:var(--muted)]">
              Чем больше вес, тем больше доля мастера в фонде.
            </span>
          </label>

          <label className="space-y-2">
            <span className="block text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
              Вес мастера 2 уровня
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.level_2}
              onChange={(event) => updateField("level_2", event.target.value)}
              disabled={loading || saving}
              className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[15px] text-[color:var(--foreground)] outline-none disabled:cursor-wait disabled:bg-slate-50"
            />
          </label>

          <label className="space-y-2">
            <span className="block text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
              Вес мастера 3 уровня
            </span>
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={form.level_3}
              onChange={(event) => updateField("level_3", event.target.value)}
              disabled={loading || saving}
              className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[15px] text-[color:var(--foreground)] outline-none disabled:cursor-wait disabled:bg-slate-50"
            />
          </label>
        </div>

        <div className="border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] leading-5 text-[color:var(--muted)]">
          Пример: веса 3 / 2 / 1 означают, что мастер 1 уровня получает
          пропорционально больше, чем мастер 2 уровня, а мастер 2 уровня —
          больше, чем мастер 3 уровня.
        </div>

        {percentIsEmpty ? (
          <div className="border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
            <div>
              Укажите процент фонда для заказов с 4+ мастерами.
            </div>
            {affectedFourPlusOrderCount !== null ? (
              <div className="mt-1">
                Сейчас в выбранном филиале таких заказов: {affectedFourPlusOrderCount}.
              </div>
            ) : null}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] leading-5 text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading || saving}
            className="h-9 rounded-[4px] border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white disabled:cursor-wait disabled:opacity-70"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
          {loading ? (
            <span className="text-[13px] leading-5 text-[color:var(--muted)]">
              Загрузка настроек...
            </span>
          ) : null}
        </div>
      </form>

      {message ? (
        <div className="fixed bottom-6 right-6 z-50 border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] text-[color:var(--foreground)] shadow-sm">
          {message}
        </div>
      ) : null}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import {
  fetchCurrentBranchBundle,
  fetchPrintSettings,
  saveBranchProfile,
  savePrintSettings,
} from "@/features/settings-branch/repository";

type SettingsMainForm = {
  name: string;
  address: string;
  timezone: string;
  workStart: string;
  workEnd: string;
  phone: string;
};

type PrintSettingsForm = {
  receiptTitle: string;
  footerNote: string;
  showPhone: boolean;
  showAddress: boolean;
};

const DEFAULT_FORM: SettingsMainForm = {
  name: "Auto CRM",
  address: "ул. Сервисная, 10",
  timezone: "+5 Екатеринбург, Челябинск, Тюмень",
  workStart: "09:00",
  workEnd: "21:00",
  phone: "+7 900 001-00-10",
};

const DEFAULT_PRINT_SETTINGS: PrintSettingsForm = {
  receiptTitle: "Auto CRM",
  footerNote: "",
  showPhone: true,
  showAddress: true,
};

export default function SettingsMainPage() {
  const [form, setForm] = useState<SettingsMainForm>(DEFAULT_FORM);
  const [printSettings, setPrintSettings] = useState<PrintSettingsForm>(DEFAULT_PRINT_SETTINGS);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [branchDisplayName, setBranchDisplayName] = useState("Северный");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    Promise.allSettled([fetchCurrentBranchBundle(), fetchPrintSettings()])
      .then(([bundleResult, printResult]) => {
        if (cancelled || bundleResult.status !== "fulfilled") {
          return;
        }

        const bundle = bundleResult.value;
        const profile = bundle.profile;

        if (!profile) {
          return;
        }

        setBranchId(bundle.branch.id);
        setBranchDisplayName(profile.displayName);
        setForm({
          name: profile.legalName,
          address: profile.address,
          timezone: profile.timezoneLabel,
          workStart: profile.workStart,
          workEnd: profile.workEnd,
          phone: profile.phone,
        });

        if (printResult.status === "fulfilled") {
          setPrintSettings({
            receiptTitle: printResult.value.settings.receiptTitle,
            footerNote: printResult.value.settings.footerNote,
            showPhone: printResult.value.settings.showPhone,
            showAddress: printResult.value.settings.showAddress,
          });
        } else {
          setPrintSettings((current) => ({
            ...current,
            receiptTitle: profile.displayName,
          }));
        }
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!branchId) {
      return;
    }

    setSaving(true);

    try {
      await Promise.all([
        saveBranchProfile(branchId, {
          legalName: form.name.trim(),
          displayName: branchDisplayName,
          address: form.address.trim(),
          phone: form.phone.trim(),
          timezoneLabel: form.timezone,
          workStart: form.workStart,
          workEnd: form.workEnd,
        }),
        savePrintSettings({
          receiptTitle: printSettings.receiptTitle.trim(),
          footerNote: printSettings.footerNote.trim(),
          showPhone: printSettings.showPhone,
          showAddress: printSettings.showAddress,
        }),
      ]);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="max-w-[1200px] space-y-4">
      <div className="max-w-[1120px] bg-white">
        <SettingsSectionsTabs activeSection="Основные" />
      </div>

      <div className="max-w-[520px] space-y-5 px-3 pt-2 text-[16px] text-[color:var(--foreground)] sm:px-4">
        <div className="space-y-2">
          <div className="text-[13px] leading-4 text-[color:var(--muted)]">
            Текущий филиал: {branchDisplayName}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[16px] font-medium">Название</label>
          <input
            value={form.name}
            onChange={(event) =>
              setForm((current) => ({ ...current, name: event.target.value }))
            }
            className="h-11 w-full border border-[color:var(--border)] bg-white px-3 text-[16px] text-[color:var(--foreground)] outline-none"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-[16px] font-medium">Адрес и расположение</label>
          <div className="space-y-3 border border-[color:var(--border)] bg-white px-3 py-3">
            <input
              value={form.address}
              onChange={(event) =>
                setForm((current) => ({ ...current, address: event.target.value }))
              }
              className="h-11 w-full border border-[color:var(--border)] bg-white px-3 text-[16px] text-[color:var(--foreground)] outline-none"
              placeholder="Введите адрес"
            />

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px]">
              <div className="space-y-2">
                <label className="block text-[16px] font-medium">Часовой пояс</label>
                <div className="relative w-full">
                  <select
                    value={form.timezone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, timezone: event.target.value }))
                    }
                    className="h-11 w-full appearance-none border border-[color:var(--border)] bg-white px-3 pr-9 text-[16px] text-[color:var(--foreground)] outline-none"
                  >
                    <option>{DEFAULT_FORM.timezone}</option>
                    <option>+3 Москва, Санкт-Петербург</option>
                    <option>+7 Красноярск</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-[16px] font-medium">Время работы</label>
                <div className="grid grid-cols-[10px_minmax(96px,1fr)_16px_minmax(96px,1fr)] items-center gap-1.5 text-[15px] text-[color:var(--muted)]">
                  <span className="text-center">с</span>
                  <input
                    type="time"
                    value={form.workStart}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, workStart: event.target.value }))
                    }
                    className="h-9 min-w-[96px] w-full border border-[color:var(--border)] bg-white px-1.5 text-[14px] text-[color:var(--foreground)] outline-none"
                  />
                  <span className="text-center">до</span>
                  <input
                    type="time"
                    value={form.workEnd}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, workEnd: event.target.value }))
                    }
                    className="h-9 min-w-[96px] w-full border border-[color:var(--border)] bg-white px-1.5 text-[14px] text-[color:var(--foreground)] outline-none"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-[16px] font-medium">Телефон</label>
          <div className="text-[14px] leading-5 text-[color:var(--muted)]">
            Номер, по которому ваши клиенты могут связаться с вашей организацией
          </div>
          <input
            value={form.phone}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone: event.target.value }))
            }
            className="h-11 w-full border border-[color:var(--border)] bg-white px-3 text-[16px] text-[color:var(--foreground)] outline-none"
          />
        </div>

        <div className="space-y-3 border-t border-[color:var(--border)] pt-4">
          <div className="space-y-1">
            <div className="text-[16px] font-medium">Настройки чека</div>
            <div className="text-[14px] leading-5 text-[color:var(--muted)]">
              Эти данные будут использоваться в печати заказа.
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[16px] font-medium">Название в чеке</label>
            <input
              value={printSettings.receiptTitle}
              onChange={(event) =>
                setPrintSettings((current) => ({
                  ...current,
                  receiptTitle: event.target.value,
                }))
              }
              className="h-11 w-full border border-[color:var(--border)] bg-white px-3 text-[16px] text-[color:var(--foreground)] outline-none"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-[16px] font-medium">Текст внизу чека</label>
            <textarea
              value={printSettings.footerNote}
              onChange={(event) =>
                setPrintSettings((current) => ({
                  ...current,
                  footerNote: event.target.value,
                }))
              }
              className="min-h-[96px] w-full border border-[color:var(--border)] bg-white px-3 py-2 text-[15px] text-[color:var(--foreground)] outline-none"
            />
          </div>

          <div className="space-y-2 text-[15px] text-[color:var(--foreground)]">
            {[
              {
                key: "showPhone" as const,
                label: "Показывать телефон филиала",
              },
              {
                key: "showAddress" as const,
                label: "Показывать адрес филиала",
              },
            ].map((item) => (
              <label key={item.key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={printSettings[item.key]}
                  onChange={(event) =>
                    setPrintSettings((current) => ({
                      ...current,
                      [item.key]: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 border border-[color:var(--border)]"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleSave}
            disabled={!branchId || saving}
            className="inline-flex h-10 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-7 text-[15px] font-medium text-white"
          >
            {saving ? "Сохранение..." : "Сохранить"}
          </button>
        </div>
      </div>
    </section>
  );
}

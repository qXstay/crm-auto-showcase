"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, X } from "lucide-react";
import { formatPrice } from "@/features/pricing/config";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import {
  getDemoAccountAggregates,
  getInitialDemoAccountsStore,
  getOrderedDemoAccounts,
  sanitizeAccountName,
} from "@/features/settings-accounts/storage";
import {
  createAccountViaApi,
  fetchAccountsStore,
  updateAccountViaApi,
} from "@/features/settings-accounts/repository";
import type {
  DemoAccountAggregate,
  DemoAccountRecord,
  DemoAccountsStore,
} from "@/features/settings-accounts/types";

type AccountModalState = {
  open: boolean;
  mode: "create" | "edit";
  accountId: string | null;
  name: string;
  isArchived: boolean;
  touched: boolean;
};

const CLOSED_MODAL: AccountModalState = {
  open: false,
  mode: "create",
  accountId: null,
  name: "",
  isArchived: false,
  touched: false,
};

export default function AccountsSettingsPage() {
  const [store, setStore] = useState<DemoAccountsStore>(() => getInitialDemoAccountsStore());
  const [hydrated, setHydrated] = useState(false);
  const [modal, setModal] = useState<AccountModalState>(CLOSED_MODAL);

  const orderedAccounts = useMemo(() => getOrderedDemoAccounts(store), [store]);
  const accountAggregates = useMemo(
    () =>
      hydrated
        ? getDemoAccountAggregates(store)
        : orderedAccounts.map((account) => ({
            ...account,
            totalAmount: 0,
          })),
    [hydrated, orderedAccounts, store],
  );
  const aggregateById = useMemo(
    () =>
      accountAggregates.reduce<Record<string, DemoAccountAggregate>>(
        (accumulator, account) => {
          accumulator[account.id] = account;
          return accumulator;
        },
        {},
      ),
    [accountAggregates],
  );

  const trimmedName = sanitizeAccountName(modal.name);
  const hasDuplicateName = orderedAccounts.some(
    (account) =>
      account.id !== modal.accountId &&
      sanitizeAccountName(account.name).toLocaleLowerCase("ru-RU") ===
        trimmedName.toLocaleLowerCase("ru-RU"),
  );
  const canSaveAccount = trimmedName.length > 0 && !hasDuplicateName;

  useEffect(() => {
    fetchAccountsStore()
      .then((nextStore) => {
        setStore(nextStore);
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
  }, []);

  async function reloadStore() {
    const nextStore = await fetchAccountsStore();
    setStore(nextStore);
  }

  function openCreateModal() {
    setModal({
      open: true,
      mode: "create",
      accountId: null,
      name: "",
      isArchived: false,
      touched: false,
    });
  }

  function openEditModal(account: DemoAccountRecord) {
    setModal({
      open: true,
      mode: "edit",
      accountId: account.id,
      name: account.name,
      isArchived: account.isArchived,
      touched: false,
    });
  }

  function closeModal() {
    setModal(CLOSED_MODAL);
  }

  async function saveAccount() {
    if (!canSaveAccount) {
      setModal((current) => ({ ...current, touched: true }));
      return;
    }

    if (modal.mode === "edit" && modal.accountId) {
      await updateAccountViaApi(modal.accountId, {
        name: trimmedName,
        isArchived: modal.isArchived,
      });
    } else {
      await createAccountViaApi(trimmedName);
    }

    await reloadStore();
    closeModal();
  }

  return (
    <>
      <section className="max-w-[1220px] space-y-4">
        <div className="max-w-[1120px] bg-white">
          <SettingsSectionsTabs activeSection="Счета" />
        </div>

        <div className="max-w-[620px] px-4 pt-2">
          <div className="space-y-1">
            {orderedAccounts.map((account) => {
              const aggregate = aggregateById[account.id];

              return (
                <div
                  key={account.id}
                  className="flex min-h-11 items-center justify-between gap-4 py-1.5 text-[15px]"
                >
                  <div
                    className={
                      account.isArchived
                        ? "flex min-w-0 items-baseline gap-2 opacity-55"
                        : "flex min-w-0 items-baseline gap-2"
                    }
                  >
                    <span className="text-[16px] text-[color:var(--foreground)]">
                      {account.name}
                    </span>
                    <span className="text-[13px] text-[color:var(--muted)]">
                      {formatPrice(aggregate?.totalAmount ?? 0)}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
                    <button
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center"
                      aria-label={`Редактировать счет ${account.name}`}
                      onClick={() => openEditModal(account)}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-[4px] border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white"
              onClick={openCreateModal}
            >
              Добавить счет
            </button>
          </div>
        </div>
      </section>

      {modal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-[520px] border border-[color:var(--border)] bg-white p-6 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[24px] font-medium leading-7 text-[color:var(--foreground)]">
                {modal.mode === "edit" ? "Редактирование счета" : "Новый счет"}
              </div>
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center text-[color:var(--muted)]"
                onClick={closeModal}
                aria-label="Закрыть"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="space-y-2">
                <span className="block text-[16px] font-medium leading-6">
                  Название
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
                />
              </label>

              {modal.mode === "edit" ? (
                <label className="flex items-center gap-3 border border-[color:var(--border)] px-4 py-3 text-[16px] text-[color:var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={modal.isArchived}
                    onChange={(event) =>
                      setModal((current) => ({
                        ...current,
                        isArchived: event.target.checked,
                      }))
                    }
                    className="h-5 w-5"
                  />
                  <span>В архиве</span>
                </label>
              ) : null}

              {modal.touched && !canSaveAccount ? (
                <div className="text-[13px] leading-5 text-[#b45309]">
                  {trimmedName.length === 0
                    ? "Укажите название счета."
                    : "Счет с таким названием уже есть."}
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="inline-flex h-11 items-center border border-[color:var(--border)] bg-white px-6 text-[15px]"
                onClick={closeModal}
              >
                Отмена
              </button>
              <button
                type="button"
                className="inline-flex h-11 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-6 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={saveAccount}
                disabled={!canSaveAccount}
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

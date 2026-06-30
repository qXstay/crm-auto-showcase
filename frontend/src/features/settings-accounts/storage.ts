"use client";

import { DEMO_ORDER_DETAILS } from "@/features/orders/mock-data";
import {
  getStoredDemoOrders,
  isFinishedDemoOrderStatus,
} from "@/features/orders/storage";
import type {
  DemoOrderPaymentMethod,
  DemoOrderPaymentSnapshot,
} from "@/features/orders/types";
import type {
  DemoAccountAggregate,
  DemoAccountRecord,
  DemoAccountsStore,
  DemoResolvedPaymentAccount,
} from "@/features/settings-accounts/types";

const DEMO_ACCOUNTS_STORAGE_KEY = "pegas-demo-settings-accounts";

export const DEFAULT_AUTOMATION_ACCOUNT_ID = "account-automation-service";
export const DEFAULT_IP_ACCOUNT_ID = "account-ip";
export const DEFAULT_CASH_ACCOUNT_ID = "account-cash";

const INITIAL_ACCOUNTS: DemoAccountRecord[] = [
  {
    id: DEFAULT_AUTOMATION_ACCOUNT_ID,
    name: "ООО Автоматика-Сервис",
    isArchived: false,
    protected: true,
    createdAt: "2026-03-18T09:00:00+05:00",
    updatedAt: "2026-03-18T09:00:00+05:00",
  },
  {
    id: DEFAULT_IP_ACCOUNT_ID,
    name: "ИП",
    isArchived: false,
    protected: true,
    createdAt: "2026-03-18T09:00:00+05:00",
    updatedAt: "2026-03-18T09:00:00+05:00",
  },
  {
    id: DEFAULT_CASH_ACCOUNT_ID,
    name: "Наличный расчет",
    isArchived: false,
    protected: true,
    createdAt: "2026-03-18T09:00:00+05:00",
    updatedAt: "2026-03-18T09:00:00+05:00",
  },
];

function cloneAccount(account: DemoAccountRecord): DemoAccountRecord {
  return { ...account };
}

function createInitialStore(): DemoAccountsStore {
  return {
    accounts: INITIAL_ACCOUNTS.map(cloneAccount),
  };
}

export function getInitialDemoAccountsStore(): DemoAccountsStore {
  return createInitialStore();
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function normalizeStore(value: unknown): DemoAccountsStore {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as DemoAccountsStore).accounts)
  ) {
    return createInitialStore();
  }

  const accounts = (value as DemoAccountsStore).accounts.filter(
    (account): account is DemoAccountRecord =>
      Boolean(account) &&
      typeof account.id === "string" &&
      typeof account.name === "string" &&
      typeof account.isArchived === "boolean" &&
      typeof account.protected === "boolean" &&
      typeof account.createdAt === "string" &&
      typeof account.updatedAt === "string",
  );

  return {
    accounts:
      accounts.length > 0 ? accounts.map(cloneAccount) : createInitialStore().accounts,
  };
}

export function loadDemoAccountsStore(): DemoAccountsStore {
  if (!canUseStorage()) {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(DEMO_ACCOUNTS_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return createInitialStore();
  }
}

export function saveDemoAccountsStore(store: DemoAccountsStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    DEMO_ACCOUNTS_STORAGE_KEY,
    JSON.stringify({
      accounts: store.accounts.map(cloneAccount),
    } satisfies DemoAccountsStore),
  );
}

export function sanitizeAccountName(value: string) {
  return value.trim();
}

function normalizeAccountName(value: string | null | undefined) {
  return sanitizeAccountName(value ?? "").toLocaleLowerCase("ru-RU");
}

function inferPaymentMethod(
  paymentMethod: DemoOrderPaymentMethod | null | undefined,
  paymentLabel: string | null | undefined,
): DemoOrderPaymentMethod | null {
  if (paymentMethod) {
    return paymentMethod;
  }

  switch (paymentLabel) {
    case "Наличный расчёт":
    case "Наличный расчет":
    case "Наличные":
      return "cash";
    case "Карта":
    case "Безнал (эквайринг)":
      return "card";
    case "Перевод":
    case "Перевод на карту":
      return "transfer";
    case "Денис":
      return "transfer";
    case "Расчётный счёт":
      return "bank_account";
    default:
      return null;
  }
}

export function findDemoAccountById(
  store: DemoAccountsStore,
  accountId: string | null,
) {
  if (!accountId) {
    return null;
  }

  return store.accounts.find((account) => account.id === accountId) ?? null;
}

export function getActiveDemoAccounts(store: DemoAccountsStore) {
  return store.accounts.filter((account) => !account.isArchived);
}

export function getOrderedDemoAccounts(store: DemoAccountsStore) {
  const activeAccounts = store.accounts.filter((account) => !account.isArchived);
  const archivedAccounts = store.accounts.filter((account) => account.isArchived);

  return [...activeAccounts, ...archivedAccounts];
}

export function getDefaultDemoAccountIdForPaymentMethod(
  paymentMethod: DemoOrderPaymentMethod | null | undefined,
) {
  switch (paymentMethod) {
    case "cash":
      return DEFAULT_CASH_ACCOUNT_ID;
    case "card":
      return DEFAULT_AUTOMATION_ACCOUNT_ID;
    case "transfer":
    case "ildar":
    case "bank_account":
      return DEFAULT_IP_ACCOUNT_ID;
    default:
      return null;
  }
}

export function resolveDemoPaymentAccount(
  input: Pick<
    DemoOrderPaymentSnapshot,
    "accountId" | "accountNameSnapshot" | "paymentMethod" | "paymentLabel"
  > & {
    accountName?: string | null;
    accountLabel?: string | null;
  },
  store: DemoAccountsStore,
): DemoResolvedPaymentAccount | null {
  const matchedById = findDemoAccountById(store, input.accountId);

  if (matchedById) {
    return {
      accountId: matchedById.id,
      accountName: matchedById.name,
    };
  }

  const nameCandidates = [
    input.accountNameSnapshot,
    input.accountName,
    input.accountLabel,
  ];

  for (const candidate of nameCandidates) {
    const normalizedCandidate = normalizeAccountName(candidate);

    if (!normalizedCandidate) {
      continue;
    }

    const matchedByName = store.accounts.find(
      (account) => normalizeAccountName(account.name) === normalizedCandidate,
    );

    if (matchedByName) {
      return {
        accountId: matchedByName.id,
        accountName: matchedByName.name,
      };
    }
  }

  return null;
}

export function getDemoAccountAggregates(store: DemoAccountsStore): DemoAccountAggregate[] {
  const totalsByAccountId = new Map<string, number>();
  const storedOrders = getStoredDemoOrders();
  const storedOrderIds = new Set(storedOrders.map((order) => order.id));

  storedOrders.forEach((order) => {
    if (!isFinishedDemoOrderStatus(order.status) && order.payment.paymentStatus !== "Оплачен") {
      return;
    }

    const resolvedAccount = resolveDemoPaymentAccount(order.payment, store);
    const amount = order.payment.paidAmount ?? order.totals.total;

    if (!resolvedAccount || amount <= 0) {
      return;
    }

    totalsByAccountId.set(
      resolvedAccount.accountId,
      (totalsByAccountId.get(resolvedAccount.accountId) ?? 0) + amount,
    );
  });

  DEMO_ORDER_DETAILS.forEach((order) => {
    if (
      !isFinishedDemoOrderStatus(order.status) ||
      storedOrderIds.has(order.id) ||
      order.amount <= 0
    ) {
      return;
    }

    const resolvedAccount = resolveDemoPaymentAccount(
      {
        accountId: null,
        accountNameSnapshot: null,
        paymentMethod: inferPaymentMethod(null, order.paymentLabel),
        paymentLabel: order.paymentLabel,
      },
      store,
    );

    if (!resolvedAccount) {
      return;
    }

    totalsByAccountId.set(
      resolvedAccount.accountId,
      (totalsByAccountId.get(resolvedAccount.accountId) ?? 0) + order.amount,
    );
  });

  return getOrderedDemoAccounts(store).map((account) => ({
    ...account,
    totalAmount: totalsByAccountId.get(account.id) ?? 0,
  }));
}

export function getDemoAccountBreakdownFromItems<
  T extends {
    accountId: string | null;
    accountName?: string | null;
    amount: number;
  },
>(items: T[], store: DemoAccountsStore) {
  const totalsByAccountId = new Map<string, number>();

  items.forEach((item) => {
    const resolvedAccount =
      findDemoAccountById(store, item.accountId) ??
      store.accounts.find(
        (account) =>
          item.accountName &&
          normalizeAccountName(account.name) === normalizeAccountName(item.accountName),
      ) ??
      null;

    if (!resolvedAccount || item.amount <= 0) {
      return;
    }

    totalsByAccountId.set(
      resolvedAccount.id,
      (totalsByAccountId.get(resolvedAccount.id) ?? 0) + item.amount,
    );
  });

  return getOrderedDemoAccounts(store)
    .map((account) => ({
      accountId: account.id,
      accountName: account.name,
      amount: totalsByAccountId.get(account.id) ?? 0,
      isArchived: account.isArchived,
    }))
    .filter((item) => item.amount > 0);
}

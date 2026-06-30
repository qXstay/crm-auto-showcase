"use client";

import { DEMO_ORDER_LIST } from "@/features/orders/mock-data";
import {
  calculateLineAccrualSnapshot,
  calculateOrderAccrualTotal,
} from "@/features/orders/salary";
import type {
  DemoOrder,
  DemoOrderClientSnapshot,
  DemoOrderPaymentMethod,
  DemoOrderPaymentSnapshot,
  DemoOrderStatus,
  DemoOrderTotals,
} from "@/features/orders/types";
import { calculateOrderTotals } from "@/features/orders/totals";
import type { OrderDraft } from "@/features/order-draft/types";
import { formatPrice } from "@/features/pricing/config";
import {
  formatEmployeeDisplayName,
  getActiveEmployees,
  loadDemoEmployeesStore,
} from "@/features/settings-employees/storage";
import type { DemoEmployeeRecord } from "@/features/settings-employees/types";
import type { CartItem } from "@/features/cashier/types";
import {
  CLIENT_NAME_FALLBACK,
  getClientDisplayName,
  normalizeInn,
  normalizePhone,
  normalizePlate,
  sanitizeClientKind,
  validateInn,
} from "@/features/clients/client-contract";
import { PEGAS_OPERATIONAL_TIME_ZONE } from "@/shared/operational-time";

const DEMO_ORDERS_STORAGE_KEY = "pegas-demo-orders";
const CURRENT_DEMO_ORDER_ID_STORAGE_KEY = "pegas-current-demo-order-id";
const LEGACY_ORDER_IMPORT_MAP_STORAGE_KEY = "pegas-legacy-order-import-map";
const LEGACY_EXECUTOR_TO_EMPLOYEE_ID: Record<string, string> = {
  irazin: "employee-razin",
  razin: "employee-razin",
  dgalentdinov: "employee-gajnetdinov",
  galendinov: "employee-gajnetdinov",
  nsmirnov: "employee-smirnov",
  smirnov: "employee-smirnov",
};
const KNOWN_CLIENT_SNAPSHOTS: Record<
  string,
  Pick<DemoOrderClientSnapshot, "carBrand" | "carModel" | "plateNumber"> & {
    preferredRadius: DemoOrder["radius"];
  }
> = {
  "denis-pavlov": {
    carBrand: "BMW",
    carModel: "3 серии",
    plateNumber: "О313АА 196",
    preferredRadius: "R17",
  },
  "natalya-orlova": {
    carBrand: "Brabus",
    carModel: "V12",
    plateNumber: "А001МР 196",
    preferredRadius: "R20",
  },
  "boris-zelen": {
    carBrand: "LADA",
    carModel: "Largus",
    plateNumber: "Е220КУ 196",
    preferredRadius: "R15",
  },
  "anna-sokolova": {
    carBrand: "Kia",
    carModel: "K5",
    plateNumber: "Т412РК 196",
    preferredRadius: "R18",
  },
  "sergey-volkov": {
    carBrand: "Toyota",
    carModel: "Camry",
    plateNumber: "С777ОР 196",
    preferredRadius: "R18",
  },
};

function canUseStorage() {
  return typeof window !== "undefined";
}

function getLegacyExecutorEmployeeId(executorId: string | null | undefined) {
  if (!executorId) {
    return null;
  }

  return LEGACY_EXECUTOR_TO_EMPLOYEE_ID[executorId] ?? executorId;
}

function findDemoEmployeeById(
  employees: DemoEmployeeRecord[],
  employeeId: string | null | undefined,
) {
  if (!employeeId) {
    return null;
  }

  return employees.find((employee) => employee.id === employeeId) ?? null;
}

function getDefaultExecutorEmployee(employees: DemoEmployeeRecord[]) {
  return employees[0] ?? null;
}

function getDemoOrderExecutorSnapshot(
  order: Partial<DemoOrder>,
  employees: DemoEmployeeRecord[],
) {
  const employeeId =
    (typeof order.executorEmployeeId === "string" && order.executorEmployeeId) ||
    getLegacyExecutorEmployeeId(
      typeof order.executorId === "string" ? order.executorId : null,
    );
  const employee = findDemoEmployeeById(employees, employeeId);

  return {
    executorId:
      employee?.id ??
      (typeof order.executorId === "string" && order.executorId ? order.executorId : null),
    executorEmployeeId: employee?.id ?? null,
    executorNameSnapshot:
      order.executorNameSnapshot ??
      (employee ? formatEmployeeDisplayName(employee) : null),
  };
}

function normalizeModifierFlags(value: {
  lowProfile?: boolean | null;
  runflat?: boolean | null;
  tireMode?: string | null;
}) {
  if (typeof value.lowProfile === "boolean" || typeof value.runflat === "boolean") {
    return {
      lowProfile: Boolean(value.lowProfile),
      runflat: Boolean(value.runflat),
    };
  }

  const legacyMode = (value.tireMode ?? "").trim().toLowerCase();

  if (!legacyMode) {
    return {
      lowProfile: false,
      runflat: false,
    };
  }

  return {
    lowProfile: legacyMode.includes("low"),
    runflat: legacyMode.includes("run"),
  };
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTimeWithSeconds(date: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatDemoOrderShiftLabel(number: number, openedAt: string) {
  const date = new Intl.DateTimeFormat("ru-RU", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(openedAt));

  return `№${number} от ${date}`;
}

export function getDemoOrderPaymentMethodLabel(
  method: DemoOrderPaymentMethod | null,
) {
  switch (method) {
    case "cash":
      return "Наличные";
    case "card":
      return "Карта";
    case "transfer":
      return "Перевод";
    case "ildar":
      return "Перевод";
    case "bank_account":
      return "Расчётный счёт";
    default:
      return null;
  }
}

function getNormalizedDemoPaymentComparisonKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ё/g, "е")
    .toLocaleLowerCase("ru-RU");
}

function normalizeDemoOrderPaymentDisplayValue(value: string | null | undefined) {
  const seenLabels = new Set<string>();
  const paymentBits = (value ?? "")
    .normalize("NFKC")
    .split(/[·•]/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((part) => {
      const normalizedPart = getNormalizedDemoPaymentComparisonKey(part);

      if (
        normalizedPart === "карта" ||
        normalizedPart === "безнал (эквайринг)" ||
        normalizedPart === "эквайринг (карта)"
      ) {
        return "Карта";
      }

      if (normalizedPart === "перевод" || normalizedPart === "перевод на карту") {
        return "Перевод";
      }

      return part;
    })
    .filter((part) => {
      const normalizedPart = getNormalizedDemoPaymentComparisonKey(part);

      if (seenLabels.has(normalizedPart)) {
        return false;
      }

      seenLabels.add(normalizedPart);
      return true;
    });

  return paymentBits.join(" · ") || null;
}

function inferDemoOrderPaymentMethodFromLabel(
  legacyPaymentLabelKey: string,
): DemoOrderPaymentMethod | null {
  if (
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Карта") ||
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Безнал (эквайринг)") ||
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Эквайринг (карта)")
  ) {
    return "card";
  }

  if (
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Наличный расчёт") ||
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Наличные")
  ) {
    return "cash";
  }

  if (
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Перевод") ||
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Перевод на карту")
  ) {
    return "transfer";
  }

  if (legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Денис")) {
    return "transfer";
  }

  if (
    legacyPaymentLabelKey === getNormalizedDemoPaymentComparisonKey("Расчётный счёт")
  ) {
    return "bank_account";
  }

  return null;
}

export function formatDemoOrderCarLabel(
  order: Pick<DemoOrder, "client">,
) {
  const brandModel = [order.client.carBrand, order.client.carModel]
    .filter(Boolean)
    .join(" ")
    .trim();

  return brandModel || "Не указан";
}

export function getDemoOrderClientDisplayName(
  client: Pick<DemoOrderClientSnapshot, "anonymous" | "name" | "label">,
) {
  if (client.anonymous) {
    return "Анонимный клиент";
  }

  return client.name || client.label || CLIENT_NAME_FALLBACK;
}

export function formatDemoOrderClientDisplay(
  client: Pick<DemoOrderClientSnapshot, "anonymous" | "name" | "label" | "phone">,
  options?: { includePhone?: boolean },
) {
  const baseLabel = getDemoOrderClientDisplayName(client);

  if (!options?.includePhone || !client.phone) {
    return baseLabel;
  }

  return `${baseLabel} · ${client.phone}`;
}

function normalizeDemoOrderPayment(order: DemoOrder): DemoOrderPaymentSnapshot {
  const legacyPayment = order.payment as Partial<DemoOrderPaymentSnapshot> & {
    status?: "Не оплачено" | "Оплачен";
    acceptedAt?: string | null;
    accountName?: string | null;
    accountLabel?: string | null;
  };
  const legacyPaymentLabel = normalizeDemoOrderPaymentDisplayValue(
    legacyPayment.paymentLabel,
  );
  const legacyPaymentLabelKey = getNormalizedDemoPaymentComparisonKey(legacyPaymentLabel);

  const paymentMethod =
    legacyPayment.paymentMethod ?? inferDemoOrderPaymentMethodFromLabel(legacyPaymentLabelKey);
  const paidAt = legacyPayment.paidAt ?? legacyPayment.acceptedAt ?? null;
  const paymentStatus =
    legacyPayment.paymentStatus ??
    legacyPayment.status ??
    (paidAt ? "Оплачен" : "Не оплачено");
  const paymentLabel = normalizeDemoOrderPaymentDisplayValue(
    legacyPaymentLabel ?? getDemoOrderPaymentMethodLabel(paymentMethod),
  );
  const accountNameSnapshot = normalizeDemoOrderPaymentDisplayValue(
    legacyPayment.accountNameSnapshot ??
      legacyPayment.accountName ??
      legacyPayment.accountLabel ??
      null,
  );

  return {
    paymentStatus,
    paymentMethod,
    paymentLabel,
    accountId: legacyPayment.accountId ?? null,
    accountNameSnapshot,
    paidAt,
    paidAmount:
      legacyPayment.paidAmount ??
      (paymentStatus === "Оплачен" ? order.totals.total : null),
    note: legacyPayment.note ?? null,
  };
}

function normalizeOrderLine(line: CartItem): CartItem {
  const salaryAccrualSnapshot =
    line.salaryAccrualSnapshot ??
    calculateLineAccrualSnapshot({
      unitPrice: line.unitPrice,
      quantity: line.quantity,
      salaryRuleSnapshot: line.salaryRuleSnapshot,
      costPrice: line.costPrice,
    });

  return {
    ...line,
    salaryAccrualSnapshot,
  };
}

function getNextOrderNumber(storedOrders: DemoOrder[]) {
  const seedMax = DEMO_ORDER_LIST.reduce((max, order) => {
    const value = Number(order.number);

    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  const storedMax = storedOrders.reduce((max, order) => {
    const value = Number(order.number);

    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);

  return String(Math.max(seedMax, storedMax) + 1);
}

export function buildDemoOrderClientSnapshotFromDraft(
  draft: OrderDraft | null,
): DemoOrderClientSnapshot {
  const clientKind = sanitizeClientKind(draft?.clientKind);
  const organizationName = draft?.organizationName?.trim() ?? "";
  const inn = validateInn(draft?.inn) ? normalizeInn(draft?.inn) : "";
  const contractNumber = draft?.contractNumber?.trim() ?? "";
  const phone = normalizePhone(draft?.phone);
  const plateNumber = normalizePlate(draft?.plateNumber);

  if (!draft || draft.mode === "anonymous") {
    const carText = draft
      ? [draft.carBrand, draft.carModel].filter(Boolean).join(" ").trim()
      : "";
    const details = draft
      ? [carText, plateNumber].filter(Boolean).join(" · ")
      : "";

    return {
      mode: "anonymous",
      clientId: "anonymous",
      clientKind: "individual",
      organizationName: undefined,
      inn: undefined,
      label: "Анонимный клиент",
      details: details || "Без клиентской карты",
      name: "Анонимный клиент",
      phone: "",
      carBrand: draft?.carBrand ?? "",
      carModel: draft?.carModel ?? "",
      plateNumber,
      preferredRadius: draft?.preferredRadius ?? "",
      anonymous: true,
    };
  }

  if (draft.mode === "existing") {
    const carText = [draft.carBrand, draft.carModel].filter(Boolean).join(" ").trim();
    const displayName =
      getClientDisplayName({
        clientKind,
        organizationName,
        fullName: draft.clientName,
        fallback: clientKind === "legal" ? "Юридическое лицо" : "Клиент из базы",
      });
    const details = [
      carText,
      plateNumber,
      phone,
      clientKind === "legal" && inn ? `ИНН ${inn}` : null,
      clientKind === "legal" && contractNumber ? `Договор ${contractNumber}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    return {
      mode: "existing",
      clientId: draft.selectedClientId,
      clientKind,
      organizationName: organizationName || undefined,
      inn: inn || undefined,
      contractNumber: contractNumber || undefined,
      label: displayName,
      details: details || "Клиент из базы",
      name: displayName,
      phone,
      carBrand: draft.carBrand,
      carModel: draft.carModel,
      plateNumber,
      preferredRadius: draft.preferredRadius,
      anonymous: false,
    };
  }

  const carText = [draft.carBrand, draft.carModel].filter(Boolean).join(" ").trim();
  const displayName =
    getClientDisplayName({
      clientKind,
      organizationName,
      fullName: draft.clientName,
      fallback: clientKind === "legal" ? "Юридическое лицо" : CLIENT_NAME_FALLBACK,
    });
  const details = [
    carText,
    plateNumber,
    phone,
    clientKind === "legal" && inn ? `ИНН ${inn}` : null,
    clientKind === "legal" && contractNumber ? `Договор ${contractNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return {
    mode: "new",
    clientId: draft.selectedClientId || "",
    clientKind,
    organizationName: organizationName || undefined,
    inn: inn || undefined,
    contractNumber: contractNumber || undefined,
    label: displayName,
    details,
    name: displayName,
    phone,
    carBrand: draft.carBrand,
    carModel: draft.carModel,
    plateNumber,
    preferredRadius: draft.preferredRadius,
    anonymous: false,
  };
}

export function calculateDemoOrderTotals(
  lines: DemoOrder["lines"],
  discountPercent = 0,
): DemoOrderTotals {
  return calculateOrderTotals(lines, discountPercent);
}

export function deriveDemoOrderStatus(
  lines: DemoOrder["lines"],
  currentStatus: DemoOrderStatus,
) {
  if (currentStatus === "Оплачен" || currentStatus === "Выполнен") {
    return "Оплачен" as const;
  }

  if (lines.length === 0) {
    return "Черновик" as const;
  }

  return "В работе" as const;
}

export function isActiveDemoOrderStatus(status: DemoOrderStatus) {
  return status === "Черновик" || status === "В работе" || status === "Ожидает оплаты";
}

export function isFinishedDemoOrderStatus(status: DemoOrderStatus) {
  return status === "Оплачен" || status === "Выполнен";
}

export function getStoredDemoOrders(): DemoOrder[] {
  if (!canUseStorage()) {
    return [];
  }

  const rawValue = window.localStorage.getItem(DEMO_ORDERS_STORAGE_KEY);

  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as DemoOrder[];
    const employees = getActiveEmployees(loadDemoEmployeesStore());
    const normalizedOrders = parsed.map((order) => {
      const knownClient = order.client.clientId
        ? KNOWN_CLIENT_SNAPSHOTS[order.client.clientId]
        : null;
      const normalizedPayment = normalizeDemoOrderPayment(order);
      const normalizedExecutor = getDemoOrderExecutorSnapshot(order, employees);
      const normalizedModifiers = normalizeModifierFlags(
        order as DemoOrder & { tireMode?: string | null },
      );
      const normalizedLines = Array.isArray(order.lines)
        ? order.lines.map((line) => normalizeOrderLine(line))
        : [];
      const normalizedOrder = {
        ...order,
        ...normalizedExecutor,
        ...normalizedModifiers,
        shiftId: order.shiftId ?? null,
        shiftLabelSnapshot: order.shiftLabelSnapshot ?? null,
        shiftOpenedAtSnapshot: order.shiftOpenedAtSnapshot ?? null,
        lines: normalizedLines,
        salaryAccrualTotal:
          typeof order.salaryAccrualTotal === "number"
            ? order.salaryAccrualTotal
            : calculateOrderAccrualTotal(normalizedLines),
        payment: normalizedPayment,
      } satisfies DemoOrder;

      if (!knownClient) {
        return normalizedOrder;
      }

      return {
        ...normalizedOrder,
        client: {
          ...order.client,
          carBrand: order.client.carBrand || knownClient.carBrand,
          carModel: order.client.carModel || knownClient.carModel,
          plateNumber: order.client.plateNumber || knownClient.plateNumber,
          preferredRadius: order.client.preferredRadius || knownClient.preferredRadius,
        },
      };
    });

    const normalizedRawValue = JSON.stringify(normalizedOrders);

    if (normalizedRawValue !== rawValue) {
      saveStoredDemoOrders(normalizedOrders);
    }

    return normalizedOrders;
  } catch {
    return [];
  }
}

export function saveStoredDemoOrders(orders: DemoOrder[]) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(DEMO_ORDERS_STORAGE_KEY, JSON.stringify(orders));
}

export function getCurrentDemoOrderId() {
  if (!canUseStorage()) {
    return null;
  }

  return window.localStorage.getItem(CURRENT_DEMO_ORDER_ID_STORAGE_KEY);
}

export function setCurrentDemoOrderId(orderId: string) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(CURRENT_DEMO_ORDER_ID_STORAGE_KEY, orderId);
}

export function clearCurrentDemoOrderId() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(CURRENT_DEMO_ORDER_ID_STORAGE_KEY);
}

function getLegacyOrderImportMap() {
  if (!canUseStorage()) {
    return {} as Record<string, string>;
  }

  try {
    const rawValue = window.localStorage.getItem(LEGACY_ORDER_IMPORT_MAP_STORAGE_KEY);

    if (!rawValue) {
      return {} as Record<string, string>;
    }

    const parsedValue = JSON.parse(rawValue) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(parsedValue).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {} as Record<string, string>;
  }
}

function saveLegacyOrderImportMap(value: Record<string, string>) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    LEGACY_ORDER_IMPORT_MAP_STORAGE_KEY,
    JSON.stringify(value),
  );
}

export function getImportedBackendOrderId(legacyOrderId: string) {
  return getLegacyOrderImportMap()[legacyOrderId] ?? null;
}

export function setImportedBackendOrderId(legacyOrderId: string, backendOrderId: string) {
  const currentMap = getLegacyOrderImportMap();

  if (currentMap[legacyOrderId] === backendOrderId) {
    return;
  }

  saveLegacyOrderImportMap({
    ...currentMap,
    [legacyOrderId]: backendOrderId,
  });
}

export function getStoredDemoOrderById(orderId: string) {
  return getStoredDemoOrders().find((order) => order.id === orderId) ?? null;
}

export function upsertStoredDemoOrder(nextOrder: DemoOrder) {
  const orders = getStoredDemoOrders();
  const existingIndex = orders.findIndex((order) => order.id === nextOrder.id);
  const nextOrders = [...orders];

  if (existingIndex >= 0) {
    nextOrders[existingIndex] = nextOrder;
  } else {
    nextOrders.unshift(nextOrder);
  }

  saveStoredDemoOrders(nextOrders);
  setCurrentDemoOrderId(nextOrder.id);
}

export function removeStoredDemoOrder(orderId: string) {
  const nextOrders = getStoredDemoOrders().filter((order) => order.id !== orderId);

  saveStoredDemoOrders(nextOrders);

  if (getCurrentDemoOrderId() === orderId) {
    clearCurrentDemoOrderId();
  }
}

export function createDemoOrderFromDraft(draft: OrderDraft | null): DemoOrder {
  const storedOrders = getStoredDemoOrders();
  const employees = getActiveEmployees(loadDemoEmployeesStore());
  const defaultExecutor = getDefaultExecutorEmployee(employees);
  const number = getNextOrderNumber(storedOrders);
  const now = new Date();

  return {
    id: `demo-order-${number}`,
    number,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: "Черновик",
    client: buildDemoOrderClientSnapshotFromDraft(draft),
    vehicleType: "passenger",
    radius: draft?.preferredRadius || "R17",
    lowProfile: false,
    runflat: false,
    executorId: defaultExecutor?.id ?? null,
    executorEmployeeId: defaultExecutor?.id ?? null,
    executorNameSnapshot: defaultExecutor
      ? formatEmployeeDisplayName(defaultExecutor)
      : null,
    shiftId: null,
    shiftLabelSnapshot: null,
    shiftOpenedAtSnapshot: null,
    lines: [],
    salaryAccrualTotal: 0,
    totals: {
      servicesCount: 0,
      subtotal: 0,
      discount: 0,
      total: 0,
    },
    note: "",
    payment: {
      paymentStatus: "Не оплачено",
      paymentMethod: null,
      paymentLabel: null,
      accountId: null,
      accountNameSnapshot: null,
      paidAt: null,
      paidAmount: null,
      note: null,
    },
  };
}

export function formatDemoOrderDateTime(value: string) {
  return formatDateTime(new Date(value));
}

export function formatDemoOrderDetailDateTime(value: string | null) {
  if (!value) {
    return "—";
  }

  return formatDateTimeWithSeconds(new Date(value));
}

export function formatDemoOrderPaymentDisplay(
  payment: Pick<DemoOrderPaymentSnapshot, "paymentLabel" | "accountNameSnapshot">,
) {
  const seenLabels = new Set<string>();
  const paymentBits = [payment.paymentLabel, payment.accountNameSnapshot]
    .map((value) => normalizeDemoOrderPaymentDisplayValue(value))
    .filter((value): value is string => Boolean(value))
    .filter((value) => {
      const normalizedValue = getNormalizedDemoPaymentComparisonKey(value);

      if (seenLabels.has(normalizedValue)) {
        return false;
      }

      seenLabels.add(normalizedValue);
      return true;
    });

  return paymentBits.join(" · ") || "—";
}

export function buildDemoOrderWorkSummary(order: DemoOrder) {
  if (order.lines.length === 0) {
    return "Услуги ещё не добавлены";
  }

  const preview = order.lines
    .slice(0, 2)
    .map((line) => `${line.serviceNameSnapshot} ${formatPrice(line.unitPrice)} x ${line.quantity}`)
    .join(" + ");

  const remainingCount = order.lines.length - 2;

  if (remainingCount <= 0) {
    return preview;
  }

  return `${preview} + ещё ${remainingCount} поз.`;
}

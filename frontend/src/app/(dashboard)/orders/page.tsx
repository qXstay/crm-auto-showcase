"use client";

import type { ReactNode } from "react";
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Banknote,
  Building2,
  ChevronDown,
  CreditCard,
  Pencil,
  Printer,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import type { CartItem } from "@/features/cashier/types";
import { apiRequest, isApiRequestError } from "@/lib/api/client";
import { readCachedClientResource } from "@/lib/client-resource-cache";
import {
  formatAuthPhoneDisplay,
  formatAuthPhoneInput,
  normalizeAuthPhoneInput,
} from "@/features/auth/storage";
import {
  formatPlateForDisplay,
  getClientDisplayName,
  getClientContractState,
  normalizeInn,
  normalizePlate,
  validateInn,
} from "@/features/clients/client-contract";
import {
  buildSamePlateConfirmationKey,
  coerceClientDuplicateConflict,
  findClientPhoneDuplicate,
  findClientPlateDuplicate,
  type ClientDuplicateConflict,
} from "@/features/clients/client-dedup";
import { createClientViaApi, fetchClientsStore } from "@/features/clients/repository";
import type { ClientVehicle, DemoClient, DemoClientsStore } from "@/features/clients/types";
import { buildClientSearchResults } from "@/features/orders/client-search";
import { PlateInput } from "@/features/orders/components/plate-input";
import { VehicleFleetPicker } from "@/features/orders/components/vehicle-fleet-picker";
import { OrdersTabs } from "@/features/order-draft/components/orders-tabs";
import {
  calculateLineAccrualSnapshot,
  calculateOrderAccrualTotal,
} from "@/features/orders/salary";
import {
  MAX_ORDER_DISCOUNT_PERCENT,
  inferOrderDiscountPercent,
} from "@/features/orders/totals";
import {
  buildDemoOrderClientSnapshotFromDraft,
  calculateDemoOrderTotals,
  formatDemoOrderCarLabel,
  formatDemoOrderClientDisplay,
  getDemoOrderClientDisplayName,
  formatDemoOrderDateTime,
  getDemoOrderPaymentMethodLabel,
  formatDemoOrderShiftLabel,
  clearCurrentDemoOrderId,
  getImportedBackendOrderId,
  getStoredDemoOrderById,
  removeStoredDemoOrder,
  setImportedBackendOrderId,
  setCurrentDemoOrderId,
} from "@/features/orders/storage";
import { VehicleMakeModelPicker } from "@/features/orders/components/vehicle-make-model-picker";
import {
  appendOrderPaymentViaApi,
  createOrderViaApi,
  deleteDraftOrderViaApi,
  fetchOrderExecutorOptions,
  fetchOrderForEditor,
  updateOrderViaApi,
} from "@/features/orders/repository";
import { buildShiftExecutorEntries } from "@/features/orders/utils";
import type { DemoAccountsStore } from "@/features/settings-accounts/types";
import {
  fetchServicesCatalogForOrders,
} from "@/features/services-admin/repository";
import type {
  DemoOrder,
  DemoOrderClientSnapshot,
  DemoOrderPaymentMethod,
  DemoOrderPaymentSnapshot,
  OrderExecutorOption,
} from "@/features/orders/types";
import { RADII, VEHICLE_TYPES, formatPrice } from "@/features/pricing/config";
import { getOrderServicesByCategory, resolveServicesAdminPrice } from "@/features/pricing/resolver";
import type {
  PricingContext,
  PricingInputKind,
  PricingOption,
  PricingSnapshot,
  Radius,
  ResolvedPricing,
  SalaryRuleSnapshot,
  VehicleTypeId,
} from "@/features/pricing/types";
import type {
  DemoServicesStore,
  ServicesAdminService,
} from "@/features/services-admin/types";
import {
  dedupeServicesForOrderSearch,
  normalizeServiceDuplicateName,
} from "@/features/services-admin/duplicates";
import { fetchCurrentShiftForOrderFlow } from "@/features/shifts/repository";
import type { DemoShiftState } from "@/features/shifts/types";
import type { OrderDraft } from "@/features/order-draft/types";

type OrderCategoryTabId = string;

type OrderCategoryTab = {
  id: OrderCategoryTabId;
  label: string;
  sourceCategoryId?: string;
};
type CatalogService = ServicesAdminService;

type Executor = {
  id: string;
  label: string;
  subtitle?: string;
  isLeft?: boolean;
};

type ExecutorChip = {
  id: string;
  label: string;
  amount: number | null;
  isLeft?: boolean;
};

type ExecutorSelectProps = {
  value: string;
  options: Executor[];
  emptyLabel?: string;
  onChange: (value: string) => void;
};

type DemoModalProps = {
  title: string;
  children: ReactNode;
  onClose: () => void;
  actions?: ReactNode;
  maxWidthClassName?: string;
  sheetClassName?: string;
  headerClassName?: string;
  bodyClassName?: string;
  actionsClassName?: string;
};

type PriceEditorState = {
  open: boolean;
  key: string;
  serviceId: string;
  serviceName: string;
  vehicleType: VehicleTypeId;
  vehicleLabel: string;
  radius: Radius;
  lowProfile: boolean;
  runflat: boolean;
  quantity: number;
  inputKind: PricingInputKind;
  priceType: PricingSnapshot["priceType"];
  pricingSnapshot: PricingSnapshot;
  salaryRuleSnapshot: SalaryRuleSnapshot | null;
  costPrice: number | null;
  costPriceValue: string;
  priceOptions: PricingOption[];
  priceValue: string;
  selectedOptionLabel: string;
  operatorNote: string;
};

type PaymentEditorState = {
  method: DemoOrderPaymentMethod;
  accountId: string;
  amountValue: string;
  genericNote: string;
  paymentMethodNote: string;
  internalComment: string;
};

type ClientEditorMode = "existing" | "new" | "anonymous";

type NewClientForm = {
  clientKind: "individual" | "legal";
  fullName: string;
  organizationName: string;
  inn: string;
  contractNumber: string;
  phone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
};

const ORDER_CATEGORY_TABS: OrderCategoryTab[] = [
  { id: "main", label: "Основные услуги", sourceCategoryId: "main" },
  { id: "repair", label: "Ремонт шин", sourceCategoryId: "repair" },
  {
    id: "disks",
    label: "Покраска и ремонт дисков",
    sourceCategoryId: "disks",
  },
  { id: "extra", label: "Дополнительные услуги", sourceCategoryId: "extra" },
  { id: "tpms", label: "Датчики давления", sourceCategoryId: "sensors" },
  { id: "rings", label: "Проставочные кольца", sourceCategoryId: "rings" },
  { id: "storage", label: "Хранение", sourceCategoryId: "storage" },
  { id: "locks", label: "Колёсные секретки", sourceCategoryId: "locks" },
];

const REQUIRED_ORDER_CATEGORY_IDS = ["main", "repair", "disks", "extra"] as const;

function isSuspiciouslyIncompleteOrderCatalog(store: DemoServicesStore) {
  if (store.categories.length === 0) {
    return true;
  }

  const categoriesById = new Map(store.categories.map((category) => [category.id, category]));

  return REQUIRED_ORDER_CATEGORY_IDS.some((categoryId) => {
    const category = categoriesById.get(categoryId);

    return !category || category.services.length === 0;
  });
}

function buildOrderCategoryTabs(categories: DemoServicesStore["categories"]): OrderCategoryTab[] {
  const knownTabsBySourceCategoryId = new Map<string, OrderCategoryTab>(
    ORDER_CATEGORY_TABS.map((tab): [string, OrderCategoryTab] => [
      tab.sourceCategoryId ?? tab.id,
      tab,
    ]),
  );

  return categories.map((category) => {
    const knownTab = knownTabsBySourceCategoryId.get(category.id);

    if (knownTab) {
      return {
        ...knownTab,
        label: category.name,
      };
    }

    return {
      id: `dynamic-${category.id}`,
      label: category.name,
      sourceCategoryId: category.id,
    };
  });
}

const PAYMENT_METHOD_OPTIONS: Array<{
  id: DemoOrderPaymentMethod;
  label: string;
  shortLabel: string;
  hint: string;
  icon: LucideIcon;
}> = [
  { id: "cash", label: "Наличные", shortLabel: "Наличные", hint: "Касса", icon: Banknote },
  {
    id: "card",
    label: "Карта",
    shortLabel: "Карта",
    hint: "Терминал",
    icon: CreditCard,
  },
  {
    id: "transfer",
    label: "Перевод",
    shortLabel: "Перевод",
    hint: "По номеру",
    icon: WalletCards,
  },
  {
    id: "bank_account",
    label: "Расчётный счёт",
    shortLabel: "Расчётный счёт",
    hint: "Юрлицо",
    icon: Building2,
  },
];

const PAYROLL_EXECUTOR_REQUIRED_MESSAGE =
  "Выберите исполнителя, чтобы программа рассчитала зарплату по заказу.";

const EMPTY_PAYMENT_SNAPSHOT: DemoOrderPaymentSnapshot = {
  paymentStatus: "Не оплачено",
  paymentMethod: null,
  paymentLabel: null,
  accountId: null,
  accountNameSnapshot: null,
  paidAt: null,
  paidAmount: null,
  note: null,
  internalComment: null,
};

const EMPTY_NEW_CLIENT_FORM: NewClientForm = {
  clientKind: "individual",
  fullName: "",
  organizationName: "",
  inn: "",
  contractNumber: "",
  phone: "",
  carBrand: "",
  carModel: "",
  plateNumber: "",
};

async function fetchOrderAccountsStore() {
  return readCachedClientResource(
    "order-accounts-store",
    () => apiRequest<DemoAccountsStore>("/api/orders/accounts"),
    { ttlMs: 60_000 },
  );
}

const DEFAULT_ORDER_RECOMMENDATION =
  "Рекомендуем проверять давление в шинах один раз в две недели";
const MAIN_PACKAGE_SERVICE_ID = "main-package";
const MAIN_PACKAGE_WHEEL_COUNT = 4;
const PAYMENT_METHOD_NOTE_PREFIX = "Комментарий к оплате:";
const GENERIC_PAYMENT_NOTE_PREFIX = "Общий комментарий:";

const legacyOrderImportRequests = new Map<string, Promise<DemoOrder>>();
const EDITABLE_ORDER_STATUSES = new Set<DemoOrder["status"]>([
  "Черновик",
  "В работе",
  "Ожидает оплаты",
]);

function getClientPrimaryVehicle(client: DemoClient) {
  return client.vehicles[0] ?? null;
}

function getVehicleLabel(vehicle: Pick<ClientVehicle, "brand" | "model" | "plateNumber">) {
  const brandModel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ").trim();
  const plate = formatPlateForDisplay(vehicle.plateNumber);
  const bits = [brandModel || null, plate || null].filter(Boolean);

  return bits.length > 0 ? bits.join(" · ") : "Не указан";
}

function normalizePlateForVehicleMatch(value: string) {
  return normalizePlate(value);
}

function vehicleMatchesOrderSnapshot(
  vehicle: ClientVehicle,
  snapshot: DemoOrderClientSnapshot,
) {
  const hasSnapshotVehicle = Boolean(
    snapshot.carBrand.trim() || snapshot.carModel.trim() || snapshot.plateNumber.trim(),
  );

  if (!hasSnapshotVehicle) {
    return false;
  }

  return (
    vehicle.brand.trim() === snapshot.carBrand.trim() &&
    vehicle.model.trim() === snapshot.carModel.trim() &&
    normalizePlateForVehicleMatch(vehicle.plateNumber) ===
      normalizePlateForVehicleMatch(snapshot.plateNumber)
  );
}

function findClientVehicleForOrderSnapshot(
  client: DemoClient | null,
  snapshot: DemoOrderClientSnapshot,
) {
  return client?.vehicles.find((vehicle) => vehicleMatchesOrderSnapshot(vehicle, snapshot)) ?? null;
}

function isEditableOrderStatus(status: DemoOrder["status"]) {
  return EDITABLE_ORDER_STATUSES.has(status);
}

function deriveEditorOrderStatus(
  lines: DemoOrder["lines"],
  paymentSnapshot: DemoOrderPaymentSnapshot,
  persistedStatus: DemoOrder["status"],
) {
  if (paymentSnapshot.paymentStatus === "Оплачен") {
    return "Оплачен" as const;
  }

  if (lines.length === 0) {
    return "Черновик" as const;
  }

  if (persistedStatus === "Ожидает оплаты") {
    return "Ожидает оплаты" as const;
  }

  if (persistedStatus === "Выполнен") {
    return "Выполнен" as const;
  }

  return "В работе" as const;
}

function shouldPersistShiftSnapshot(
  paymentSnapshot: DemoOrderPaymentSnapshot,
  orderStatus: DemoOrder["status"],
) {
  return paymentSnapshot.paymentStatus === "Оплачен" || orderStatus === "Выполнен";
}

function getShiftSnapshotForPersist(
  paymentSnapshot: DemoOrderPaymentSnapshot,
  shiftSnapshot: {
    shiftId: string | null;
    shiftLabelSnapshot: string | null;
    shiftOpenedAtSnapshot: string | null;
  },
  orderStatus: DemoOrder["status"],
) {
  if (!shouldPersistShiftSnapshot(paymentSnapshot, orderStatus)) {
    return {
      shiftId: null,
      shiftLabelSnapshot: null,
      shiftOpenedAtSnapshot: null,
    };
  }

  return shiftSnapshot;
}

function getClientPreferredRadius(client: DemoClient): Radius | "" {
  const radius = getClientPrimaryVehicle(client)?.radius;

  return radius && RADII.includes(radius as Radius) ? (radius as Radius) : "";
}

function getVehiclePreferredRadius(
  vehicle: Pick<ClientVehicle, "radius"> | null | undefined,
): Radius | "" {
  const radius = vehicle?.radius;

  return radius && RADII.includes(radius as Radius) ? (radius as Radius) : "";
}

function createSeedOrderFromClientSnapshot(
  clientSnapshot: DemoOrderClientSnapshot,
): DemoOrder {
  const now = new Date().toISOString();

  return {
    id: `seed-order-${crypto.randomUUID()}`,
    number: "",
    createdAt: now,
    updatedAt: now,
    status: "Черновик",
    client: clientSnapshot,
    vehicleType: "passenger",
    radius: "R16",
    lowProfile: false,
    runflat: false,
    executorId: null,
    executorEmployeeId: null,
    executorNameSnapshot: null,
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
    note: DEFAULT_ORDER_RECOMMENDATION,
    payment: {
      paymentStatus: "Не оплачено",
      paymentMethod: null,
      paymentLabel: null,
      accountId: null,
      accountNameSnapshot: null,
      paidAt: null,
      paidAmount: null,
      note: null,
      internalComment: null,
    },
  };
}

function getExistingClientSearchLabel(client: DemoClient) {
  const vehicle = getClientPrimaryVehicle(client);
  const carLabel = vehicle ? getVehicleLabel(vehicle) : "";

  return [client.name, carLabel].filter(Boolean).join(" · ");
}

function DuplicateClientWarning({
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
  const title =
    conflict.kind === "plate"
      ? conflict.requiresConfirmation
        ? "Такой госномер уже есть у другой машины."
        : `Госномер ${conflict.plateNumber} уже есть в базе.`
      : `Телефон ${conflict.phone} уже есть в базе.`;
  const detail =
    conflict.kind === "plate"
      ? conflict.requiresConfirmation
        ? "Можно выбрать существующий автомобиль или создать отдельный."
        : conflict.sameClient
        ? "Выберите существующий автомобиль в автопарке клиента, чтобы не создавать дубль."
        : `Он привязан к клиенту ${conflict.clientName}. Выберите существующего клиента/автомобиль.`
      : `Он привязан к клиенту ${conflict.clientName}. Выберите существующего клиента.`;

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

function getDuplicateConflictFromApiError(error: unknown) {
  if (!isApiRequestError(error) || error.status !== 409) {
    return null;
  }

  return coerceClientDuplicateConflict(error.payload?.duplicate);
}

function getApiErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getCatalogServiceUnitLabel(service: CatalogService) {
  if (service.id === MAIN_PACKAGE_SERVICE_ID) {
    return "за 1 колесо";
  }

  if (service.priceType === "matrix" || service.pricingMode === "package") {
    return "за 1 колесо";
  }

  return "за 1 позицию";
}

function isMainPackageService(
  service: Pick<CatalogService, "id"> | Pick<CartItem, "serviceId">,
) {
  return ("id" in service ? service.id : service.serviceId) === MAIN_PACKAGE_SERVICE_ID;
}

function getMainPackagePerWheelPrice(price: number) {
  return price / MAIN_PACKAGE_WHEEL_COUNT;
}

function getQuickQuantityOptions(
  service: CatalogService,
  selectedVehicleType: VehicleTypeId,
) {
  if (
    selectedVehicleType === "commercial" &&
    service.categoryId === "main" &&
    (service.priceType === "matrix" || service.pricingMode === "package")
  ) {
    return [1, 2, 3, 4, 5, 6];
  }

  return [1, 2, 3, 4];
}


function requiresDedicatedPaymentComment(method: DemoOrderPaymentMethod) {
  return method === "bank_account";
}

function getPaymentCommentFieldCopy(method: DemoOrderPaymentMethod) {
  if (method === "bank_account") {
    return {
      label: "Комментарий к способу оплаты",
      placeholder: "Например: счёт №45 от 01.04.2026",
    };
  }

  return {
    label: "Комментарий",
    placeholder: "Например: оплата по QR",
  };
}

function decomposePaymentNote(
  note: string | null | undefined,
): Pick<PaymentEditorState, "genericNote" | "paymentMethodNote"> {
  const value = (note ?? "").trim();

  if (!value) {
    return {
      genericNote: "",
      paymentMethodNote: "",
    };
  }

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let genericNote = "";
  let paymentMethodNote = "";

  for (const line of lines) {
    if (line.startsWith(PAYMENT_METHOD_NOTE_PREFIX)) {
      paymentMethodNote = line.slice(PAYMENT_METHOD_NOTE_PREFIX.length).trim();
      continue;
    }

    if (line.startsWith(GENERIC_PAYMENT_NOTE_PREFIX)) {
      genericNote = line.slice(GENERIC_PAYMENT_NOTE_PREFIX.length).trim();
      continue;
    }
  }

  if (!genericNote && !paymentMethodNote) {
    genericNote = value;
  }

  return { genericNote, paymentMethodNote };
}

function composePaymentNote(input: {
  genericNote: string;
  paymentMethodNote: string;
}) {
  const genericNote = input.genericNote.trim();
  const paymentMethodNote = input.paymentMethodNote.trim();

  if (genericNote && paymentMethodNote) {
    return `${PAYMENT_METHOD_NOTE_PREFIX} ${paymentMethodNote}\n${GENERIC_PAYMENT_NOTE_PREFIX} ${genericNote}`;
  }

  if (paymentMethodNote) {
    return paymentMethodNote;
  }

  if (genericNote) {
    return genericNote;
  }

  return "";
}

function hasPayrollRelevantCartItems(cartItems: CartItem[]) {
  return cartItems.some(
    (item) => item.salaryRuleSnapshot !== null || item.salaryAccrualSnapshot !== null,
  );
}

function getPaymentRemainingAmount(paymentSnapshot: DemoOrderPaymentSnapshot, orderTotal: number) {
  const paidTotal =
    typeof paymentSnapshot.paidTotal === "number" && Number.isFinite(paymentSnapshot.paidTotal)
      ? paymentSnapshot.paidTotal
      : paymentSnapshot.paymentStatus === "Оплачен"
        ? orderTotal
        : paymentSnapshot.paidAmount ?? 0;

  const calculatedRemainingAmount = Math.max(
    0,
    Math.round((orderTotal - paidTotal) * 100) / 100,
  );

  return calculatedRemainingAmount;
}

function getCompleteOrderUnavailableReason(input: {
  cartItemsCount: number;
  hasOrderClient: boolean;
  hasSelectedExecutor: boolean;
  hasCurrentShift: boolean;
  orderStatus: DemoOrder["status"];
  paymentStatus: DemoOrderPaymentSnapshot["paymentStatus"];
  discountInputError: string;
}) {
  if (input.paymentStatus === "Оплачен") {
    return "Заказ уже оплачен. Повторно выполнять его не нужно.";
  }

  if (input.orderStatus === "Выполнен") {
    return "Заказ уже выполнен без оплаты. Позднюю оплату можно принять через «Принять оплату».";
  }

  if (input.cartItemsCount === 0) {
    return "Добавьте хотя бы одну услугу, чтобы выполнить заказ.";
  }

  if (!input.hasOrderClient) {
    return "Выберите клиента или анонимный сценарий перед выполнением заказа.";
  }

  if (!input.hasCurrentShift) {
    return "Смена закрыта или не открыта. Откройте текущую смену, чтобы выполнить заказ.";
  }

  if (!input.hasSelectedExecutor) {
    return "Выберите исполнителя из состава текущей смены.";
  }

  if (input.discountInputError) {
    return input.discountInputError;
  }

  return "";
}

function getCartItemUnitMeta(item: CartItem) {
  if (item.serviceId === MAIN_PACKAGE_SERVICE_ID) {
    return "за 1 колесо";
  }

  return null;
}

/**
 * DemoModal — thin alias to the shared Modal component.
 * Kept for backward compatibility with existing JSX in this file.
 * New components should import Modal directly from @/components/ui.
 */
const DemoModal = ({
  title,
  children,
  onClose,
  actions,
  maxWidthClassName = "sm:max-w-[420px]",
  sheetClassName,
  headerClassName,
  bodyClassName,
  actionsClassName,
}: DemoModalProps) => (
  <Modal
    title={title}
    onClose={onClose}
    actions={actions}
    maxWidthClass={maxWidthClassName}
    sheetClassName={sheetClassName}
    headerClassName={headerClassName}
    bodyClassName={bodyClassName}
    actionsClassName={actionsClassName}
  >
    {children}
  </Modal>
);

function getCatalogServiceId(item: CatalogService) {
  return item.id;
}

function getCatalogServiceName(item: CatalogService) {
  return item.name;
}

function getCatalogServiceDescription(item: CatalogService) {
  return item.displayPriceLabel;
}

function buildCartItemKey(
  serviceId: string,
  vehicleType: VehicleTypeId,
  radius: Radius,
  lowProfile: boolean,
  runflat: boolean,
) {
  return `${serviceId}:${vehicleType}:${radius}:${lowProfile ? "lp" : "std"}:${runflat ? "rf" : "base"}`;
}

function createPricingOperatorNote(
  inputKind: PricingInputKind,
  selectedOptionLabel: string,
  customNote: string,
) {
  const trimmedNote = customNote.trim();

  if (trimmedNote) {
    return trimmedNote;
  }

  if (selectedOptionLabel) {
    return `Выбран тариф: ${selectedOptionLabel}`;
  }

  return inputKind === "manual"
    ? "Свободная цена задана оператором"
    : "Цена уточнена оператором";
}

function parsePriceInput(value: string) {
  const normalized = value.replace(",", ".").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed);
}

function parseDiscountPercentInput(value: string) {
  const normalized = value.replace(",", ".").trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_ORDER_DISCOUNT_PERCENT) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function formatDiscountPercentInput(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "0";
  }

  return String(Math.round(value * 100) / 100).replace(".", ",");
}

function parseOptionalPriceInput(value: string) {
  const normalized = value.replace(",", ".").trim();

  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function usesCostPriceRule(snapshot: SalaryRuleSnapshot | null) {
  return snapshot?.ruleType === "percent_of_profit" && snapshot.usesCostPrice === true;
}

function resolveCatalogServicePricing(
  item: CatalogService,
  context: PricingContext,
) {
  return resolveServicesAdminPrice(item, context);
}

function formatItemParameters(item: Pick<CartItem, "vehicleLabel" | "radius" | "lowProfile" | "runflat">) {
  const formattedRadius =
    item.vehicleLabel === "Коммерческий"
      ? formatRadiusDisplayLabel("commercial", item.radius)
      : item.radius;

  return [
    item.vehicleLabel,
    formattedRadius,
    item.lowProfile ? "Низкий профиль" : null,
    item.runflat ? "RunFlat" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatRadiusDisplayLabel(
  vehicleType: VehicleTypeId,
  radius: Radius,
) {
  return vehicleType === "commercial" && ["R13", "R14", "R15", "R16"].includes(radius)
    ? `${radius}C`
    : radius;
}

function buildRadiusOptions(vehicleType: VehicleTypeId): Array<{
  value: Radius;
  label: string;
}> {
  if (vehicleType === "commercial") {
    return (["R13", "R14", "R15", "R16"] satisfies Radius[]).map((radius) => ({
      value: radius,
      label: `${radius}C`,
    }));
  }

  if (vehicleType === "passenger" || vehicleType === "suv") {
    return RADII.filter((radius) => radius !== "R23").map((radius) => ({
      value: radius,
      label: radius,
    }));
  }

  return RADII.map((radius) => ({
    value: radius,
    label: radius,
  }));
}

function resolveRadiusForVehicleType(
  vehicleType: VehicleTypeId,
  currentRadius: Radius,
): Radius {
  const options = buildRadiusOptions(vehicleType);

  if (options.some((option) => option.value === currentRadius)) {
    return currentRadius;
  }

  if (vehicleType === "commercial") {
    return "R16";
  }

  if ((vehicleType === "passenger" || vehicleType === "suv") && currentRadius === "R23") {
    return "R22";
  }

  return options[options.length - 1]?.value ?? currentRadius;
}

function buildExecutorOptions(
  currentShift: DemoShiftState["currentShift"],
): Executor[] {
  return buildShiftExecutorEntries(currentShift).map((entry) => ({
    id: entry.id,
    label: entry.label,
    subtitle: entry.subtitle,
    isLeft: entry.isLeft,
  }));
}

function mapOrderExecutorOptions(options: OrderExecutorOption[]): Executor[] {
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    subtitle: option.subtitle,
  }));
}

function mergeExecutorOptions(optionGroups: Executor[][]): Executor[] {
  const merged = new Map<string, Executor>();

  for (const group of optionGroups) {
    for (const option of group) {
      if (!option.id || merged.has(option.id)) {
        continue;
      }

      merged.set(option.id, option);
    }
  }

  return [...merged.values()];
}

function getExecutorSearchText(option: Executor) {
  return [option.label, option.subtitle].filter(Boolean).join(" ").toLowerCase();
}

function filterExecutorOptions(options: Executor[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return options.slice(0, 8);
  }

  return options
    .filter((option) => getExecutorSearchText(option).includes(normalizedQuery))
    .slice(0, 8);
}

function ExecutorSelect({
  value,
  options,
  emptyLabel = "Нет сотрудников в смене",
  onChange,
}: ExecutorSelectProps) {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const availableOptions =
    options.length > 0 ? options : [{ id: "", label: emptyLabel }];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedExecutor =
    availableOptions.find((executor) => executor.id === value) ?? availableOptions[0];

  return (
    <div
      ref={dropdownRef}
      className="relative w-full sm:min-w-[178px]"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={options.length === 0}
        className="flex h-10 w-full items-center justify-between border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)]"
      >
        <span className="min-w-0 truncate">{selectedExecutor.label}</span>
        <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
      </button>

      {open ? (
        <div className="absolute bottom-full right-0 z-20 mb-1 min-w-full overflow-hidden border border-[color:var(--border)] bg-white">
          {availableOptions.map((executor) => {
            const isSelected = executor.id === value;

            return (
              <button
                key={executor.id}
                type="button"
                onClick={() => {
                  onChange(executor.id);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-[14px]",
                  isSelected
                    ? "bg-[color:var(--primary)]/5 text-[color:var(--primary)]"
                    : executor.isLeft
                      ? "text-[color:var(--muted)] hover:bg-[color:var(--background)]"
                      : "text-[color:var(--foreground)] hover:bg-[color:var(--background)]",
                )}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{executor.label}</span>
                    {executor.isLeft ? (
                      <span
                        className={clsx(
                          "shrink-0 border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                          isSelected
                            ? "border-[color:var(--primary)]/30 text-[color:var(--primary)]"
                            : "border-[color:var(--border)] text-[color:var(--muted)]",
                        )}
                      >
                        ушёл
                      </span>
                    ) : null}
                  </div>
                  {executor.subtitle ? (
                    <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {executor.subtitle}
                    </div>
                  ) : null}
                </div>
                <span
                  className={clsx(
                    "text-xs",
                    isSelected ? "text-[color:var(--primary)]" : "text-transparent",
                  )}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clientDropdownRef = useRef<HTMLDivElement | null>(null);
  const orderSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const orderPersistQueueRef = useRef<Promise<DemoOrder | null>>(Promise.resolve(null));
  const paymentActionHandledRef = useRef<string | null>(null);
  const bootstrapOrderCreateRef = useRef<{
    key: string;
    promise: Promise<DemoOrder>;
  } | null>(null);
  const blockedInitializationKeyRef = useRef<string | null>(null);
  const quickServiceApplyRef = useRef<string | null>(null);
  const isHydratingOrderRef = useRef(false);
  const isProcessingPaymentRef = useRef(false);
  const prevOrderIdRef = useRef<string | null>(null);
  const lastPersistedSnapshotRef = useRef<string | null>(null);
  const [orderId, setOrderId] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [orderCreatedAt, setOrderCreatedAt] = useState("");
  const [persistedOrderStatus, setPersistedOrderStatus] = useState<DemoOrder["status"]>("Черновик");
  const [orderClient, setOrderClient] = useState<DemoOrderClientSnapshot | null>(
    null,
  );
  const [vehicleType, setVehicleType] = useState<VehicleTypeId>("passenger");
  const [radius, setRadius] = useState<Radius>("R16");
  const [lowProfile, setLowProfile] = useState(false);
  const [runflat, setRunflat] = useState(false);
  const [activeCategoryId, setActiveCategoryId] =
    useState<OrderCategoryTabId>("main");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [executorIds, setExecutorIds] = useState<string[]>([]);
  const [payment, setPayment] = useState<DemoOrderPaymentSnapshot>(
    EMPTY_PAYMENT_SNAPSHOT,
  );
  const [discountPercentValue, setDiscountPercentValue] = useState("0");
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [shiftGuardModalOpen, setShiftGuardModalOpen] = useState(false);
  const [isOpeningPaymentModal, setIsOpeningPaymentModal] = useState(false);
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [showExecutorSelect, setShowExecutorSelect] = useState(false);
  const [orderExecutorOptions, setOrderExecutorOptions] = useState<Executor[]>([]);
  const [storedExecutorOptions, setStoredExecutorOptions] = useState<Executor[]>([]);
  const [executorSearchValue, setExecutorSearchValue] = useState("");
  const [executorOptionsReady, setExecutorOptionsReady] = useState(false);
  const [executorOptionsError, setExecutorOptionsError] = useState<string | null>(null);
  const [accountsStore, setAccountsStore] = useState<DemoAccountsStore>({ accounts: [] });
  const [servicesStore, setServicesStore] = useState<DemoServicesStore>({ categories: [] });
  const [servicesCatalogReady, setServicesCatalogReady] = useState(false);
  const [servicesCatalogError, setServicesCatalogError] = useState<string | null>(null);
  const [clientsStore, setClientsStore] = useState<DemoClientsStore>({ clients: [] });
  const [clientsLookupReady, setClientsLookupReady] = useState(false);
  const [priceEditorState, setPriceEditorState] = useState<PriceEditorState | null>(
    null,
  );
  const [paymentEditorState, setPaymentEditorState] = useState<PaymentEditorState>({
    method: "cash",
    accountId: "",
    amountValue: "",
    genericNote: "",
    paymentMethodNote: "",
    internalComment: "",
  });
  const [deleteDraftConfirmOpen, setDeleteDraftConfirmOpen] = useState(false);
  const [clientEditorOpen, setClientEditorOpen] = useState(false);
  const [clientEditorMode, setClientEditorMode] = useState<ClientEditorMode>("existing");
  const [selectedClientId, setSelectedClientId] = useState("anonymous");
  const [clientSearchValue, setClientSearchValue] = useState("");
  const [clientDropdownOpen, setClientDropdownOpen] = useState(false);
  const [clientForm, setClientForm] = useState<NewClientForm>(EMPTY_NEW_CLIENT_FORM);
  const [clientEditorError, setClientEditorError] = useState("");
  const [orderInitializationError, setOrderInitializationError] = useState("");
  const [orderInitializationDuplicateConflict, setOrderInitializationDuplicateConflict] =
    useState<ClientDuplicateConflict | null>(null);
  const [orderEditorError, setOrderEditorError] = useState("");
  const [paymentEditorError, setPaymentEditorError] = useState("");
  const [confirmedSamePlateKey, setConfirmedSamePlateKey] = useState("");
  const [orderRecommendation, setOrderRecommendation] = useState("");
  const [orderReady, setOrderReady] = useState(false);
  const [shiftContextReady, setShiftContextReady] = useState(false);
  const [didInitSeedExecutors, setDidInitSeedExecutors] = useState(false);
  const [currentShift, setCurrentShift] = useState<DemoShiftState["currentShift"] | null>(null);
  const [orderShiftId, setOrderShiftId] = useState<string | null>(null);
  const [orderShiftLabelSnapshot, setOrderShiftLabelSnapshot] = useState<string | null>(
    null,
  );
  const [orderShiftOpenedAtSnapshot, setOrderShiftOpenedAtSnapshot] = useState<string | null>(
    null,
  );
  const [catalogSearchQuery, setCatalogSearchQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const queryOrderId = searchParams.get("id");
  const queryClientId = searchParams.get("clientId");
  const queryMode = searchParams.get("mode");
  const queryAction = searchParams.get("action") ?? "";
  const queryQuickServiceId = searchParams.get("quickService");
  const queryClientKind = searchParams.get("clientKind");
  const queryOrganizationName = searchParams.get("organizationName") ?? "";
  const queryInn = searchParams.get("inn") ?? "";
  const queryContractNumber = searchParams.get("contractNumber") ?? "";
  const queryVehicleId = searchParams.get("vehicleId") ?? "";
  const queryCarBrand = searchParams.get("carBrand") ?? "";
  const queryCarModel = searchParams.get("carModel") ?? "";
  const queryPlateNumber = searchParams.get("plateNumber") ?? "";
  const queryAllowSamePlateDifferentVehicle =
    searchParams.get("allowSamePlateDifferentVehicle") === "1";
  const bootstrapIntentKey = queryOrderId
    ? null
    : queryMode === "anonymous"
      ? JSON.stringify({
          mode: "anonymous",
          carBrand: queryCarBrand,
          carModel: queryCarModel,
          plateNumber: queryPlateNumber,
          allowSamePlateDifferentVehicle: queryAllowSamePlateDifferentVehicle,
        })
      : queryClientId
        ? JSON.stringify({
            mode: "client",
            clientId: queryClientId,
            clientKind: queryClientKind,
            organizationName: queryOrganizationName,
            inn: queryInn,
            contractNumber: queryContractNumber,
            vehicleId: queryVehicleId,
            carBrand: queryCarBrand,
            carModel: queryCarModel,
            plateNumber: queryPlateNumber,
            allowSamePlateDifferentVehicle: queryAllowSamePlateDifferentVehicle,
          })
        : null;

  const shiftExecutorOptions = useMemo(
    () => buildExecutorOptions(currentShift),
    [currentShift],
  );
  const shiftExecutorIds = useMemo(
    () => new Set(shiftExecutorOptions.map((executor) => executor.id)),
    [shiftExecutorOptions],
  );
  const executorOptions = useMemo(
    () => mergeExecutorOptions([
      shiftExecutorOptions,
      orderExecutorOptions,
      storedExecutorOptions,
    ]),
    [orderExecutorOptions, shiftExecutorOptions, storedExecutorOptions],
  );
  const otherExecutorOptions = useMemo(
    () => executorOptions.filter((executor) => !shiftExecutorIds.has(executor.id)),
    [executorOptions, shiftExecutorIds],
  );
  const filteredOtherExecutorOptions = useMemo(
    () => filterExecutorOptions(otherExecutorOptions, executorSearchValue),
    [executorSearchValue, otherExecutorOptions],
  );
  const defaultExecutorIds = useMemo(() => {
    const activeShiftExecutors = shiftExecutorOptions.filter((e) => !e.isLeft);
    if (activeShiftExecutors.length > 0) {
      return activeShiftExecutors.map((e) => e.id);
    }
    const fallback = executorOptions[0]?.id;
    return fallback ? [fallback] : [];
  }, [shiftExecutorOptions, executorOptions]);
  const selectedVehicle =
    VEHICLE_TYPES.find((item) => item.id === vehicleType) ?? VEHICLE_TYPES[0];
  const isCommercialVehicle = vehicleType === "commercial";
  const selectedExecutor =
    executorOptions.find((executor) => executor.id === executorIds[0]) ?? {
      id: "",
      label: "Не указан",
    };
  const orderCategoryTabs = buildOrderCategoryTabs(servicesStore.categories);
  const currentShiftLabel = currentShift
    ? formatDemoOrderShiftLabel(currentShift.number, currentShift.openedAt)
    : orderShiftLabelSnapshot;
  const currentShiftFooterLabel = currentShiftLabel
    ? currentShiftLabel.startsWith("Смена")
      ? currentShiftLabel
      : `Смена ${currentShiftLabel}`
    : null;
  const activeShiftSnapshot = currentShift
    ? {
        shiftId: currentShift.id,
        shiftLabelSnapshot: formatDemoOrderShiftLabel(currentShift.number, currentShift.openedAt),
        shiftOpenedAtSnapshot: currentShift.openedAt,
      }
    : {
        shiftId: orderShiftId,
        shiftLabelSnapshot: orderShiftLabelSnapshot,
        shiftOpenedAtSnapshot: orderShiftOpenedAtSnapshot,
      };
  const radiusOptions = useMemo(
    () => buildRadiusOptions(vehicleType),
    [vehicleType],
  );
  const executorChips = useMemo<ExecutorChip[]>(
    () =>
      buildShiftExecutorEntries(currentShift).map((entry) => ({
        id: entry.id,
        label: entry.label,
        amount: entry.amount,
        isLeft: entry.isLeft,
      })),
    [currentShift],
  );
  const hasSelectedLeftExecutor = executorChips.some(
    (chip) => chip.isLeft && executorIds.includes(chip.id),
  );
  const hasSelectedOutsideShiftExecutor = executorIds.some(
    (id) => !shiftExecutorIds.has(id),
  );

  const applyOrderSnapshot = useCallback((storedOrder: DemoOrder) => {
    const lowProfile = storedOrder.runflat ? false : storedOrder.lowProfile;

    lastPersistedSnapshotRef.current = JSON.stringify(storedOrder);
    startTransition(() => {
      setOrderId(storedOrder.id);
      setOrderNumber(storedOrder.number);
      setOrderCreatedAt(storedOrder.createdAt);
      setPersistedOrderStatus(storedOrder.status);
      setOrderClient(storedOrder.client);
      setVehicleType(storedOrder.vehicleType);
      setRadius(storedOrder.radius);
      setLowProfile(lowProfile);
      setRunflat(storedOrder.runflat);
      setCartItems(storedOrder.lines);
      setDiscountPercentValue(formatDiscountPercentInput(
        storedOrder.totals.discountPercent ??
          inferOrderDiscountPercent({
            subtotal: storedOrder.totals.subtotal,
            discount: storedOrder.totals.discount,
          }),
      ));
      setStoredExecutorOptions(
        storedOrder.executors
          ?.flatMap((executor) =>
            executor.employeeId
              ? [{
                  id: executor.employeeId,
                  label: executor.employeeNameSnapshot || "Сотрудник",
                  subtitle: "Сохранён в заказе",
                }]
              : [],
          )
          ?? [],
      );
      setExecutorIds(
        storedOrder.executors?.length
          ? storedOrder.executors
              .map((e) => e.employeeId)
              .filter((id): id is string => Boolean(id))
          : storedOrder.executorEmployeeId
            ? [storedOrder.executorEmployeeId]
            : storedOrder.executorId
              ? [storedOrder.executorId as string]
              : [],
      );
      setOrderShiftId(storedOrder.shiftId);
      setOrderShiftLabelSnapshot(storedOrder.shiftLabelSnapshot);
      setOrderShiftOpenedAtSnapshot(storedOrder.shiftOpenedAtSnapshot);
      setOrderRecommendation(storedOrder.note || "");
      setPayment(storedOrder.payment);
      setOrderReady(true);
    });
  }, []);

  const syncLocalOrderMirror = useCallback((storedOrder: DemoOrder) => {
    setCurrentDemoOrderId(storedOrder.id);
  }, []);

  const refreshCurrentShiftContext = useCallback(async () => {
    try {
      const nextCurrentShift = (await fetchCurrentShiftForOrderFlow()).currentShift;

      setCurrentShift(nextCurrentShift);

      return nextCurrentShift;
    } catch (error) {
      console.error("Не удалось получить текущую смену для выбора исполнителя.", error);
      setCurrentShift(null);
      return null;
    } finally {
      setShiftContextReady(true);
    }
  }, []);

  const refreshOrderExecutorOptions = useCallback(async () => {
    try {
      const result = await fetchOrderExecutorOptions();

      setOrderExecutorOptions(mapOrderExecutorOptions(result.executors));
      setExecutorOptionsError(null);
    } catch (error) {
      console.error("Не удалось получить список исполнителей заказа.", error);
      setOrderExecutorOptions([]);
      setExecutorOptionsError("Не удалось загрузить общий список исполнителей.");
    } finally {
      setExecutorOptionsReady(true);
    }
  }, []);

  const importLegacyOrderOnce = useCallback(async (
    legacyOrderId: string,
    seedOrder: DemoOrder,
  ) => {
    const existingPromise = legacyOrderImportRequests.get(legacyOrderId);

    if (existingPromise) {
      return existingPromise;
    }

    const createPromise = createOrderViaApi(seedOrder)
      .then((createdOrder) => {
        setImportedBackendOrderId(legacyOrderId, createdOrder.order.id);
        return createdOrder.order;
      })
      .finally(() => {
        legacyOrderImportRequests.delete(legacyOrderId);
      });

    legacyOrderImportRequests.set(legacyOrderId, createPromise);

    return createPromise;
  }, []);

  const clearPendingAutosave = useCallback(() => {
    if (orderSaveTimeoutRef.current) {
      clearTimeout(orderSaveTimeoutRef.current);
      orderSaveTimeoutRef.current = null;
    }
  }, []);

  const persistOrderImmediately = useCallback(async (
    snapshot: DemoOrder,
    options?: {
      clearPendingAutosave?: boolean;
      allowSamePlateDifferentVehicle?: boolean;
    },
  ) => {
    if (options?.clearPendingAutosave !== false) {
      clearPendingAutosave();
    }

    const persistPromise = orderPersistQueueRef.current
      .catch(() => null)
      .then(async () => {
        const result = await updateOrderViaApi(snapshot.id, snapshot, {
          allowSamePlateDifferentVehicle: options?.allowSamePlateDifferentVehicle,
        });
        setPersistedOrderStatus(result.order.status);
        setOrderEditorError("");
        lastPersistedSnapshotRef.current = JSON.stringify(result.order);
        syncLocalOrderMirror(result.order);
        return result.order;
      });

    orderPersistQueueRef.current = persistPromise.then(
      () => null,
      () => null,
    );

    return persistPromise;
  }, [clearPendingAutosave, syncLocalOrderMirror]);

  useEffect(() => {
    let cancelled = false;

    void Promise.allSettled([
      fetchOrderAccountsStore(),
      fetchClientsStore(),
    ]).then(([accountsResult, clientsResult]) => {
      if (cancelled) {
        return;
      }

      if (accountsResult.status === "fulfilled") {
        setAccountsStore(accountsResult.value);
      } else {
        console.error("Не удалось загрузить счета для кассы.", accountsResult.reason);
      }

      if (clientsResult.status === "fulfilled") {
        setClientsStore(clientsResult.value);
      } else {
        console.error("Не удалось загрузить клиентов для кассы.", clientsResult.reason);
      }

      setClientsLookupReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    void refreshOrderExecutorOptions();
  }, [refreshOrderExecutorOptions]);

  useEffect(() => {
    let cancelled = false;

    async function loadCatalog() {
      try {
        let store = await fetchServicesCatalogForOrders();

        if (cancelled) {
          return;
        }

        if (isSuspiciouslyIncompleteOrderCatalog(store)) {
          await new Promise((resolve) => setTimeout(resolve, 150));

          if (cancelled) {
            return;
          }

          store = await fetchServicesCatalogForOrders();

          if (cancelled) {
            return;
          }
        }

        if (isSuspiciouslyIncompleteOrderCatalog(store)) {
          setServicesStore({ categories: [] });
          setServicesCatalogError("Каталог услуг загружен не полностью. Обновите страницу.");
          return;
        }

        setServicesStore(store);
        setServicesCatalogError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }

        console.error("Не удалось загрузить каталог услуг для кассы.", error);
        setServicesStore({ categories: [] });
        setServicesCatalogError(
          error instanceof Error ? error.message : "Не удалось загрузить каталог услуг.",
        );
      } finally {
        if (!cancelled) {
          setServicesCatalogReady(true);
        }
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (orderCategoryTabs.length === 0) {
      return;
    }

    if (!orderCategoryTabs.some((tab) => tab.id === activeCategoryId)) {
      setActiveCategoryId(orderCategoryTabs[0].id);
    }
  }, [activeCategoryId, orderCategoryTabs]);

  useEffect(() => {
    const nextRadius = resolveRadiusForVehicleType(vehicleType, radius);

    if (nextRadius !== radius) {
      setRadius(nextRadius);
    }
  }, [radius, vehicleType]);

  useEffect(() => {
    if (!shiftContextReady || !orderReady) {
      return;
    }

    if (!currentShift) {
      if (executorIds.length > 0) {
        setExecutorIds([]);
      }
      return;
    }

    const availableIds = new Set(executorOptions.map((e) => e.id));
    if (availableIds.size === 0) {
      if (executorIds.length > 0) {
        setExecutorIds([]);
      }
      return;
    }

    const filtered = executorIds.filter((id) => availableIds.has(id));
    if (filtered.length !== executorIds.length) {
      setExecutorIds(filtered);
    }
  }, [currentShift, executorIds, executorOptions, orderReady, shiftContextReady]);

  useEffect(() => {
    if (!orderReady || !shiftContextReady) return;

    if (!didInitSeedExecutors && executorOptions.length > 0) {
      if (executorIds.length === 0 && defaultExecutorIds.length > 0) {
        setExecutorIds(defaultExecutorIds);
      }
      setDidInitSeedExecutors(true);
    }
  }, [orderReady, shiftContextReady, executorIds.length, didInitSeedExecutors, defaultExecutorIds, executorOptions.length]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!clientDropdownRef.current?.contains(event.target as Node)) {
        setClientDropdownOpen(false);
        setClientSearchValue("");
      }
    }

    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  useEffect(() => {
    if (
      bootstrapOrderCreateRef.current &&
      bootstrapOrderCreateRef.current.key !== bootstrapIntentKey
    ) {
      bootstrapOrderCreateRef.current = null;
    }
  }, [bootstrapIntentKey]);

  useEffect(() => {
    let cancelled = false;

    async function initializeOrder() {
      isHydratingOrderRef.current = true;
      setOrderReady(false);
      setShiftContextReady(false);
      setDidInitSeedExecutors(false);
      const hasBootstrapIntent = !queryOrderId && (queryMode === "anonymous" || Boolean(queryClientId));

      const requestedOrderId = queryOrderId;
      const initializationKey = requestedOrderId
        ? `order:${requestedOrderId}`
        : hasBootstrapIntent
          ? `bootstrap:${bootstrapIntentKey ?? ""}`
          : "none";

      if (blockedInitializationKeyRef.current === initializationKey) {
        isHydratingOrderRef.current = false;
        setShiftContextReady(true);
        return;
      }

      setOrderInitializationError("");
      setOrderInitializationDuplicateConflict(null);

      if (queryClientId && !clientsLookupReady) {
        isHydratingOrderRef.current = false;
        return;
      }

      if (!requestedOrderId && !hasBootstrapIntent) {
        if (!cancelled) {
          router.replace("/orders/new");
        }
        isHydratingOrderRef.current = false;
        return;
      }

      try {
        let storedOrder: DemoOrder | null = null;
        const legacyRequestedOrderId =
          requestedOrderId && requestedOrderId.startsWith("demo-order-")
            ? requestedOrderId
            : null;
        const importedBackendOrderId = legacyRequestedOrderId
          ? getImportedBackendOrderId(legacyRequestedOrderId)
          : null;
        const backendOrderIdToLoad = importedBackendOrderId ?? (
          legacyRequestedOrderId ? null : requestedOrderId
        );

        if (backendOrderIdToLoad) {
          try {
            storedOrder = (await fetchOrderForEditor(backendOrderIdToLoad)).order;
          } catch {
            storedOrder = null;
          }
        }

        if (!storedOrder && requestedOrderId) {
          if (legacyRequestedOrderId && importedBackendOrderId) {
            if (!cancelled) {
              router.replace("/orders/new");
            }
            return;
          }

          if (!legacyRequestedOrderId) {
            if (!cancelled) {
              router.replace("/orders/new");
            }
            return;
          }

          const localSeedOrder = getStoredDemoOrderById(legacyRequestedOrderId);

          if (!localSeedOrder) {
            if (!cancelled) {
              router.replace("/orders/new");
            }
            return;
          }

          storedOrder = await importLegacyOrderOnce(
            legacyRequestedOrderId,
            localSeedOrder,
          );
        }

        if (!storedOrder && hasBootstrapIntent) {
          const bootstrapKey = bootstrapIntentKey ?? "anonymous";
          const clientSnapshot =
            queryMode === "anonymous"
              ? buildDemoOrderClientSnapshotFromDraft({
                  mode: "anonymous",
                  selectedClientId: "anonymous",
                  clientName: "",
                  phone: "",
                  carBrand: queryCarBrand.trim(),
                  carModel: queryCarModel.trim(),
                  plateNumber: queryPlateNumber.trim(),
                  preferredRadius: "",
                })
              : (() => {
                  const selectedClient = clientsStore.clients.find(
                    (client) => client.id === queryClientId,
                  );

                  if (!selectedClient) {
                    return null;
                  }

                  const queryVehicle =
                    selectedClient.vehicles.find((vehicle) => vehicle.id === queryVehicleId) ??
                    null;
                  const draftVehicle = queryCarBrand.trim() || queryCarModel.trim() || queryPlateNumber.trim()
                    ? {
                        brand: queryCarBrand.trim(),
                        model: queryCarModel.trim(),
                        plateNumber: normalizePlate(queryPlateNumber),
                        radius: "",
                      }
                    : null;
                  const vehicle = queryVehicle ?? draftVehicle ?? getClientPrimaryVehicle(selectedClient);

                  return buildDemoOrderClientSnapshotFromDraft({
                    mode: "existing",
                    selectedClientId: selectedClient.id,
                    clientKind: queryClientKind === "legal" ? "legal" : "individual",
                    organizationName: queryOrganizationName.trim(),
                    inn: normalizeInn(queryInn),
                    contractNumber: queryContractNumber.trim(),
                    clientName: selectedClient.name,
                    phone: selectedClient.phone,
                    carBrand: vehicle?.brand ?? "",
                    carModel: vehicle?.model ?? "",
                    plateNumber: vehicle?.plateNumber ?? "",
                    preferredRadius: getVehiclePreferredRadius(vehicle),
                  });
                })();

          if (!clientSnapshot) {
            if (!cancelled) {
              router.replace("/orders/new");
            }
            return;
          }

          if (bootstrapOrderCreateRef.current?.key === bootstrapKey) {
            storedOrder = await bootstrapOrderCreateRef.current.promise;
          } else {
            const createPromise = createOrderViaApi(
              createSeedOrderFromClientSnapshot(clientSnapshot),
              {
                allowSamePlateDifferentVehicle: queryAllowSamePlateDifferentVehicle,
              },
            ).then((createdOrder) => createdOrder.order);

            bootstrapOrderCreateRef.current = {
              key: bootstrapKey,
              promise: createPromise,
            };
            storedOrder = await createPromise;
          }
        }

        if (cancelled) {
          return;
        }

        if (!storedOrder) {
          throw new Error("Не удалось подготовить заказ для редактора.");
        }

        await refreshCurrentShiftContext();

        if (cancelled) {
          return;
        }

        const canOpenCompletedUnpaidForPayment =
          queryAction === "payment" &&
          storedOrder.status === "Выполнен" &&
          storedOrder.payment.paymentStatus !== "Оплачен";

        if (!isEditableOrderStatus(storedOrder.status) && !canOpenCompletedUnpaidForPayment) {
          if (queryOrderId) {
            router.replace(`/orders/view/${storedOrder.id}`);
          } else {
            router.replace("/orders/new");
          }
          return;
        }

        if (queryOrderId !== storedOrder.id) {
          const nextPath = queryQuickServiceId
            ? `/orders?id=${storedOrder.id}&quickService=${queryQuickServiceId}`
            : `/orders?id=${storedOrder.id}`;

          router.replace(nextPath);
        }

        syncLocalOrderMirror(storedOrder);
        applyOrderSnapshot(storedOrder);
      } catch (error) {
        const duplicateConflict = getDuplicateConflictFromApiError(error);

        if (duplicateConflict) {
          blockedInitializationKeyRef.current = initializationKey;
          bootstrapOrderCreateRef.current = null;
          setOrderInitializationDuplicateConflict(duplicateConflict);
          setOrderInitializationError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
          return;
        }

        setOrderInitializationDuplicateConflict(null);
        setOrderInitializationError(getApiErrorMessage(error, "Не удалось подготовить заказ для редактора."));
        console.error("Не удалось инициализировать заказ.", error);
      } finally {
        isHydratingOrderRef.current = false;
      }
    }

    void initializeOrder();

    return () => {
      cancelled = true;
    };
  }, [
    applyOrderSnapshot,
    clientsLookupReady,
    clientsStore.clients,
    importLegacyOrderOnce,
    bootstrapIntentKey,
    queryClientId,
    queryClientKind,
    queryCarBrand,
    queryCarModel,
    queryContractNumber,
    queryInn,
    queryMode,
    queryAction,
    queryOrderId,
    queryOrganizationName,
    queryPlateNumber,
    queryAllowSamePlateDifferentVehicle,
    queryQuickServiceId,
    queryVehicleId,
    refreshCurrentShiftContext,
    router,
    syncLocalOrderMirror,
  ]);

  const activeCategory =
    orderCategoryTabs.find((category) => category.id === activeCategoryId) ??
    orderCategoryTabs[0] ??
    ORDER_CATEGORY_TABS[0];

  const orderStatus = deriveEditorOrderStatus(cartItems, payment, persistedOrderStatus);
  const editTabLabel = orderStatus === "Черновик" ? "Текущий черновик" : "Текущий заказ";
  const isCompletedUnpaidOrder =
    orderStatus === "Выполнен" && payment.paymentStatus !== "Оплачен";

  const pricingContext: PricingContext = {
    vehicleType,
    radius,
    lowProfile,
    runflat,
  };

  const unfilteredVisibleServices = useMemo<CatalogService[]>(
    () => [
      ...(activeCategory.sourceCategoryId
        ? getOrderServicesByCategory(
            activeCategory.sourceCategoryId,
            servicesStore.categories,
          )
        : []),
    ],
    [activeCategory.sourceCategoryId, servicesStore.categories],
  );

  const visibleServices = useMemo(() => {
    const query = catalogSearchQuery.trim().toLowerCase();

    if (query) {
      const matchedServices = servicesStore.categories.flatMap((category) =>
        category.services.filter((service) =>
          service.name.toLowerCase().includes(query) ||
          service.displayPriceLabel?.toLowerCase().includes(query),
        ),
      );

      return dedupeServicesForOrderSearch(matchedServices);
    }

    return unfilteredVisibleServices;
  }, [unfilteredVisibleServices, catalogSearchQuery, servicesStore.categories]);
  const showPressureQuickSearch =
    !catalogSearchQuery.trim() &&
    !visibleServices.some(
      (service) =>
        normalizeServiceDuplicateName(service.name) ===
        normalizeServiceDuplicateName("Проверка давления"),
    );

  const parsedDiscountPercent = parseDiscountPercentInput(discountPercentValue);
  const discountInputError =
    parsedDiscountPercent === null ? "Скидка от 0 до 100%" : "";
  const orderTotals = useMemo(
    () => calculateDemoOrderTotals(cartItems, parsedDiscountPercent ?? 0),
    [cartItems, parsedDiscountPercent],
  );
  const servicesCount = orderTotals.servicesCount;
  const subtotal = orderTotals.subtotal;
  const discount = orderTotals.discount;
  const total = orderTotals.total;
  const buildCurrentOrderSnapshot = useCallback((
    nextPayment: DemoOrderPaymentSnapshot = payment,
    nextClient: DemoOrderClientSnapshot = orderClient!,
    nextShift: {
      shiftId: string | null;
      shiftLabelSnapshot: string | null;
      shiftOpenedAtSnapshot: string | null;
    } = {
      shiftId: orderShiftId,
      shiftLabelSnapshot: orderShiftLabelSnapshot,
      shiftOpenedAtSnapshot: orderShiftOpenedAtSnapshot,
    },
    nextStatus?: DemoOrder["status"],
  ): DemoOrder => {
    const status = nextStatus ?? deriveEditorOrderStatus(cartItems, nextPayment, persistedOrderStatus);
    const persistedShiftSnapshot = getShiftSnapshotForPersist(nextPayment, nextShift, status);

    return {
      id: orderId,
      number: orderNumber,
      createdAt: orderCreatedAt,
      updatedAt: new Date().toISOString(),
      status,
      client: nextClient,
      vehicleType,
      radius,
      lowProfile,
      runflat,
      executorId: executorIds[0] ?? null,
      executorEmployeeId: executorIds[0] ?? null,
      executorEmployeeIds: executorIds,
      executorNameSnapshot: selectedExecutor.label || null,
      shiftId: persistedShiftSnapshot.shiftId,
      shiftLabelSnapshot: persistedShiftSnapshot.shiftLabelSnapshot,
      shiftOpenedAtSnapshot: persistedShiftSnapshot.shiftOpenedAtSnapshot,
      lines: cartItems,
      salaryAccrualTotal: calculateOrderAccrualTotal(cartItems),
      totals: orderTotals,
      note: orderRecommendation.trim(),
      payment: nextPayment,
    };
  }, [
    cartItems,
    lowProfile,
    orderClient,
    orderCreatedAt,
    orderId,
    orderNumber,
    orderShiftId,
    orderShiftLabelSnapshot,
    orderShiftOpenedAtSnapshot,
    orderRecommendation,
    orderTotals,
    payment,
    persistedOrderStatus,
    radius,
    runflat,
    executorIds,
    selectedExecutor.label,
    vehicleType,
  ]);

  useEffect(() => {
    if (
      !orderReady ||
      !shiftContextReady ||
      !orderId ||
      !orderClient ||
      isCompletedUnpaidOrder ||
      discountInputError ||
      isProcessingPaymentRef.current ||
      isHydratingOrderRef.current
    ) {
      return;
    }

    const snapshot = buildCurrentOrderSnapshot();
    const serializedSnapshot = JSON.stringify(snapshot);

    if (lastPersistedSnapshotRef.current === serializedSnapshot) {
      return;
    }

    clearPendingAutosave();

    orderSaveTimeoutRef.current = setTimeout(() => {
      void persistOrderImmediately(snapshot, { clearPendingAutosave: false }).catch((error) => {
        if (getDuplicateConflictFromApiError(error)) {
          setOrderEditorError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
          return;
        }

        console.error("Не удалось сохранить заказ.", error);
      });
    }, 350);

    return () => {
      clearPendingAutosave();
    };
  }, [
    cartItems,
    discountInputError,
    executorIds,
    lowProfile,
    orderClient,
    orderCreatedAt,
    orderId,
    orderNumber,
    orderReady,
    isCompletedUnpaidOrder,
    orderShiftId,
    orderShiftLabelSnapshot,
    orderShiftOpenedAtSnapshot,
    orderStatus,
    payment,
    radius,
    runflat,
    selectedExecutor.id,
    selectedExecutor.label,
    shiftContextReady,
    vehicleType,
    buildCurrentOrderSnapshot,
    clearPendingAutosave,
    persistOrderImmediately,
  ]);

  function applyCartItem(
    key: string,
    serviceId: string,
    serviceName: string,
    quantity: number,
    unitPrice: number,
    snapshot: PricingSnapshot,
    salaryRuleSnapshot: SalaryRuleSnapshot | null,
    costPrice: number | null,
  ) {
    setCartItems((current) => {
      if (quantity <= 0) {
        return current.filter((item) => item.key !== key);
      }

      const existingItem = current.find((item) => item.key === key);
      const salaryAccrualSnapshot = calculateLineAccrualSnapshot({
        unitPrice,
        quantity,
        salaryRuleSnapshot,
        costPrice,
      });

      if (existingItem) {
        return current.map((item) =>
          item.key === key
            ? {
                ...item,
                quantity,
                unitPrice,
                pricingSnapshot: snapshot,
                salaryRuleSnapshot,
                costPrice,
                salaryAccrualSnapshot,
              }
            : item,
        );
      }

      return [
        ...current,
        {
          key,
          serviceId,
          serviceName,
          serviceNameSnapshot: serviceName,
          vehicleType,
          vehicleLabel: selectedVehicle.label,
          radius,
          lowProfile,
          runflat,
          unitPrice,
          quantity,
          pricingSnapshot: snapshot,
          salaryRuleSnapshot,
          costPrice,
          salaryAccrualSnapshot,
        },
      ];
    });
  }

  function openPriceEditorForCartItem(item: CartItem) {
    setPriceEditorState({
      open: true,
      key: item.key,
      serviceId: item.serviceId,
      serviceName: item.serviceNameSnapshot,
      vehicleType: item.vehicleType,
      vehicleLabel: item.vehicleLabel,
      radius: item.radius,
      lowProfile: item.lowProfile,
      runflat: item.runflat,
      quantity: item.quantity,
      inputKind: item.pricingSnapshot.inputKind,
      priceType: item.pricingSnapshot.priceType,
      pricingSnapshot: item.pricingSnapshot,
      salaryRuleSnapshot: item.salaryRuleSnapshot,
      costPrice: item.costPrice,
      costPriceValue: item.costPrice !== null ? String(item.costPrice) : "",
      priceOptions: item.pricingSnapshot.priceOptions,
      priceValue:
        item.unitPrice > 0
          ? String(item.unitPrice)
          : String(item.pricingSnapshot.resolvedUnitPrice ?? ""),
      selectedOptionLabel: item.pricingSnapshot.selectedOptionLabel ?? "",
      operatorNote: item.pricingSnapshot.operatorNote ?? "",
    });
  }

  function closePriceEditor() {
    setPriceEditorState(null);
  }

  function handlePriceEditorSave() {
    if (!priceEditorState) {
      return;
    }

    const resolvedUnitPrice = parsePriceInput(priceEditorState.priceValue);

    if (resolvedUnitPrice === null) {
      return;
    }

    const matchedOption =
      priceEditorState.priceOptions.find(
        (option) => option.label === priceEditorState.selectedOptionLabel,
      ) ??
      priceEditorState.priceOptions.find(
        (option) => option.price === resolvedUnitPrice,
      );

    const selectedOptionLabel = matchedOption?.label ?? "";
    const selectionMode = matchedOption ? "price_band" : "manual_input";
    const operatorNote = createPricingOperatorNote(
      priceEditorState.inputKind,
      selectedOptionLabel,
      priceEditorState.operatorNote,
    );

    applyCartItem(
      priceEditorState.key,
      priceEditorState.serviceId,
      priceEditorState.serviceName,
      priceEditorState.quantity,
      resolvedUnitPrice,
      {
        ...priceEditorState.pricingSnapshot,
        inputKind: priceEditorState.inputKind,
        selectionMode,
        resolvedUnitPrice,
        displayLabel: formatPrice(resolvedUnitPrice),
        selectedOptionLabel: selectedOptionLabel || null,
        operatorNote,
        priceOptions: priceEditorState.priceOptions,
      },
      priceEditorState.salaryRuleSnapshot,
      usesCostPriceRule(priceEditorState.salaryRuleSnapshot)
        ? parseOptionalPriceInput(priceEditorState.costPriceValue)
        : priceEditorState.costPrice,
    );

    closePriceEditor();
  }

  function openPriceEditor(
    item: CatalogService,
    quantity: number,
    resolvedPricing: ResolvedPricing,
  ) {
    const serviceId = getCatalogServiceId(item);
    const key = buildCartItemKey(serviceId, vehicleType, radius, lowProfile, runflat);
    const existingItem = cartItems.find((cartItem) => cartItem.key === key);

    setPriceEditorState({
      open: true,
      key,
      serviceId,
      serviceName: getCatalogServiceName(item),
      vehicleType,
      vehicleLabel: selectedVehicle.label,
      radius,
      lowProfile,
      runflat,
      quantity,
      inputKind: resolvedPricing.inputKind,
      priceType: resolvedPricing.pricingSnapshot.priceType,
      pricingSnapshot: existingItem?.pricingSnapshot ?? resolvedPricing.pricingSnapshot,
      salaryRuleSnapshot: resolvedPricing.salaryRuleSnapshot,
      costPrice: resolvedPricing.costPrice,
      costPriceValue:
        existingItem?.costPrice !== null && existingItem?.costPrice !== undefined
          ? String(existingItem.costPrice)
          : resolvedPricing.costPrice !== null
            ? String(resolvedPricing.costPrice)
            : "",
      priceOptions: resolvedPricing.priceOptions,
      priceValue: String(
        existingItem?.unitPrice ??
          resolvedPricing.pricingSnapshot.resolvedUnitPrice ??
          resolvedPricing.pricingSnapshot.baseUnitPrice ??
          "",
      ),
      selectedOptionLabel:
        existingItem?.pricingSnapshot.selectedOptionLabel ??
        (resolvedPricing.priceOptions.length === 1
          ? resolvedPricing.priceOptions[0].label
          : ""),
      operatorNote: existingItem?.pricingSnapshot.operatorNote ?? "",
    });
  }

  function setServiceQuantity(item: CatalogService, quantity: number) {
    const resolvedPricing = resolveCatalogServicePricing(item, pricingContext);
    const serviceId = getCatalogServiceId(item);
    const key = buildCartItemKey(serviceId, vehicleType, radius, lowProfile, runflat);
    const existingItem = cartItems.find((cartItem) => cartItem.key === key);

    if (resolvedPricing.disabled) {
      return;
    }

    if (resolvedPricing.inputKind !== "none") {
      if (existingItem) {
        changeTableItemQuantity(existingItem.key, quantity);
        return;
      }

      openPriceEditor(item, quantity, resolvedPricing);
      return;
    }

    if (resolvedPricing.unitPrice === null) {
      return;
    }

    const normalizedUnitPrice = isMainPackageService(item)
      ? getMainPackagePerWheelPrice(resolvedPricing.unitPrice)
      : resolvedPricing.unitPrice;

    applyCartItem(
      key,
      serviceId,
      getCatalogServiceName(item),
      quantity,
      normalizedUnitPrice,
      resolvedPricing.pricingSnapshot,
      resolvedPricing.salaryRuleSnapshot,
      resolvedPricing.costPrice,
    );
  }

  function changeTableItemQuantity(key: string, quantity: number) {
    setCartItems((current) => {
      if (quantity <= 0) {
        return current.filter((item) => item.key !== key);
      }

      return current.map((item) =>
        item.key === key
          ? {
              ...item,
              quantity,
              salaryAccrualSnapshot: calculateLineAccrualSnapshot({
                unitPrice: item.unitPrice,
                quantity,
                salaryRuleSnapshot: item.salaryRuleSnapshot,
                costPrice: item.costPrice,
              }),
            }
          : item,
      );
    });
  }

  function removeItem(key: string) {
    setCartItems((current) => current.filter((item) => item.key !== key));
  }

  function resetOrder() {
    setCartItems([]);
    setPriceEditorState(null);
    setVehicleType("passenger");
    setRadius("R16");
    setLowProfile(false);
    setRunflat(false);
    setPersistedOrderStatus("Черновик");
    setPayment(EMPTY_PAYMENT_SNAPSHOT);
    setOrderRecommendation(DEFAULT_ORDER_RECOMMENDATION);
    setPaymentEditorState({
      method: "cash",
      accountId: "",
      amountValue: "",
      genericNote: "",
      paymentMethodNote: "",
      internalComment: "",
    });
    setActiveCategoryId("main");
    setStoredExecutorOptions([]);
    setExecutorSearchValue("");
    setExecutorIds(defaultExecutorIds);
    setDidInitSeedExecutors(false);
    setOrderShiftId(null);
    setOrderShiftLabelSnapshot(null);
    setOrderShiftOpenedAtSnapshot(null);
    setPaymentModalOpen(false);
    setShiftGuardModalOpen(false);
  }

  async function handleDeleteDraftOrder() {
    if (!orderId || orderStatus !== "Черновик") {
      return;
    }

    clearPendingAutosave();

    try {
      await orderPersistQueueRef.current.catch(() => null);
      await deleteDraftOrderViaApi(orderId);
      removeStoredDemoOrder(orderId);
      clearCurrentDemoOrderId();
      setDeleteDraftConfirmOpen(false);
      router.replace("/orders/new");
    } catch (error) {
      console.error("Не удалось удалить черновик заказа.", error);
    }
  }

  function resetTireModifiers() {
    setLowProfile(false);
    setRunflat(false);
  }

  function handleVehicleTypeChange(nextVehicleType: VehicleTypeId) {
    setVehicleType(nextVehicleType);
    setRadius((current) => resolveRadiusForVehicleType(nextVehicleType, current));

    if (nextVehicleType === "commercial") {
      setLowProfile(false);
      setRunflat(false);
    }
  }

  function toggleLowProfile() {
    if (!lowProfile) {
      setRunflat(false);
    }

    setLowProfile((current) => !current);
  }

  function toggleRunflat() {
    if (!runflat) {
      setLowProfile(false);
    }

    setRunflat((current) => !current);
  }

  function getCurrentQuantity(item: CatalogService) {
    const key = buildCartItemKey(
      getCatalogServiceId(item),
      vehicleType,
      radius,
      lowProfile,
      runflat,
    );

    return cartItems.find((cartItem) => cartItem.key === key)?.quantity ?? 0;
  }


  // Quick service bootstrap is intentionally tied to the canonicalized query param.
  // We clear it immediately after the first apply to avoid repeated inserts.
  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(() => {
    if (
      !queryQuickServiceId ||
      !servicesCatalogReady ||
      !orderReady ||
      !orderId ||
      servicesStore.categories.length === 0
    ) {
      return;
    }

    const applyKey = `${orderId}:${queryQuickServiceId}`;

    if (quickServiceApplyRef.current === applyKey) {
      return;
    }

    const matchedCategory = servicesStore.categories.find((category) =>
      category.services.some((service) => service.id === queryQuickServiceId),
    );
    const matchedService = matchedCategory?.services.find(
      (service) => service.id === queryQuickServiceId,
    );

    if (!matchedCategory || !matchedService) {
      return;
    }

    const quickServiceKey = buildCartItemKey(
      getCatalogServiceId(matchedService),
      vehicleType,
      radius,
      lowProfile,
      runflat,
    );
    const existingQuickItem = cartItems.find((item) => item.key === quickServiceKey);

    quickServiceApplyRef.current = applyKey;
    const matchedTab = orderCategoryTabs.find(
      (tab) => tab.sourceCategoryId === matchedCategory.id,
    );

    if (matchedTab) {
      setActiveCategoryId(matchedTab.id);
    }

    if (existingQuickItem) {
      router.replace(`/orders?id=${orderId}`);
      return;
    }

    setServiceQuantity(matchedService, 1);
    router.replace(`/orders?id=${orderId}`);
  }, [
    cartItems,
    lowProfile,
    orderCategoryTabs,
    orderId,
    orderReady,
    queryQuickServiceId,
    radius,
    runflat,
    router,
    servicesCatalogReady,
    servicesStore.categories,
    vehicleType,
  ]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const clientStatusLabel =
    orderClient ? getDemoOrderClientDisplayName(orderClient) : "Клиент не выбран";
  const clientPhoneLabel = orderClient?.phone || "Не указан";
  const currentCarLabel = orderClient
    ? formatDemoOrderCarLabel({ client: orderClient })
    : "Не указан";
  const currentPlateLabel = orderClient?.plateNumber
    ? formatPlateForDisplay(orderClient.plateNumber)
    : "";
  const clients = clientsStore.clients;
  const filteredClients = buildClientSearchResults(clients, clientSearchValue);
  const clientInputValue =
    clientDropdownOpen || clientSearchValue
      ? clientSearchValue
      : selectedClientId === "anonymous"
        ? ""
        : (() => {
            const selectedClient = clients.find(
              (client) => client.id === selectedClientId,
            );

            return selectedClient ? getExistingClientSearchLabel(selectedClient) : "";
          })();
  const clientInputPlaceholder = clientDropdownOpen
    ? "Начните вводить ФИО, Телефон, Гос.номер"
    : selectedClientId === "anonymous"
      ? "Анонимный клиент"
      : "Начните вводить ФИО, Телефон, Гос.номер";
  const selectedExistingClient =
    clientEditorMode === "existing"
      ? clients.find((client) => client.id === selectedClientId) ?? null
      : null;
  const selectedExistingVehicle =
    selectedExistingClient && selectedVehicleId
      ? selectedExistingClient.vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null
      : null;
  const hasExistingVehicleDraft = Boolean(
    clientForm.carBrand.trim() || clientForm.carModel.trim() || clientForm.plateNumber.trim(),
  );
  const existingVehiclePreview =
    clientEditorMode === "existing"
      ? selectedExistingVehicle ??
        (hasExistingVehicleDraft
          ? ({
              id: "draft",
              label: "",
              brand: clientForm.carBrand.trim(),
              model: clientForm.carModel.trim(),
              plateNumber: clientForm.plateNumber.trim(),
              radius: "",
            } satisfies ClientVehicle)
          : null)
      : null;
  const preservedLegalSnapshot =
    clientEditorMode === "existing" &&
    orderClient?.clientKind === "legal" &&
    orderClient.clientId === selectedClientId
      ? {
          clientKind: "legal" as const,
          organizationName: orderClient.organizationName || "",
          inn: orderClient.inn || "",
          contractNumber: orderClient.contractNumber || "",
        }
      : null;
  const existingVehicleDuplicateConflict =
    clientEditorMode === "existing" && selectedExistingClient && selectedVehicleId === null
      ? findClientPlateDuplicate(clients, clientForm.plateNumber, {
          targetClientId: selectedExistingClient.id,
          carBrand: clientForm.carBrand,
          carModel: clientForm.carModel,
        })
      : null;
  const existingVehicleConfirmationKey = buildSamePlateConfirmationKey({
    scope: "orders-editor-existing-vehicle",
    clientId: selectedExistingClient?.id,
    carBrand: clientForm.carBrand,
    carModel: clientForm.carModel,
    plateNumber: clientForm.plateNumber,
  });
  const existingVehicleSamePlateConfirmed = Boolean(
    existingVehicleDuplicateConflict?.requiresConfirmation &&
      confirmedSamePlateKey === existingVehicleConfirmationKey,
  );
  const existingVehicleReady = Boolean(
    selectedExistingVehicle ||
      clientForm.carBrand.trim(),
  ) && (!existingVehicleDuplicateConflict || existingVehicleSamePlateConfirmed);
  const clientFormInnValid = clientForm.clientKind !== "legal" || validateInn(clientForm.inn);
  const normalizedNewClientPhone =
    normalizeAuthPhoneInput(clientForm.phone).length === 10
      ? formatAuthPhoneDisplay(normalizeAuthPhoneInput(clientForm.phone))
      : "";
  const newClientDuplicateConflict =
    findClientPhoneDuplicate(clients, normalizedNewClientPhone) ??
    findClientPlateDuplicate(clients, clientForm.plateNumber, {
      carBrand: clientForm.carBrand,
      carModel: clientForm.carModel,
    });
  const newClientConfirmationKey = buildSamePlateConfirmationKey({
    scope: "orders-editor-new-client",
    carBrand: clientForm.carBrand,
    carModel: clientForm.carModel,
    plateNumber: clientForm.plateNumber,
  });
  const newClientSamePlateConfirmed = Boolean(
    newClientDuplicateConflict?.kind === "plate" &&
      newClientDuplicateConflict.requiresConfirmation &&
      confirmedSamePlateKey === newClientConfirmationKey,
  );
  const newClientContract = getClientContractState({
    clientKind: clientForm.clientKind,
    fullName: clientForm.fullName,
    phone:
      normalizeAuthPhoneInput(clientForm.phone).length === 10
        ? formatAuthPhoneDisplay(normalizeAuthPhoneInput(clientForm.phone))
        : "",
    carBrand: clientForm.carBrand,
    carModel: clientForm.carModel,
    plateNumber: clientForm.plateNumber,
    organizationName: clientForm.organizationName,
  });
  const clientPreviewName =
    clientEditorMode === "new"
      ? clientForm.clientKind === "legal"
        ? clientForm.organizationName.trim() || "Юридическое лицо"
        : getClientDisplayName({
            fullName: clientForm.fullName,
            fallback: "Клиент без имени",
          })
      : clientEditorMode === "anonymous"
        ? "Анонимный клиент"
        : preservedLegalSnapshot?.organizationName || selectedExistingClient?.name || "Клиент не выбран";
  const clientPreviewPhone =
    clientEditorMode === "new"
      ? (normalizeAuthPhoneInput(clientForm.phone).length === 10
          ? formatAuthPhoneDisplay(clientForm.phone)
          : "")
      : clientEditorMode === "anonymous"
        ? ""
        : selectedExistingClient?.phone || "";
  const clientPreviewCarLabel =
    clientEditorMode === "new"
      ? (() => {
          const brandModel = [clientForm.carBrand.trim(), clientForm.carModel.trim()]
            .filter(Boolean)
            .join(" ")
            .trim();
          const plate = formatPlateForDisplay(clientForm.plateNumber);
          const bits = [brandModel || null, plate || null].filter(Boolean);

          return bits.length > 0 ? bits.join(" · ") : "Не указан";
        })()
      : clientEditorMode === "anonymous"
        ? (() => {
            const brandModel = [clientForm.carBrand.trim(), clientForm.carModel.trim()]
              .filter(Boolean)
              .join(" ")
              .trim();
            const plate = formatPlateForDisplay(clientForm.plateNumber);
            const bits = [brandModel || null, plate || null].filter(Boolean);

            return bits.length > 0 ? bits.join(" · ") : "Не указан";
          })()
        : existingVehiclePreview
          ? (() => {
              const brandModel = [
                existingVehiclePreview.brand,
                existingVehiclePreview.model,
              ]
                .filter(Boolean)
                .join(" ")
                .trim();
              const bits = [
                brandModel || null,
                formatPlateForDisplay(existingVehiclePreview.plateNumber) || null,
              ].filter(Boolean);

              return bits.length > 0 ? bits.join(" · ") : "Не указан";
            })()
          : "Не указан";
  const clientEditorSaveDisabled =
    clientEditorMode === "existing"
      ? !Boolean(selectedExistingClient && existingVehicleReady)
      : clientEditorMode === "new"
        ? !newClientContract.hasOrderMinimumRequiredFields ||
          !clientFormInnValid ||
          Boolean(newClientDuplicateConflict && !newClientSamePlateConfirmed)
        : false;

  function updateClientForm<K extends keyof NewClientForm>(key: K, value: NewClientForm[K]) {
    setClientEditorError("");
    if (key === "phone" || key === "carBrand" || key === "carModel" || key === "plateNumber") {
      setConfirmedSamePlateKey("");
      setOrderEditorError("");
    }
    setClientForm((current) => ({
      ...current,
      [key]:
        key === "phone"
          ? (normalizeAuthPhoneInput(value as string) as NewClientForm[K])
          : key === "inn"
            ? (normalizeInn(value as string) as NewClientForm[K])
            : key === "plateNumber"
              ? (normalizePlate(value as string) as NewClientForm[K])
          : value,
    }));
  }

  function updateClientVehicleForm<K extends "carBrand" | "carModel" | "plateNumber">(
    key: K,
    value: NewClientForm[K],
  ) {
    if (clientEditorMode === "existing" && selectedVehicleId) {
      setSelectedVehicleId(null);
    }

    updateClientForm(key, value);
  }

  function openClientEditor() {
    if (payment.paymentStatus === "Оплачен" || !orderClient) {
      return;
    }

    setClientEditorError("");
    setOrderEditorError("");
    setConfirmedSamePlateKey("");

    if (orderClient.anonymous) {
      setClientEditorMode("anonymous");
      setSelectedClientId("anonymous");
      setSelectedVehicleId(null);
      setClientForm({
        ...EMPTY_NEW_CLIENT_FORM,
        carBrand: orderClient.carBrand,
        carModel: orderClient.carModel,
        plateNumber: orderClient.plateNumber,
      });
    } else if (
      orderClient.clientId &&
      clients.some((client) => client.id === orderClient.clientId)
    ) {
      const existingClient = clients.find((client) => client.id === orderClient.clientId) ?? null;
      const matchedVehicle = findClientVehicleForOrderSnapshot(existingClient, orderClient);

      setClientEditorMode("existing");
      setSelectedClientId(orderClient.clientId);
      setSelectedVehicleId(matchedVehicle?.id ?? null);
      setClientForm({
        clientKind: orderClient.clientKind || "individual",
        fullName: "",
        organizationName: orderClient.organizationName || "",
        inn: orderClient.inn || "",
        contractNumber: orderClient.contractNumber || "",
        phone: normalizeAuthPhoneInput(orderClient.phone),
        carBrand: matchedVehicle?.brand ?? orderClient.carBrand,
        carModel: matchedVehicle?.model ?? orderClient.carModel,
        plateNumber: matchedVehicle?.plateNumber ?? orderClient.plateNumber,
      });
    } else {
      setClientEditorMode("new");
      setSelectedClientId("anonymous");
      setSelectedVehicleId(null);
      setClientForm({
        clientKind: orderClient.clientKind || "individual",
        fullName: orderClient.name || "",
        organizationName: orderClient.organizationName || "",
        inn: orderClient.inn || "",
        contractNumber: orderClient.contractNumber || "",
        phone: normalizeAuthPhoneInput(orderClient.phone),
        carBrand: orderClient.carBrand,
        carModel: orderClient.carModel,
        plateNumber: orderClient.plateNumber,
      });
    }

    setClientSearchValue("");
    setClientDropdownOpen(false);
    setClientEditorOpen(true);
  }

  function closeClientEditor() {
    setClientEditorOpen(false);
    setClientSearchValue("");
    setClientDropdownOpen(false);
    setClientEditorError("");
  }

  function handleClientSelect(clientId: string, vehicleId?: string | null) {
    setClientEditorError("");
    setConfirmedSamePlateKey("");
    setSelectedClientId(clientId);
    const client = clients.find((item) => item.id === clientId) ?? null;
    const vehicle = vehicleId
      ? client?.vehicles.find((item) => item.id === vehicleId) ?? null
      : null;

    setSelectedVehicleId(vehicle?.id ?? null);
    setClientForm((current) => ({
      ...current,
      carBrand: vehicle?.brand ?? "",
      carModel: vehicle?.model ?? "",
      plateNumber: vehicle?.plateNumber ?? "",
    }));
    setClientSearchValue("");
    setClientDropdownOpen(false);
  }

  function selectDuplicateConflict(conflict: ClientDuplicateConflict) {
    setClientEditorMode("existing");
    handleClientSelect(conflict.clientId, conflict.vehicleId);
  }

  async function handleClientSave() {
    setClientEditorError("");

    if (
      clientEditorMode === "existing" &&
      existingVehicleDuplicateConflict &&
      !existingVehicleSamePlateConfirmed
    ) {
      setClientEditorError("Такой госномер уже есть в базе. Выберите существующую запись.");
      return;
    }

    if (
      clientEditorMode === "new" &&
      newClientDuplicateConflict &&
      !newClientSamePlateConfirmed
    ) {
      setClientEditorError("Такой клиент или автомобиль уже есть в базе. Выберите существующую запись.");
      return;
    }

    let draft: OrderDraft;

    if (clientEditorMode === "anonymous") {
      draft = {
        mode: "anonymous",
        selectedClientId: "anonymous",
        clientName: "Анонимный клиент",
        phone: "",
        carBrand: clientForm.carBrand.trim(),
        carModel: clientForm.carModel.trim(),
        plateNumber: normalizePlate(clientForm.plateNumber),
        preferredRadius: "",
      };
    } else if (clientEditorMode === "existing") {
      const selectedClient = clients.find((client) => client.id === selectedClientId);

      if (!selectedClient) {
        return;
      }

      const vehicle = selectedVehicleId
        ? selectedClient.vehicles.find((v) => v.id === selectedVehicleId)
        : null;
      const preferredRadius = selectedVehicleId ? getVehiclePreferredRadius(vehicle) : "";

      draft = {
        mode: "existing",
        selectedClientId,
        clientKind: preservedLegalSnapshot?.clientKind,
        organizationName: preservedLegalSnapshot?.organizationName,
        inn: normalizeInn(preservedLegalSnapshot?.inn),
        contractNumber: preservedLegalSnapshot?.contractNumber,
        clientName: preservedLegalSnapshot?.organizationName || selectedClient.name,
        phone: selectedClient.phone,
        carBrand: selectedVehicleId ? (vehicle?.brand ?? "") : clientForm.carBrand,
        carModel: selectedVehicleId ? (vehicle?.model ?? "") : clientForm.carModel,
        plateNumber: selectedVehicleId ? (vehicle?.plateNumber ?? "") : normalizePlate(clientForm.plateNumber),
        preferredRadius,
      };
    } else {
      draft = {
        mode: "new",
        selectedClientId: "",
        clientName: "",
        phone: "",
        carBrand: "",
        carModel: "",
        plateNumber: "",
        preferredRadius: "",
      };
    }

    let resolvedDraft = draft;

    if (clientEditorMode === "new") {
      try {
        const normalizedPhone = normalizeAuthPhoneInput(clientForm.phone);
        const createdClient = await createClientViaApi({
          clientKind: clientForm.clientKind,
          organizationName: clientForm.organizationName.trim(),
          inn: normalizeInn(clientForm.inn),
          fullName: clientForm.fullName.trim(),
          phone:
            normalizedPhone.length === 10
              ? formatAuthPhoneDisplay(normalizedPhone)
              : "",
          carBrand: clientForm.carBrand.trim(),
          carModel: clientForm.carModel.trim(),
          plateNumber: normalizePlate(clientForm.plateNumber),
          allowSamePlateDifferentVehicle: newClientSamePlateConfirmed,
        });

        setClientsStore((current) => ({
          clients: [
            createdClient.client,
            ...current.clients.filter((client) => client.id !== createdClient.client.id),
          ],
        }));

        resolvedDraft = {
          mode: "new",
          selectedClientId: createdClient.client.id,
          clientKind: clientForm.clientKind,
          organizationName: clientForm.organizationName.trim(),
          inn: normalizeInn(clientForm.inn),
          contractNumber: clientForm.contractNumber.trim(),
          clientName:
            clientForm.clientKind === "legal"
              ? clientForm.organizationName.trim()
              : createdClient.client.name,
          phone: createdClient.client.phone,
          carBrand: createdClient.client.vehicles[0]?.brand ?? "",
          carModel: createdClient.client.vehicles[0]?.model ?? "",
          plateNumber: createdClient.client.vehicles[0]?.plateNumber ?? "",
          preferredRadius: getClientPreferredRadius(createdClient.client),
        };
      } catch (error) {
        if (getDuplicateConflictFromApiError(error)) {
          setClientEditorError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
          return;
        }

        console.error("Не удалось создать клиента для заказа.", error);
        setClientEditorError(error instanceof Error ? error.message : "Не удалось создать клиента.");
        return;
      }
    }

    const nextClientSnapshot = buildDemoOrderClientSnapshotFromDraft(resolvedDraft);
    const savedClientEditorMode = clientEditorMode;
    const savedSelectedClientId = selectedClientId;
    const previousClientSnapshot = orderClient;

    setOrderClient(nextClientSnapshot);
    if (orderReady && orderId) {
      try {
        const persistedOrder = await persistOrderImmediately(
          buildCurrentOrderSnapshot(payment, nextClientSnapshot),
          {
            clearPendingAutosave: true,
            allowSamePlateDifferentVehicle:
              savedClientEditorMode === "new"
                ? newClientSamePlateConfirmed
                : existingVehicleSamePlateConfirmed,
          },
        );
        setOrderNumber(persistedOrder.number);

        if (savedClientEditorMode === "existing" && savedSelectedClientId !== "anonymous") {
          try {
            const refreshedClientsStore = await fetchClientsStore();
            const refreshedClient =
              refreshedClientsStore.clients.find((client) => client.id === savedSelectedClientId) ??
              null;
            const refreshedVehicle = findClientVehicleForOrderSnapshot(
              refreshedClient,
              nextClientSnapshot,
            );

            setClientsStore(refreshedClientsStore);
            setSelectedVehicleId(refreshedVehicle?.id ?? null);
          } catch (error) {
            console.error("Не удалось обновить автопарк клиента после сохранения заказа.", error);
          }
        }
      } catch (error) {
        setOrderClient(previousClientSnapshot);

        if (getDuplicateConflictFromApiError(error)) {
          setClientEditorError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
          return;
        }

        console.error("Не удалось сохранить данные клиента в заказе.", error);
        setClientEditorError(getApiErrorMessage(error, "Не удалось сохранить данные клиента в заказе."));
        return;
      }
    }
    closeClientEditor();
  }

  const handleAcceptPayment = useCallback(async () => {
    if (
      cartItems.length === 0 ||
      isOpeningPaymentModal ||
      payment.paymentStatus === "Оплачен" ||
      discountInputError
    ) {
      return;
    }

    if (hasPayrollRelevantCartItems(cartItems) && executorIds.length === 0) {
      setOrderEditorError(PAYROLL_EXECUTOR_REQUIRED_MESSAGE);
      return;
    }

    setIsOpeningPaymentModal(true);
    let currentShift = null;

    try {
      currentShift = (await fetchCurrentShiftForOrderFlow()).currentShift;
    } catch (error) {
      console.error("Не удалось получить текущую смену.", error);
    }

    if (!currentShift) {
      setPaymentModalOpen(false);
      setShiftGuardModalOpen(true);
      setIsOpeningPaymentModal(false);
      return;
    }

    // Use existing recommendation or default if truly empty for the first time
    if (!orderRecommendation.trim() && !isHydratingOrderRef.current && prevOrderIdRef.current !== orderId) {
      setOrderRecommendation(DEFAULT_ORDER_RECOMMENDATION);
      prevOrderIdRef.current = orderId;
    }

    const paymentNoteState = decomposePaymentNote(payment.note);
    const remainingAmount = getPaymentRemainingAmount(payment, total);
    setPaymentEditorError("");
    setPaymentEditorState({
      method: payment.paymentMethod ?? "cash",
      accountId: "",
      amountValue: String(remainingAmount > 0 ? remainingAmount : total),
      genericNote: paymentNoteState.genericNote,
      paymentMethodNote: paymentNoteState.paymentMethodNote,
      internalComment: payment.internalComment ?? "",
    });
    setPaymentModalOpen(true);
    setIsOpeningPaymentModal(false);
  }, [
    cartItems,
    discountInputError,
    executorIds.length,
    isOpeningPaymentModal,
    orderId,
    orderRecommendation,
    payment,
    total,
  ]);

  useEffect(() => {
    if (
      queryAction !== "payment" ||
      !orderReady ||
      !shiftContextReady ||
      !orderId ||
      !orderClient ||
      payment.paymentStatus === "Оплачен" ||
      cartItems.length === 0 ||
      paymentModalOpen ||
      isOpeningPaymentModal
    ) {
      return;
    }

    const actionKey = `${orderId}:payment`;

    if (paymentActionHandledRef.current === actionKey) {
      return;
    }

    paymentActionHandledRef.current = actionKey;
    void handleAcceptPayment();
  }, [
    cartItems.length,
    handleAcceptPayment,
    isOpeningPaymentModal,
    orderClient,
    orderId,
    orderReady,
    payment.paymentStatus,
    paymentModalOpen,
    queryAction,
    shiftContextReady,
  ]);

  async function handleOpenPrintPreview() {
    if (!orderId || !orderReady || !orderClient || discountInputError || typeof window === "undefined") {
      return;
    }

    try {
      const persistedOrder = await persistOrderImmediately(
        buildCurrentOrderSnapshot(),
        { clearPendingAutosave: true },
      );

      window.open(`/print/order/${persistedOrder.id}`, "_blank", "noopener,noreferrer");
    } catch (error) {
      if (getDuplicateConflictFromApiError(error)) {
        setOrderEditorError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
        return;
      }

      console.error("Не удалось подготовить печатную форму заказа.", error);
    }
  }

  function handlePaymentModalClose() {
    setPaymentEditorError("");
    setPaymentModalOpen(false);
  }

  async function handlePaymentConfirm() {
    const paidAmount = parsePriceInput(paymentEditorState.amountValue);
    const selectedAccount = accountsStore.accounts.find(
      (account) => account.id === paymentEditorState.accountId && !account.isArchived,
    );

    if (!orderId || paidAmount === null || !orderClient || !paymentEditorState.method) {
      return;
    }

    const remainingAmount = getPaymentRemainingAmount(payment, total);

    if (hasPayrollRelevantCartItems(cartItems) && executorIds.length === 0) {
      setPaymentEditorError(PAYROLL_EXECUTOR_REQUIRED_MESSAGE);
      return;
    }

    if (Math.round(paidAmount * 100) > Math.round(remainingAmount * 100)) {
      setPaymentEditorError(
        `Сумма оплаты больше остатка по заказу. Остаток к оплате: ${formatPrice(remainingAmount)}.`,
      );
      return;
    }

    isProcessingPaymentRef.current = true;
    clearPendingAutosave();

    let currentShift = null;

    try {
      currentShift = (await fetchCurrentShiftForOrderFlow()).currentShift;
    } catch (error) {
      console.error("Не удалось получить текущую смену.", error);
    }

    if (!currentShift) {
      isProcessingPaymentRef.current = false;
      setPaymentModalOpen(false);
      setShiftGuardModalOpen(true);
      return;
    }

    const alreadyPaidTotal = Math.max(
      0,
      Math.round((total - remainingAmount) * 100) / 100,
    );
    const paidTotal = Math.round((alreadyPaidTotal + paidAmount) * 100) / 100;
    const remainingAfterPayment = Math.max(
      0,
      Math.round((total - paidTotal) * 100) / 100,
    );
    const isFullyPaid = Math.round(remainingAfterPayment * 100) === 0;
    const nextPayment: DemoOrderPaymentSnapshot = {
      paymentStatus: isFullyPaid ? "Оплачен" : "Не оплачено",
      paymentMethod: paymentEditorState.method,
      paymentLabel: getDemoOrderPaymentMethodLabel(paymentEditorState.method),
      accountId: selectedAccount?.id ?? null,
      accountNameSnapshot: selectedAccount?.name ?? null,
      paidAt: new Date().toISOString(),
      paidAmount,
      paidTotal,
      remainingAmount: remainingAfterPayment,
      note: composePaymentNote({
        genericNote: paymentEditorState.genericNote,
        paymentMethodNote: paymentEditorState.paymentMethodNote,
      }),
      internalComment: paymentEditorState.internalComment.trim() || null,
    };
    const nextShiftSnapshot = {
      shiftId: currentShift.id,
      shiftLabelSnapshot: formatDemoOrderShiftLabel(
        currentShift.number,
        currentShift.openedAt,
      ),
      shiftOpenedAtSnapshot: currentShift.openedAt,
    };
    const previousPayment = payment;
    const previousShiftSnapshot = {
      shiftId: orderShiftId,
      shiftLabelSnapshot: orderShiftLabelSnapshot,
      shiftOpenedAtSnapshot: orderShiftOpenedAtSnapshot,
    };

    if (!isCompletedUnpaidOrder) {
      setOrderShiftId(nextShiftSnapshot.shiftId);
      setOrderShiftLabelSnapshot(nextShiftSnapshot.shiftLabelSnapshot);
      setOrderShiftOpenedAtSnapshot(nextShiftSnapshot.shiftOpenedAtSnapshot);
      setPayment(nextPayment);
    }
    try {
      const persistedOrder = isCompletedUnpaidOrder
        ? (await appendOrderPaymentViaApi(orderId, {
            payment: nextPayment,
            shiftId: nextShiftSnapshot.shiftId,
            shiftLabelSnapshot: nextShiftSnapshot.shiftLabelSnapshot,
            shiftOpenedAtSnapshot: nextShiftSnapshot.shiftOpenedAtSnapshot,
          })).order
        : await persistOrderImmediately(
            buildCurrentOrderSnapshot(
              nextPayment,
              orderClient,
              nextShiftSnapshot,
              isFullyPaid ? "Оплачен" : "Выполнен",
            ),
            { clearPendingAutosave: true },
          );
      setOrderNumber(persistedOrder.number);
      setPaymentModalOpen(false);
      router.push(`/orders/view/${persistedOrder.id}`);
    } catch (error) {
      isProcessingPaymentRef.current = false;
      if (getDuplicateConflictFromApiError(error)) {
        setPayment(previousPayment);
        setOrderShiftId(previousShiftSnapshot.shiftId);
        setOrderShiftLabelSnapshot(previousShiftSnapshot.shiftLabelSnapshot);
        setOrderShiftOpenedAtSnapshot(previousShiftSnapshot.shiftOpenedAtSnapshot);
        setPaymentEditorError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
        return;
      }

      console.error("Не удалось провести оплату заказа.", error);
      setPaymentEditorError(getApiErrorMessage(error, "Не удалось провести оплату заказа."));
    }
  }

  async function handleSaveDraft() {
    if (!orderId || !orderClient || cartItems.length === 0 || isSavingOrder || discountInputError) {
      return;
    }

    setIsSavingOrder(true);
    clearPendingAutosave();

    try {
      const persistedOrder = await persistOrderImmediately(
        buildCurrentOrderSnapshot(),
        { clearPendingAutosave: true },
      );
      setOrderNumber(persistedOrder.number);
      clearCurrentDemoOrderId();
      router.push("/orders/list");
    } catch (error) {
      if (getDuplicateConflictFromApiError(error)) {
        setOrderEditorError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
        return;
      }

      console.error("Не удалось сохранить заказ без оплаты.", error);
    } finally {
      setIsSavingOrder(false);
    }
  }

  async function handleCompleteOrder() {
    const unavailableReason = getCompleteOrderUnavailableReason({
      cartItemsCount: cartItems.length,
      hasOrderClient: Boolean(orderClient),
      hasSelectedExecutor: Boolean(selectedExecutor.id),
      hasCurrentShift: Boolean(currentShift),
      orderStatus,
      paymentStatus: payment.paymentStatus,
      discountInputError,
    });

    if (unavailableReason) {
      setOrderEditorError(unavailableReason);
      return;
    }

    if (!orderId || !orderClient || isSavingOrder) {
      setOrderEditorError("Заказ ещё загружается. Попробуйте выполнить его через несколько секунд.");
      return;
    }

    setIsSavingOrder(true);
    setOrderEditorError("");
    clearPendingAutosave();

    try {
      const persistedOrder = await persistOrderImmediately(
        buildCurrentOrderSnapshot(
          payment,
          orderClient,
          activeShiftSnapshot,
          "Выполнен",
        ),
        { clearPendingAutosave: true },
      );
      setOrderNumber(persistedOrder.number);
      clearCurrentDemoOrderId();
      router.push("/orders/list");
    } catch (error) {
      if (getDuplicateConflictFromApiError(error)) {
        setOrderEditorError(getApiErrorMessage(error, "Такой клиент или автомобиль уже есть в базе."));
        return;
      }

      setOrderEditorError(
        getApiErrorMessage(
          error,
          "Не удалось выполнить заказ. Проверьте смену, клиента, услуги и исполнителя.",
        ),
      );
    } finally {
      setIsSavingOrder(false);
    }
  }

  const paymentModalClientLabel = orderClient
    ? formatDemoOrderClientDisplay(orderClient, { includePhone: true })
    : clientStatusLabel;
  const paymentCommentCopy = getPaymentCommentFieldCopy(paymentEditorState.method);
  const selectedPaymentMethodOption =
    PAYMENT_METHOD_OPTIONS.find((option) => option.id === paymentEditorState.method) ??
    PAYMENT_METHOD_OPTIONS[0];
  const paymentModalRemainingAmount = getPaymentRemainingAmount(payment, total);
  const parsedPaymentAmount = parsePriceInput(paymentEditorState.amountValue);
  const paymentAmountOverRemaining =
    parsedPaymentAmount !== null &&
    Math.round(parsedPaymentAmount * 100) > Math.round(paymentModalRemainingAmount * 100);
  const paymentAmountValidationError = paymentAmountOverRemaining
    ? `Сумма оплаты больше остатка по заказу. Остаток к оплате: ${formatPrice(paymentModalRemainingAmount)}.`
    : "";
  const paymentModalError = paymentAmountValidationError || paymentEditorError;
  const paymentModalActions = (
    <div className="flex items-center justify-end gap-2 px-1 w-full">
      <button
        type="button"
        onClick={handlePaymentModalClose}
        className="h-10 flex-1 border border-[color:var(--border)] px-4 text-[14px] text-[color:var(--foreground)] sm:w-auto sm:flex-none"
      >
        Отмена
      </button>
      <button
        type="button"
        onClick={handlePaymentConfirm}
        disabled={
          parsedPaymentAmount === null ||
          !paymentEditorState.method ||
          Boolean(paymentAmountValidationError)
        }
        className="h-10 flex-1 border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 sm:w-auto sm:flex-none"
      >
        Принять
      </button>
    </div>
  );
  const paymentModalContent = (
    <div className="space-y-2 sm:space-y-2.5">
      <div className="min-w-0 rounded-t-[10px] border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 sm:hidden">
        <div className="min-w-0 space-y-0.5">
          <div className="text-[11px] leading-4 text-[color:var(--muted)]">
            Заказ №{orderNumber || "—"}
          </div>
          <div className="min-w-0 break-words text-[13px] font-medium leading-5 text-[color:var(--foreground)]">
            {paymentModalClientLabel}
          </div>
          <div className="pt-0.5 text-[11px] leading-4 text-[color:var(--muted)]">
            Итог к оплате
          </div>
          <div className="text-[16px] font-semibold leading-5 text-[color:var(--foreground)]">
            {formatPrice(total)}
          </div>
        </div>
      </div>

      <div className="hidden min-w-0 space-y-1 text-[13px] text-[color:var(--muted)] sm:block">
        <div>Заказ №{orderNumber || "—"}</div>
        <div className="min-w-0 break-words">Исполнитель: {selectedExecutor.label}</div>
        <div className="min-w-0 break-words">Клиент: {paymentModalClientLabel}</div>
      </div>

      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] font-medium text-[color:var(--foreground)] sm:text-[13px]">
          Сумма к оплате
        </span>
        <input
          type="number"
          min="0"
          step="1"
          value={paymentEditorState.amountValue}
          onChange={(event) => {
            setPaymentEditorError("");
            setPaymentEditorState((current) => ({
              ...current,
              amountValue: event.target.value,
            }));
          }}
          aria-invalid={Boolean(paymentAmountValidationError)}
          className={clsx(
            "h-9 w-full min-w-0 border px-3 text-[13px] text-[color:var(--foreground)] sm:h-10 sm:text-[14px]",
            paymentAmountValidationError
              ? "border-amber-300 bg-amber-50"
              : "border-[color:var(--border)]",
          )}
        />
        <span className="block text-[11px] leading-4 text-[color:var(--muted)]">
          Остаток к оплате: {formatPrice(paymentModalRemainingAmount)}
        </span>
        {paymentAmountValidationError ? (
          <span className="block text-[12px] leading-4 text-amber-800">
            {paymentAmountValidationError}
          </span>
        ) : null}
      </label>

      {paymentModalError && !paymentAmountValidationError ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
          {paymentModalError}
        </div>
      ) : null}

      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] font-semibold text-[color:var(--foreground)] sm:text-[13px]">
          Комментарий (юрлицо, реквизиты)
        </span>
        <input
          type="text"
          value={paymentEditorState.genericNote}
          onChange={(event) =>
            setPaymentEditorState((current) => ({
              ...current,
              genericNote: event.target.value,
            }))
          }
          placeholder="Например: ООО «Ромашка», ИНН..."
          className="h-9 w-full min-w-0 border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)] sm:h-10 sm:text-[14px]"
        />
        <p className="text-[11px] text-[color:var(--muted)]">
          Используйте это поле для ввода данных юрлица или специфичных пометок к оплате.
        </p>
      </label>

      {requiresDedicatedPaymentComment(paymentEditorState.method) ? (
        <label className="block min-w-0 space-y-1">
          <span className="text-[11px] font-semibold text-[color:var(--foreground)] sm:text-[13px]">
            {paymentCommentCopy.label}
          </span>
          <input
            type="text"
            value={paymentEditorState.paymentMethodNote}
            onChange={(event) =>
              setPaymentEditorState((current) => ({
                ...current,
                paymentMethodNote: event.target.value,
              }))
            }
            placeholder={paymentCommentCopy.placeholder}
            className="h-9 w-full min-w-0 border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)] sm:h-10 sm:text-[14px]"
          />
        </label>
      ) : null}

      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] font-semibold text-[color:var(--foreground)] sm:text-[13px]">
          Комментарий для нас
        </span>
        <input
          type="text"
          value={paymentEditorState.internalComment}
          onChange={(event) =>
            setPaymentEditorState((current) => ({
              ...current,
              internalComment: event.target.value,
            }))
          }
          placeholder="Внутренняя пометка по оплате"
          className="h-9 w-full min-w-0 border border-[color:var(--border)] bg-white px-3 text-[13px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)] sm:h-10 sm:text-[14px]"
        />
        <p className="text-[11px] text-[color:var(--muted)]">
          Видно только внутри CRM, в чек и печать не попадает.
        </p>
      </label>

      <label className="block min-w-0 space-y-1">
        <span className="text-[11px] font-semibold text-[color:var(--foreground)] sm:text-[13px]">
          Рекомендации клиенту (будут в чеке)
        </span>
        <textarea
          id="order-recommendation-field"
          value={orderRecommendation}
          onChange={(event) => setOrderRecommendation(event.target.value)}
          placeholder="Введите рекомендации..."
          className="min-h-[80px] w-full min-w-0 resize-y border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] text-[color:var(--foreground)] outline-none focus:border-[color:var(--primary)] sm:text-[14px]"
        />
        <button
          type="button"
          onClick={() => setOrderRecommendation(DEFAULT_ORDER_RECOMMENDATION)}
          className="text-[11px] text-[color:var(--primary)] underline underline-offset-2 hover:opacity-80"
        >
          Применить стандартную: «{DEFAULT_ORDER_RECOMMENDATION}»
        </button>
      </label>

      <div className="space-y-1 rounded-[6px] border border-slate-100 bg-slate-50 p-2.5">
        <div className="flex justify-between gap-3 text-[13px] text-slate-500">
          <span>Сумма заказа</span>
          <span className="shrink-0">{formatPrice(total)}</span>
        </div>
        <div className="mt-1 flex justify-between gap-3 border-t border-slate-200 pt-1 text-[15px] font-bold text-slate-900">
          <span>К оплате</span>
          <span className="shrink-0">{formatPrice(parsePriceInput(paymentEditorState.amountValue) || 0)}</span>
        </div>
      </div>

      <div className="space-y-1.5 rounded-[6px] border border-[color:var(--border)] bg-white p-2">
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-[color:var(--foreground)] sm:text-[12px]">
              Способ оплаты
            </div>
            <div className="mt-0.5 truncate text-[10px] leading-3 text-[color:var(--muted)] sm:text-[11px]">
              {selectedPaymentMethodOption.label}
            </div>
          </div>
          <span className="shrink-0 border border-[color:var(--primary)] bg-[#f7f3ff] px-1.5 py-0.5 text-[10px] font-semibold leading-3 text-[color:var(--primary)]">
            Выбран
          </span>
        </div>
        <div
          role="radiogroup"
          aria-label="Способ оплаты"
          className="grid min-w-0 grid-cols-2 gap-1.5"
        >
          {PAYMENT_METHOD_OPTIONS.map((option) => {
            const isSelected = option.id === paymentEditorState.method;
            const Icon = option.icon;

            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`Способ оплаты: ${option.label}`}
                onClick={() =>
                  setPaymentEditorState((current) => ({
                    ...current,
                    method: option.id,
                    accountId: "",
                  }))
                }
                className={clsx(
                  "flex min-h-[46px] min-w-0 items-center gap-1.5 overflow-hidden border px-2 py-1.5 text-left transition-colors sm:min-h-[48px] sm:px-2.5",
                  isSelected
                    ? "border-[color:var(--primary)] bg-[#f7f3ff] text-[color:var(--primary)] ring-1 ring-[color:var(--primary)]"
                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)] hover:bg-[color:var(--background)]",
                )}
              >
                <span
                  className={clsx(
                    "flex h-7 w-7 shrink-0 items-center justify-center border",
                    isSelected
                      ? "border-[color:var(--primary)] bg-white"
                      : "border-slate-200 bg-slate-50 text-[color:var(--muted)]",
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[11px] font-semibold leading-3 sm:text-[12px]">
                    {option.shortLabel}
                  </span>
                  <span className="block truncate text-[10px] leading-3 text-[color:var(--muted)] sm:text-[11px]">
                    {option.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  function handleInitializationUseExisting(conflict: ClientDuplicateConflict) {
    blockedInitializationKeyRef.current = null;
    bootstrapOrderCreateRef.current = null;

    const params = new URLSearchParams({
      clientId: conflict.clientId,
    });

    if (conflict.vehicleId) {
      params.set("vehicleId", conflict.vehicleId);
    }

    router.replace(`/orders?${params.toString()}`);
  }

  function handleInitializationConfirmSeparateVehicle() {
    blockedInitializationKeyRef.current = null;
    bootstrapOrderCreateRef.current = null;

    const params = new URLSearchParams(searchParams.toString());
    params.set("allowSamePlateDifferentVehicle", "1");

    router.replace(`/orders?${params.toString()}`);
  }

  if (!orderReady && !orderInitializationError && (queryOrderId || bootstrapIntentKey)) {
    return (
      <section
        aria-label="Загрузка заказа"
        className="w-full max-w-[1360px] animate-pulse space-y-3 pb-[180px] lg:flex lg:h-[calc(100dvh-32px)] lg:min-h-0 lg:max-w-none lg:flex-col lg:overflow-hidden lg:pb-0 lg:space-y-2"
      >
        <div className="border border-[color:var(--border)] bg-white">
          <div className="flex gap-2 border-b border-[color:var(--border)] px-4 py-3">
            <div className="h-8 w-28 bg-slate-100" />
            <div className="h-8 w-32 bg-slate-100" />
            <div className="h-8 w-36 bg-slate-100" />
          </div>
          <div className="space-y-3 bg-[color:var(--background)] px-5 py-4">
            <div className="h-5 w-52 bg-slate-200" />
            <div className="grid gap-3 border border-[color:var(--border)] bg-white p-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="h-12 bg-slate-100" />
              <div className="h-12 bg-slate-100" />
              <div className="h-12 bg-slate-100" />
              <div className="h-12 bg-slate-100" />
            </div>
          </div>
          <div className="space-y-3 p-4">
            <div className="h-10 bg-slate-100" />
            <div className="grid gap-3 lg:grid-cols-[minmax(280px,0.9fr)_minmax(0,1.6fr)]">
              <div className="h-64 bg-slate-100" />
              <div className="h-64 bg-slate-100" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="w-full max-w-[1360px] space-y-3 pb-[180px] lg:flex lg:h-[calc(100dvh-32px)] lg:min-h-0 lg:max-w-none lg:flex-col lg:overflow-hidden lg:pb-0 lg:space-y-2"
    >
      <div
        className="border border-[color:var(--border)] bg-white lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden"
      >
        <OrdersTabs activeTab="edit" editLabel={editTabLabel} />

        {orderInitializationError ? (
          <div className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-[13px] leading-5 text-amber-900">
            <div className="font-semibold">Проверьте клиента и автомобиль</div>
            <div className="mt-0.5">{orderInitializationError}</div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
              {orderInitializationDuplicateConflict ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      handleInitializationUseExisting(orderInitializationDuplicateConflict)
                    }
                    className="font-semibold text-[color:var(--primary)] hover:underline"
                  >
                    Использовать существующего
                  </button>
                  {orderInitializationDuplicateConflict.requiresConfirmation ? (
                    <button
                      type="button"
                      onClick={handleInitializationConfirmSeparateVehicle}
                      className="font-semibold text-[color:var(--primary)] hover:underline"
                    >
                      Создать отдельный
                    </button>
                  ) : null}
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => router.replace("/orders/new")}
                  className="font-semibold text-[color:var(--primary)] hover:underline"
                >
                  Вернуться к выбору клиента
                </button>
              )}
            </div>
          </div>
        ) : null}

        <div className="border-b border-[color:var(--border)] bg-[color:var(--background)] px-5 py-3 text-[14px] text-[color:var(--foreground)]">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 leading-5">
            <div className="flex items-center gap-1.5">
              <span className="text-[15px] font-semibold">Заказ №{orderNumber || "—"}</span>
              <span className="text-[14px] text-[color:var(--muted)]">
                от {orderCreatedAt ? formatDemoOrderDateTime(orderCreatedAt) : "—"}
              </span>
            </div>

            <span className="inline-flex items-center border border-[color:var(--border)] bg-[color:var(--background)] px-2.5 py-0.5 text-[13px] leading-5 text-[color:var(--foreground)]">
              {orderStatus}
            </span>
          </div>

          <div className="mt-3 grid gap-x-4 gap-y-2.5 border border-[color:var(--border)] bg-white px-3 py-3 lg:grid-cols-[minmax(180px,1.2fr)_minmax(160px,1fr)_minmax(180px,1fr)_minmax(160px,0.8fr)_auto]">
            <div>
              <div className="text-[12px] leading-4 text-[color:var(--muted)]">Клиент</div>
              <div className="mt-0.5 text-[16px] font-semibold leading-5 text-[color:var(--foreground)]">
                {clientStatusLabel}
              </div>
            </div>
            <div>
              <div className="text-[12px] leading-4 text-[color:var(--muted)]">Телефон</div>
              <div className="mt-0.5 text-[14px] leading-5 text-[color:var(--foreground)]">
                {clientPhoneLabel}
              </div>
            </div>
            <div>
              <div className="text-[12px] leading-4 text-[color:var(--muted)]">Автомобиль</div>
              <div className="mt-0.5 text-[14px] leading-5 text-[color:var(--foreground)]">
                {currentCarLabel}
              </div>
            </div>
            {currentPlateLabel ? (
              <div>
                <div className="text-[12px] leading-4 text-[color:var(--muted)]">Госномер</div>
                <div className="mt-0.5 text-[14px] leading-5 text-[color:var(--foreground)]">
                  {currentPlateLabel}
                </div>
              </div>
            ) : (
              <div />
            )}
            <div className="flex items-start justify-start gap-2 lg:justify-end">
              <button
                type="button"
                onClick={openClientEditor}
                disabled={payment.paymentStatus === "Оплачен" || isCompletedUnpaidOrder}
                className="inline-flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)] disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                aria-label="Изменить клиента"
                title="Изменить клиента"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={resetOrder}
                disabled={isCompletedUnpaidOrder}
                className="inline-flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)] disabled:cursor-not-allowed disabled:text-[color:var(--muted)]"
                aria-label="Сбросить заказ"
                title="Сбросить заказ"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {orderStatus === "Черновик" && orderId ? (
                <button
                  type="button"
                  onClick={() => setDeleteDraftConfirmOpen(true)}
                  className="inline-flex h-8 w-8 items-center justify-center border border-[color:var(--border)] bg-white text-[color:var(--foreground)] transition-colors hover:border-rose-300 hover:text-rose-500"
                  aria-label="Удалить черновик"
                  title="Удалить черновик"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              ) : null}
            </div>
          </div>

          {orderEditorError ? (
            <div className="mt-2.5 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900">
              {orderEditorError}
            </div>
          ) : null}

          <div className="mt-2.5 grid gap-2 sm:hidden">
            <div className="rounded-[4px] border border-[color:var(--border)] bg-white px-3 py-2">
              <div className="text-[12px] leading-4 text-[color:var(--muted)]">Тип ТС</div>
              <div className="mt-1 text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
                {selectedVehicle.label} · {formatRadiusDisplayLabel(vehicleType, radius)}
              </div>
            </div>
            <div className="rounded-[4px] border border-[color:var(--border)] bg-white px-3 py-2">
              <div className="text-[12px] leading-4 text-[color:var(--muted)]">Исполнитель</div>
              <div className="mt-1 truncate text-[14px] font-medium leading-5 text-[color:var(--foreground)]">
                {selectedExecutor.label}
              </div>
            </div>
            <div className="rounded-[4px] border border-[color:var(--border)] bg-white px-3 py-2">
              <div className="text-[12px] leading-4 text-[color:var(--muted)]">Итог</div>
              <div className="mt-1 text-[18px] font-semibold leading-5 text-[color:var(--foreground)] tabular-nums">
                {formatPrice(total)}
              </div>
            </div>
          </div>

          {clientEditorOpen ? (
            <DemoModal
              title="Выбор клиента"
              onClose={closeClientEditor}
              maxWidthClassName="sm:max-w-[760px]"
              bodyClassName="px-4 py-3 sm:px-5 sm:py-3"
              actionsClassName="px-4 py-2.5 sm:px-5"
              actions={
                <>
                  <button
                    type="button"
                    onClick={closeClientEditor}
                    className="h-9 min-w-[96px] border border-[color:var(--border)] px-4 text-[14px] text-[color:var(--foreground)]"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleClientSave}
                    disabled={clientEditorSaveDisabled}
                    className="h-9 min-w-[112px] border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
                  >
                    Сохранить
                  </button>
                </>
              }
            >
              <div className="mb-2.5 space-y-2">
                <div className="text-[13px] font-medium text-[color:var(--foreground)] lowercase opacity-50">
                  Тип карточки клиента:
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
                  {[
                    { id: "existing" as const, label: "Есть в базе" },
                    { id: "new" as const, label: "Новый клиент" },
                    { id: "anonymous" as const, label: "Пропустить" },
                  ].map((mode) => (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => {
                        setClientEditorError("");
                        setClientEditorMode(mode.id);
                        if (mode.id === "anonymous") {
                          setClientDropdownOpen(false);
                        }
                      }}
                      className={clsx(
                        "h-8 whitespace-nowrap border px-3 text-[13px] font-medium transition-colors",
                        clientEditorMode === mode.id
                          ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                          : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                      )}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                {clientEditorMode === "existing" ? (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <div className="text-[13px] font-medium text-[color:var(--foreground)]">
                        Выберите клиента
                      </div>

                      <div ref={clientDropdownRef} className="relative">
                        <div className="relative">
                          <input
                            value={clientInputValue}
                            onFocus={() => setClientDropdownOpen(true)}
                            onChange={(event) => {
                              setClientSearchValue(event.target.value);
                              setClientDropdownOpen(true);
                            }}
                            placeholder={clientInputPlaceholder}
                            className="h-10 w-full border border-[color:var(--border)] bg-white px-3 pr-10 text-[14px] text-[color:var(--foreground)] outline-none placeholder:text-[#9ca3af] focus:border-[color:var(--primary)]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setClientDropdownOpen((current) => {
                                const nextValue = !current;

                                if (!nextValue) {
                                  setClientSearchValue("");
                                }

                                return nextValue;
                              });
                            }}
                            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-[color:var(--muted)]"
                            aria-label="Показать клиентов"
                          >
                            <ChevronDown className="h-4 w-4" />
                          </button>
                        </div>

                        {clientDropdownOpen ? (
                          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-[320px] overflow-auto border border-[color:var(--border)] bg-white shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
                            {filteredClients.map(({ client, selectedVehicle }, index) => {
                              const vehicle = selectedVehicle ?? null;
                              const vehicleId = vehicle?.id ?? "none";
                              return (
                                <button
                                  key={`${client.id}-${vehicleId}-${index}`}
                                  type="button"
                                  onClick={() => {
                                    handleClientSelect(client.id, vehicle?.id ?? null);
                                  }}
                                  className={clsx(
                                    "flex w-full flex-col px-3 py-2.5 text-left border-b border-[color:var(--border)] last:border-0",
                                    selectedClientId === client.id
                                      ? "bg-[color:var(--primary)]/5"
                                      : "hover:bg-[color:var(--background)]",
                                  )}
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-semibold text-[color:var(--foreground)]">
                                      {client.name || "Анонимный клиент"}
                                    </span>
                                    {client.phone && (
                                       <span className="text-[12px] text-[color:var(--muted)]">
                                         {client.phone}
                                       </span>
                                    )}
                                  </div>
                                  <span className="mt-0.5 text-[13px] text-[color:var(--muted)] flex gap-2">
                                    {vehicle ? (
                                      <>
                                        <span className="text-[color:var(--foreground)]">{getVehicleLabel(vehicle)}</span>
                                      </>
                                    ) : (
                                      <span>Автомобиль не указан</span>
                                    )}
                                  </span>
                                </button>
                              );
                            })}

                            {filteredClients.length === 0 ? (
                              <div className="px-3 py-3 text-[13px] text-[color:var(--muted)]">
                                Ничего не найдено
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {selectedClientId !== "anonymous" && (
                      <div className="mt-3 space-y-3 border-t border-[color:var(--border)] pt-3">
                        <div className="space-y-2">
                          <div className="text-[13px] font-semibold text-[color:var(--foreground)]">
                            Автопарк клиента
                          </div>
                          <VehicleFleetPicker
                            vehicles={selectedExistingClient?.vehicles ?? []}
                            selectedVehicleId={selectedVehicleId}
                            onSelectVehicle={(vehicle) => {
                              setSelectedVehicleId(vehicle.id);
                              updateClientForm("carBrand", vehicle.brand);
                              updateClientForm("carModel", vehicle.model);
                              updateClientForm("plateNumber", vehicle.plateNumber);
                            }}
                            onAddVehicle={() => {
                              setSelectedVehicleId(null);
                              updateClientForm("carBrand", "");
                              updateClientForm("carModel", "");
                              updateClientForm("plateNumber", "");
                            }}
                            addLabel="Добавить новый"
                            addIcon={<Plus className="h-3.5 w-3.5" />}
                          />
                        </div>

                        <div className="space-y-3">
                          <VehicleMakeModelPicker
                            brandValue={clientForm.carBrand}
                            modelValue={clientForm.carModel}
                            onBrandChange={(value) => updateClientVehicleForm("carBrand", value)}
                            onModelChange={(value) => updateClientVehicleForm("carModel", value)}
                            compact
                          />

                          <PlateInput
                            value={clientForm.plateNumber}
                            onChange={(value) => updateClientVehicleForm("plateNumber", value)}
                            compact
                          />
                        </div>

                        {existingVehicleDuplicateConflict ? (
                          <DuplicateClientWarning
                            conflict={existingVehicleDuplicateConflict}
                            onSelect={() => selectDuplicateConflict(existingVehicleDuplicateConflict)}
                            onConfirm={() => {
                              setClientEditorError("");
                              setConfirmedSamePlateKey(existingVehicleConfirmationKey);
                            }}
                            confirmed={existingVehicleSamePlateConfirmed}
                          />
                        ) : null}

                        {!existingVehicleReady && !existingVehicleDuplicateConflict ? (
                          <div className="text-[13px] leading-5 text-[#c45b5b]">
                            Выберите автомобиль клиента или добавьте новый с маркой и госномером.
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                ) : clientEditorMode === "new" ? (
                  <div className="space-y-2.5">
                    <div className="flex gap-1.5 border-b border-[color:var(--border)] pb-2.5">
                      {[
                        { id: "individual" as const, label: "Физ. лицо" },
                        { id: "legal" as const, label: "Юр. лицо (ИП/ООО)" },
                      ].map((kind) => (
                        <button
                          key={kind.id}
                          type="button"
                          onClick={() => updateClientForm("clientKind", kind.id)}
                          className={clsx(
                            "px-3 py-1 text-[12px] font-medium transition-colors",
                            clientForm.clientKind === kind.id
                              ? "bg-[color:var(--primary)] text-white"
                              : "bg-[color:var(--background)] text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                          )}
                        >
                          {kind.label}
                        </button>
                      ))}
                    </div>

                    {clientForm.clientKind === "legal" ? (
                      <div className="space-y-2.5">
                        <label className="block space-y-1">
                          <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                            Название организации
                          </span>
                          <input
                            value={clientForm.organizationName}
                            onChange={(event) => updateClientForm("organizationName", event.target.value)}
                            placeholder="Например: ООО «Auto CRM», ИП Иванов"
                            className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)]"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                            ИНН (необязательно)
                          </span>
                          <input
                            value={clientForm.inn}
                            onChange={(event) => updateClientForm("inn", event.target.value)}
                            placeholder="Введите ИНН"
                            inputMode="numeric"
                            className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)]"
                          />
                          {clientForm.inn && !validateInn(clientForm.inn) ? (
                            <div className="text-[12px] leading-4 text-[#c45b5b]">
                              ИНН должен содержать 10 или 12 цифр.
                            </div>
                          ) : null}
                        </label>
                        <label className="block space-y-1">
                          <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                            Номер договора
                          </span>
                          <input
                            value={clientForm.contractNumber}
                            onChange={(event) => updateClientForm("contractNumber", event.target.value)}
                            placeholder="Например, 12/04-26, A-17"
                            className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)]"
                          />
                        </label>
                      </div>
                    ) : null}

                    {clientForm.clientKind === "individual" ? (
                      <label className="block space-y-1">
                        <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                          ФИО
                        </span>
                        <input
                          value={clientForm.fullName}
                          onChange={(event) => updateClientForm("fullName", event.target.value)}
                          placeholder="Антон, Антон Иванов или Иванов Антон Петрович"
                          className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)]"
                        />
                      </label>
                    ) : null}

                    <label className="block space-y-1">
                      <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                        Телефон
                      </span>
                      <div className="flex h-10 w-full items-center border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] focus-within:border-[color:var(--primary)]">
                        <span className="mr-2 shrink-0 text-[color:var(--muted)]">+7</span>
                        <input
                          value={formatAuthPhoneInput(clientForm.phone)}
                          onChange={(event) => updateClientForm("phone", event.target.value)}
                          placeholder="999 999-99-99"
                          className="w-full bg-transparent outline-none"
                          inputMode="numeric"
                        />
                      </div>
                    </label>

                    <VehicleMakeModelPicker
                      brandValue={clientForm.carBrand}
                      modelValue={clientForm.carModel}
                      onBrandChange={(value) => updateClientForm("carBrand", value)}
                      onModelChange={(value) => updateClientForm("carModel", value)}
                      compact
                    />

                    <PlateInput
                      value={clientForm.plateNumber}
                      onChange={(value) => updateClientForm("plateNumber", value)}
                      compact
                    />

                    {newClientDuplicateConflict ? (
                      <DuplicateClientWarning
                        conflict={newClientDuplicateConflict}
                        onSelect={() => selectDuplicateConflict(newClientDuplicateConflict)}
                        onConfirm={() => {
                          setClientEditorError("");
                          setConfirmedSamePlateKey(newClientConfirmationKey);
                        }}
                        confirmed={newClientSamePlateConfirmed}
                      />
                    ) : null}

                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="border border-[color:var(--border)] bg-[color:var(--background)] px-3.5 py-2.5 text-[14px] leading-5 text-[color:var(--foreground)]">
                      Запись будет сохранена как заказ без клиентской карты. Марку, модель и
                      госномер можно указать ниже.
                    </div>
                    <VehicleMakeModelPicker
                      brandValue={clientForm.carBrand}
                      modelValue={clientForm.carModel}
                      onBrandChange={(value) => updateClientForm("carBrand", value)}
                      onModelChange={(value) => updateClientForm("carModel", value)}
                      brandLabel="Марка автомобиля (необязательно)"
                      modelLabel="Модель автомобиля (необязательно)"
                      compact
                    />
                    <PlateInput
                      value={clientForm.plateNumber}
                      onChange={(value) => updateClientForm("plateNumber", value)}
                      compact
                    />
                  </div>
                )}
              </div>

              <div className="border border-[color:var(--border)] bg-[color:var(--background)]/55 px-3.5 py-3 mt-4">
                <div className="text-[12px] font-medium leading-4 text-[color:var(--muted)]">
                  Будет сохранено в заказ
                </div>
                <div className="mt-2.5 space-y-2">
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2.5">
                    <div className="pt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">Клиент</div>
                    <div className="text-[15px] font-semibold leading-5 text-[color:var(--foreground)]">
                      {clientPreviewName}
                    </div>
                  </div>
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2.5">
                    <div className="pt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">Телефон</div>
                    <div className="text-[14px] leading-5 text-[color:var(--foreground)]">
                      {clientPreviewPhone || "Не указан"}
                    </div>
                  </div>
                  <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-2.5">
                    <div className="pt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">Автомобиль</div>
                    <div className="text-[14px] leading-5 text-[color:var(--foreground)]">
                      {clientPreviewCarLabel}
                    </div>
                  </div>
                </div>
              </div>

              {clientEditorError ? (
                <div className="mt-3 text-[13px] leading-5 text-[#c45b5b]">
                  {clientEditorError}
                </div>
              ) : null}

            </DemoModal>
          ) : null}
        </div>

        <div className="space-y-2.5 px-5 py-3">
          <div className="flex flex-wrap gap-1.5">
            {VEHICLE_TYPES.map((item) => {
              const active = item.id === vehicleType;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleVehicleTypeChange(item.id)}
                  className={clsx(
                    "min-w-[112px] border px-4 py-2.5 text-[14px] leading-5",
                    active
                      ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                      : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>

          {!isCommercialVehicle ? (
            <div className="flex flex-wrap gap-1.5">
              {[
                {
                  key: "standard",
                  active: !lowProfile && !runflat,
                  label: "Стандарт",
                  onClick: resetTireModifiers,
                },
                {
                  key: "low-profile",
                  active: lowProfile,
                  label: "Низкий профиль",
                  onClick: toggleLowProfile,
                },
                {
                  key: "runflat",
                  active: runflat,
                  label: "RunFlat",
                  onClick: toggleRunflat,
                },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className={clsx(
                    "border px-3.5 py-2 text-[14px] leading-5",
                    item.active
                      ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                      : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-1">
            {radiusOptions.map((item) => {
              const active = item.value === radius;

              return (
                <button
                  key={`${vehicleType}-${item.value}`}
                  type="button"
                  onClick={() => setRadius(item.value)}
                  className={clsx(
                    "flex min-h-[32px] min-w-[54px] items-center justify-center border px-2 text-[13px] leading-none transition-all active:scale-[0.97]",
                    active
                      ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white font-medium shadow-sm"
                      : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)]/50",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-[color:var(--border)] px-5">
          <div className="overflow-x-auto overflow-y-hidden xl:overflow-visible">
            <div className="flex w-max min-w-full flex-nowrap gap-x-6 gap-y-1 pt-1.5 xl:w-full xl:min-w-0 xl:flex-wrap xl:gap-x-5 xl:gap-y-0 xl:pt-1">
              {orderCategoryTabs.map((category) => {
                const active = category.id === activeCategoryId;

                return (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategoryId(category.id)}
                    className={clsx(
                      "border-b-2 px-0.5 py-2.5 text-left text-[15px] leading-6 xl:py-2",
                      active
                        ? "border-[color:var(--primary)] font-medium text-[color:var(--primary)]"
                        : "border-transparent text-[color:var(--foreground)]",
                    )}
                  >
                    {category.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-[color:var(--border)] px-4 py-3 sm:hidden">
          <div className="space-y-3">
                <div className="border border-[color:var(--border)] bg-white">
                  <div className="border-b border-[color:var(--border)] px-4 py-3">
                    <div className="space-y-2.5">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--muted)]" />
                        <input
                          type="text"
                          aria-label="Фильтр каталога услуг"
                          placeholder="Фильтр каталога..."
                          value={catalogSearchQuery}
                          onChange={(e) => setCatalogSearchQuery(e.target.value)}
                          className="h-9 w-full border border-[color:var(--border)] bg-white pl-8 pr-8 text-[14px] outline-none focus:border-[color:var(--primary)]"
                        />
                        {catalogSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setCatalogSearchQuery("")}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {showPressureQuickSearch ? (
                        <button
                          type="button"
                          onClick={() => setCatalogSearchQuery("Проверка давления")}
                          className="inline-flex h-8 items-center gap-1.5 border border-[color:var(--border)] bg-white px-2.5 text-[12px] font-medium text-[color:var(--foreground)] transition-colors active:scale-[0.97]"
                        >
                          <RefreshCw className="h-3 w-3" />
                          Проверка давления
                        </button>
                      ) : null}
                    </div>
                  </div>

              <div className="divide-y divide-[color:var(--border)] pt-2">
                {visibleServices.map((item) => {
                  const resolvedPricing = resolveCatalogServicePricing(item, pricingContext);
                  const disabled = resolvedPricing.disabled;
                  const currentQuantity = getCurrentQuantity(item);
                  const unitLabel =
                    disabled || resolvedPricing.unitPrice === null
                      ? null
                      : getCatalogServiceUnitLabel(item);
                  const quickQuantities = getQuickQuantityOptions(item, vehicleType);
                  const displayedUnitPrice =
                    disabled || resolvedPricing.unitPrice === null
                      ? null
                      : isMainPackageService(item)
                        ? getMainPackagePerWheelPrice(resolvedPricing.unitPrice)
                        : resolvedPricing.unitPrice;

                  return (
                    <div
                      key={getCatalogServiceId(item)}
                      className={clsx(
                        "space-y-2.5 py-2.5",
                        disabled
                          ? "bg-[color:var(--background)]/45 text-[color:var(--muted)]"
                          : "bg-white text-[color:var(--foreground)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-left">
                            <div className="text-[16px] font-semibold leading-5 text-[color:var(--foreground)]">
                              {getCatalogServiceName(item)}
                            </div>
                            <div className="mt-1 text-[12px] leading-4 text-[color:var(--muted)]">
                              {isMainPackageService(item)
                                ? "Базовый комплект для всего автомобиля"
                                : "Укажите необходимое количество"}
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[12px] text-[color:var(--muted)]">Цена</div>
                          <div className="mt-0.5 text-[16px] font-semibold leading-5">
                            {displayedUnitPrice === null
                              ? "Недоступно"
                              : formatPrice(displayedUnitPrice)}
                          </div>
                          {unitLabel ? (
                            <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--muted)]">
                              {unitLabel}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex overflow-hidden border border-[color:var(--border)]">
                          {quickQuantities.map((quantity, index) => (
                            <button
                              key={quantity}
                              type="button"
                              onClick={() => setServiceQuantity(item, quantity)}
                              disabled={disabled}
                              className={clsx(
                                "flex h-10 w-11 items-center justify-center text-[16px]",
                                index > 0 ? "border-l border-[color:var(--border)]" : "",
                                currentQuantity === quantity
                                  ? "bg-[color:var(--primary)] text-white"
                                  : "bg-white text-[color:var(--foreground)]",
                                disabled
                                  ? "cursor-not-allowed bg-[color:var(--background)] text-[color:var(--muted)]"
                                  : "",
                              )}
                            >
                              {quantity}
                            </button>
                          ))}
                        </div>
                        {disabled ? (
                          <div className="text-[12px] leading-5 text-[color:var(--muted)]">
                            Для выбранного типа автомобиля услуга недоступна.
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}

                {visibleServices.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[color:var(--muted)]">
                    {servicesCatalogReady
                      ? servicesCatalogError ?? "Для этой категории пока нет услуг"
                      : (
                          <div className="space-y-4 pt-2">
                            {Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="flex justify-between items-center px-2 py-1">
                                <div className="space-y-2 w-full">
                                  <Skeleton className="h-5 w-48" />
                                  <Skeleton className="h-3 w-32" />
                                </div>
                                <Skeleton className="h-8 w-[120px] rounded" />
                              </div>
                            ))}
                          </div>
                      )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="border border-[color:var(--border)] bg-white">
              <div className="border-b border-[color:var(--border)] px-3 py-2.5">
                <div className="text-[15px] font-semibold text-[color:var(--foreground)]">
                  Позиции заказа
                </div>
                <div className="mt-0.5 text-[13px] text-[color:var(--muted)]">
                  {servicesCount > 0 ? `Позиций: ${servicesCount}` : "Услуги ещё не выбраны"}
                </div>
              </div>

              {cartItems.length === 0 ? (
                <div className="px-4 py-6">
                  <div className="border border-dashed border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4 text-center text-[14px] leading-6 text-[color:var(--muted)]">
                    Сначала выберите услугу выше. После этого позиция появится здесь.
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-[color:var(--border)]">
                  {cartItems.map((item) => (
                    <div key={item.key} className="space-y-3 px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[16px] font-medium leading-5 text-[color:var(--foreground)]">
                            {item.serviceName}
                          </div>
                          <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
                            {formatItemParameters(item)}
                          </div>
                          {item.pricingSnapshot.selectedOptionLabel ||
                          item.pricingSnapshot.operatorNote ? (
                            <div className="mt-1 text-[12px] leading-5 text-[color:var(--muted)]">
                              {item.pricingSnapshot.selectedOptionLabel
                                ? item.pricingSnapshot.selectedOptionLabel
                                : item.pricingSnapshot.operatorNote}
                            </div>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          className="flex h-9 w-9 shrink-0 items-center justify-center border border-[color:var(--border)] text-[color:var(--muted)]"
                          aria-label={`Удалить ${item.serviceName}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-[12px] text-[color:var(--muted)]">Цена</div>
                          {item.pricingSnapshot.inputKind === "none" ? (
                            <div className="mt-0.5 text-[15px] text-[color:var(--foreground)] tabular-nums">
                              {formatPrice(item.unitPrice)}
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openPriceEditorForCartItem(item)}
                              className="mt-0.5 inline-flex items-center gap-1.5 text-[15px] text-[color:var(--primary)] tabular-nums"
                              title="Уточнить цену"
                              aria-label={`Уточнить цену для ${item.serviceName}`}
                            >
                              <span>{formatPrice(item.unitPrice)}</span>
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                          )}
                          {getCartItemUnitMeta(item) ? (
                            <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--muted)]">
                              {getCartItemUnitMeta(item)}
                            </div>
                          ) : null}
                        </div>
                        <div className="text-right">
                          <div className="text-[12px] text-[color:var(--muted)]">Сумма</div>
                          <div className="mt-0.5 text-[16px] font-semibold text-[color:var(--foreground)] tabular-nums">
                            {formatPrice(item.unitPrice * item.quantity)}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => changeTableItemQuantity(item.key, item.quantity - 1)}
                          className="flex h-10 w-10 items-center justify-center border border-[color:var(--border)] text-[14px]"
                        >
                          -
                        </button>
                        <span className="w-8 text-center text-[15px] font-medium text-[color:var(--foreground)]">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => changeTableItemQuantity(item.key, item.quantity + 1)}
                          className="flex h-10 w-10 items-center justify-center border border-[color:var(--border)] text-[14px]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="hidden overflow-x-auto border-t border-[color:var(--border)] sm:block lg:min-h-0 lg:flex-1 lg:overflow-x-auto lg:overflow-y-hidden xl:overflow-hidden">
          <div className="min-w-[1236px] lg:h-full lg:min-h-0 xl:w-full xl:min-w-0">
            <div className="grid grid-cols-[552px_minmax(0,1fr)] lg:h-full lg:min-h-0 xl:grid-cols-[minmax(468px,32%)_minmax(0,1fr)]">
              <div className="border-r border-[color:var(--border)] px-5 py-4 lg:flex lg:min-h-0 lg:flex-col lg:overflow-hidden">
                <div className="border-b border-[color:var(--border)] pb-3">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <div className="relative min-w-[260px] flex-1">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" />
                      <input
                        type="text"
                        aria-label="Фильтр каталога услуг"
                        placeholder="Фильтр каталога: название или цена"
                        value={catalogSearchQuery}
                        onChange={(e) => setCatalogSearchQuery(e.target.value)}
                        className="h-9 w-full border border-[color:var(--border)] bg-white pl-9 pr-8 text-[14px] outline-none transition-colors focus:border-[color:var(--primary)]"
                      />
                      {catalogSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCatalogSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[color:var(--muted)]"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    {showPressureQuickSearch ? (
                      <button
                        type="button"
                        onClick={() => setCatalogSearchQuery("Проверка давления")}
                        className="inline-flex h-9 items-center gap-1.5 border border-[color:var(--border)] bg-white px-3 text-[12px] font-medium text-[color:var(--foreground)] transition-colors hover:border-[color:var(--primary)]/50 hover:text-[color:var(--primary)] active:scale-[0.97]"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Проверка давления
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className="divide-y divide-[color:var(--border)] pt-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                  {visibleServices.map((item) => {
                    const resolvedPricing = resolveCatalogServicePricing(
                      item,
                      pricingContext,
                    );
                    const disabled = resolvedPricing.disabled;
                    const currentQuantity = getCurrentQuantity(item);
                    const quickQuantities = getQuickQuantityOptions(item, vehicleType);

                    return (
                      <div
                        key={getCatalogServiceId(item)}
                        className="grid grid-cols-[minmax(0,1fr)_164px] items-center gap-3 py-2.5"
                      >
                        <div
                          className={clsx(
                            "min-w-0 text-left text-[15px] leading-5",
                            disabled
                              ? "text-[color:var(--muted)]"
                              : "text-[color:var(--foreground)]",
                          )}
                          title={getCatalogServiceDescription(item)}
                        >
                          <div
                            className={clsx(
                              "truncate text-[15px] font-semibold leading-5",
                              disabled ? "text-[color:var(--muted)]" : "text-[color:var(--foreground)]",
                            )}
                            title={getCatalogServiceName(item)}
                          >
                            {getCatalogServiceName(item)}
                          </div>
                          <div className="mt-1 text-[12px] leading-4 text-[color:var(--muted)]">
                            {isMainPackageService(item)
                              ? "Базовый комплект для всего автомобиля"
                              : "Укажите необходимое количество"}
                          </div>
                        </div>

                        <div className="flex justify-start">
                          <div className="flex items-center gap-2">
                            <div className="flex overflow-hidden border border-[color:var(--border)]">
                            {quickQuantities.map((quantity, index) => (
                              <button
                                key={quantity}
                                type="button"
                                onClick={() => setServiceQuantity(item, quantity)}
                                disabled={disabled}
                                className={clsx(
                                  "flex h-10 w-10 items-center justify-center text-[15px]",
                                  index > 0 ? "border-l border-[color:var(--border)]" : "",
                                  currentQuantity === quantity
                                    ? "bg-[color:var(--primary)] text-white"
                                    : "bg-white text-[color:var(--foreground)]",
                                  disabled
                                    ? "cursor-not-allowed bg-[color:var(--background)] text-[color:var(--muted)]"
                                    : "",
                                )}
                              >
                                {quantity}
                              </button>
                            ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {visibleServices.length === 0 ? (
                    <div className="pt-10 text-center text-sm text-[color:var(--muted)]">
                      {servicesCatalogReady
                        ? servicesCatalogError ?? "Для этой категории пока нет услуг"
                        : (
                            <div className="space-y-4 pt-2">
                              {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="flex justify-between items-center px-2 py-1">
                                  <div className="space-y-2 w-full">
                                    <Skeleton className="h-5 w-64" />
                                    <Skeleton className="h-3 w-40" />
                                  </div>
                                  <Skeleton className="h-10 w-[120px] rounded" />
                                </div>
                              ))}
                            </div>
                        )}
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="flex min-h-[420px] flex-col lg:h-full lg:min-h-0">
                <div className="grid grid-cols-[minmax(0,1fr)_92px_96px_112px_44px] border-b border-[color:var(--border)] px-4 py-3 text-[14px] leading-5 text-[color:var(--muted)]">
                  <span>Выбранные услуги</span>
                  <span>Цена</span>
                  <span>Кол-во</span>
                  <span>Стоимость</span>
                  <span />
                </div>

                {cartItems.length === 0 ? (
                  <div className="flex min-h-[300px] flex-1 items-center justify-center px-8 lg:min-h-0">
                    <div className="w-full max-w-[420px] border border-dashed border-[color:var(--border)] bg-[color:var(--background)] px-6 py-7 text-center text-[15px] text-[color:var(--muted)]">
                      <div className="font-medium text-[color:var(--foreground)]">Услуги ещё не выбраны</div>
                      <div className="mt-1 text-[14px]">
                        Слева доступен каталог работ для текущих параметров
                      </div>
                      <div className="mt-2 text-[13px]">
                        Для услуг с диапазоном или свободной ценой касса попросит уточнить сумму
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-[color:var(--border)] lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
                    {cartItems.map((item) => (
                      <div
                        key={item.key}
                        className="flex flex-col gap-3 px-4 py-4 text-[15px] sm:grid sm:grid-cols-[minmax(0,1fr)_92px_96px_112px_44px] sm:items-center"
                      >
                        <div className="flex min-w-0 items-start justify-between sm:block">
                          <div className="min-w-0 pr-4 sm:pr-0">
                            <div className="font-medium leading-5 text-[color:var(--foreground)] sm:truncate sm:leading-6">
                              {item.serviceName}
                            </div>
                            <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)] sm:text-[14px]">
                              {formatItemParameters(item)}
                            </div>
                            {item.pricingSnapshot.selectedOptionLabel ||
                            item.pricingSnapshot.operatorNote ? (
                              <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
                                {item.pricingSnapshot.selectedOptionLabel
                                  ? item.pricingSnapshot.selectedOptionLabel
                                  : item.pricingSnapshot.operatorNote}
                              </div>
                            ) : null}
                          </div>

                          <button
                            type="button"
                            onClick={() => removeItem(item.key)}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--border)] bg-white text-[color:var(--muted)] sm:hidden"
                            aria-label={`Удалить ${item.serviceName}`}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-3 rounded-md bg-[#fcfcfe] p-3 sm:contents sm:rounded-none sm:bg-transparent sm:p-0">
                          <div>
                            <div className="mb-0.5 text-[11px] text-[color:var(--muted)] sm:hidden">Цена</div>
                            {item.pricingSnapshot.inputKind === "none" ? (
                              <div className="text-[15px] font-medium text-[color:var(--foreground)] tabular-nums sm:font-normal">
                                {formatPrice(item.unitPrice)}
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openPriceEditorForCartItem(item)}
                                className="inline-flex items-center gap-1.5 text-[15px] text-[color:var(--primary)] tabular-nums"
                                title="Уточнить цену"
                                aria-label={`Уточнить цену для ${item.serviceName}`}
                              >
                                <span>{formatPrice(item.unitPrice)}</span>
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {getCartItemUnitMeta(item) ? (
                              <div className="mt-0.5 text-[11px] leading-4 text-[color:var(--muted)]">
                                {getCartItemUnitMeta(item)}
                              </div>
                            ) : null}
                          </div>

                          <div className="flex items-center gap-1 sm:gap-2">
                            <button
                              type="button"
                              onClick={() => changeTableItemQuantity(item.key, item.quantity - 1)}
                              className="flex h-9 w-9 items-center justify-center border border-[color:var(--border)] bg-white text-[18px]"
                            >
                              -
                            </button>
                            <span className="w-8 text-center text-[15px] font-medium text-[color:var(--foreground)]">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => changeTableItemQuantity(item.key, item.quantity + 1)}
                              className="flex h-9 w-9 items-center justify-center border border-[color:var(--border)] bg-white text-[16px]"
                            >
                              +
                            </button>
                          </div>

                          <div className="text-right sm:text-left">
                            <div className="mb-0.5 text-[11px] text-[color:var(--muted)] sm:hidden">Сумма</div>
                            <div className="text-[16px] font-semibold text-[color:var(--foreground)] tabular-nums sm:text-[15px] sm:font-medium">
                              {formatPrice(item.unitPrice * item.quantity)}
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.key)}
                          className="hidden h-9 w-9 items-center justify-center text-[color:var(--muted)] sm:flex"
                          aria-label={`Удалить ${item.serviceName}`}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          </div>
        </div>

        <div className="mt-auto sm:sticky sm:bottom-[calc(56px+env(safe-area-inset-bottom))] lg:bottom-0 sm:z-10 border-t border-[color:var(--border)] bg-white px-4 py-4 sm:px-5 sm:py-0 lg:shrink-0 shadow-[0_-1px_0_0_var(--border)]">
          <div className="flex flex-col gap-2 xl:grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="text-[13px] leading-5 text-[color:var(--muted)] sm:hidden sm:text-[12px] sm:leading-4">
                Цена фиксируется в заказе на момент выбора услуги
              </div>

              {(executorChips.length > 0 || executorOptions.length > 0) ? (
                <div className="space-y-1 lg:space-y-0">
                  <div className="flex flex-col gap-1 lg:flex-row lg:flex-wrap lg:items-center lg:gap-1">
                    <div className="text-[12px] font-medium leading-4 text-[color:var(--muted)] sm:text-[11px]">
                      Исполнитель
                    </div>

                    {executorChips.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5">
                        {executorChips.map((chip) => {
                          const isSelected = executorIds.includes(chip.id);

                          return (
                            <button
                              key={chip.id}
                              type="button"
                              onClick={() => {
                                setExecutorIds((prev) =>
                                  prev.includes(chip.id)
                                    ? prev.filter((id) => id !== chip.id)
                                    : [...prev, chip.id],
                                );
                                setShowExecutorSelect(false);
                              }}
                              title={chip.amount !== null ? `Заработано: ${formatPrice(chip.amount)}` : undefined}
                              className={clsx(
                                "flex min-h-[32px] min-w-[96px] flex-col items-start justify-center border px-2.5 py-[3px] text-left leading-4 transition-all active:scale-[0.97] sm:min-h-[28px] sm:min-w-[82px] sm:max-w-[130px] sm:px-2 sm:py-[2px]",
                                isSelected
                                  ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white shadow-sm font-semibold"
                                  : chip.isLeft
                                    ? "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--muted)] opacity-75 hover:border-[color:var(--primary)]/40 hover:opacity-100"
                                    : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)]/50",
                              )}
                            >
                              <span className="flex max-w-full items-center gap-1.5">
                                <span className="truncate text-[13px] leading-4 sm:text-[12px] sm:leading-3.5">
                                  {chip.label}
                                </span>
                                {chip.isLeft ? (
                                  <span
                                    className={clsx(
                                      "shrink-0 border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                                      isSelected
                                        ? "border-white/35 text-white/85"
                                        : "border-[color:var(--border)] text-[color:var(--muted)]",
                                    )}
                                  >
                                    ушёл
                                  </span>
                                ) : null}
                              </span>
                              {chip.amount !== null ? (
                                <span
                                  className={clsx(
                                    "mt-0.5 text-[11px] leading-3 sm:hidden font-medium",
                                    isSelected ? "text-white/80" : "text-[color:var(--muted)]",
                                  )}
                                >
                                  {formatPrice(chip.amount)}
                                </span>
                              ) : null}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}

                    {currentShift && otherExecutorOptions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => setShowExecutorSelect((current) => !current)}
                        className="text-[12px] leading-4 text-[color:var(--muted)] underline underline-offset-2 hover:text-[color:var(--foreground)] sm:text-[11px]"
                      >
                        {showExecutorSelect ? "Скрыть список" : "Другой исполнитель"}
                      </button>
                    ) : null}

                    {executorChips.length === 0 && !showExecutorSelect ? (
                      <div className="max-w-[190px]">
                        <ExecutorSelect
                          value={executorIds[0] ?? ""}
                          options={shiftExecutorOptions}
                          emptyLabel={
                            currentShift
                              ? "Нет доступных исполнителей в смене"
                              : "Сначала откройте смену"
                          }
                          onChange={(value) => {
                            setExecutorIds((prev) =>
                              prev.includes(value)
                                ? prev.filter((id) => id !== value)
                                : [...prev, value],
                            );
                            setShowExecutorSelect(false);
                          }}
                        />
                      </div>
                    ) : null}

                    {showExecutorSelect ? (
                      <div className="w-full max-w-[280px] space-y-1 sm:max-w-[250px]">
                        <input
                          type="search"
                          value={executorSearchValue}
                          onChange={(event) => setExecutorSearchValue(event.target.value)}
                          placeholder="Найти исполнителя"
                          disabled={!executorOptionsReady && otherExecutorOptions.length === 0}
                          className="h-9 w-full border border-[color:var(--border)] bg-white px-2.5 text-[13px] text-[color:var(--foreground)] outline-none placeholder:text-[color:var(--muted)] disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <div className="max-h-36 overflow-y-auto border border-[color:var(--border)] bg-white">
                          {filteredOtherExecutorOptions.length > 0 ? (
                            filteredOtherExecutorOptions.map((executor) => {
                              const isSelected = executorIds.includes(executor.id);

                              return (
                                <button
                                  key={executor.id}
                                  type="button"
                                  onClick={() => {
                                    setExecutorIds((prev) =>
                                      prev.includes(executor.id)
                                        ? prev.filter((id) => id !== executor.id)
                                        : [...prev, executor.id],
                                    );
                                    setExecutorSearchValue("");
                                  }}
                                  className={clsx(
                                    "flex w-full items-center justify-between gap-3 px-2.5 py-2 text-left text-[13px] leading-4",
                                    isSelected
                                      ? "bg-[color:var(--primary)]/5 font-semibold text-[color:var(--primary)]"
                                      : "text-[color:var(--foreground)] hover:bg-[color:var(--background)]",
                                  )}
                                >
                                  <span className="min-w-0 truncate">{executor.label}</span>
                                  <span
                                    className={clsx(
                                      "shrink-0 text-[12px]",
                                      isSelected ? "text-[color:var(--primary)]" : "text-transparent",
                                    )}
                                  >
                                    ✓
                                  </span>
                                </button>
                              );
                            })
                          ) : (
                            <div className="px-2.5 py-2 text-[12px] leading-4 text-[color:var(--muted)]">
                              {executorOptionsError ??
                                (executorOptionsReady
                                  ? "Исполнители не найдены"
                                  : "Загружаем исполнителей...")}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  {hasSelectedLeftExecutor ? (
                    <div className="text-[12px] leading-4 text-[color:var(--muted)] sm:text-[11px]">
                      Сотрудник отметил уход из смены
                    </div>
                  ) : null}
                  {hasSelectedOutsideShiftExecutor ? (
                    <div className="text-[12px] leading-4 text-[color:var(--muted)] sm:text-[11px]">
                      Выбран исполнитель вне состава смены, только для этого заказа
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="flex flex-col items-stretch gap-1 sm:gap-0.5 xl:ml-auto xl:min-w-[596px]">
              <div className="flex items-end justify-between gap-3 text-[15px] sm:hidden sm:justify-end">
                <span className="font-medium text-[color:var(--foreground)]">
                  Итого:
                </span>
                <span className="text-[26px] font-semibold leading-none text-[color:var(--foreground)] tabular-nums sm:text-[28px]">
                  {formatPrice(total)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 sm:hidden">
                <label className="text-[13px] font-medium text-[color:var(--muted)]" htmlFor="order-discount-percent-mobile">
                  Скидка, %
                </label>
                <input
                  id="order-discount-percent-mobile"
                  type="number"
                  min="0"
                  max={MAX_ORDER_DISCOUNT_PERCENT}
                  step="0.01"
                  value={discountPercentValue}
                  onChange={(event) => setDiscountPercentValue(event.target.value)}
                  disabled={payment.paymentStatus === "Оплачен" || isCompletedUnpaidOrder}
                  className="h-9 w-24 border border-[color:var(--border)] bg-white px-2 text-right text-[14px] text-[color:var(--foreground)] disabled:bg-slate-100 disabled:text-slate-400"
                />
              </div>
              {discount > 0 || discountInputError ? (
                <div className={discountInputError ? "text-right text-[12px] leading-4 text-red-600 sm:hidden" : "text-right text-[12px] leading-4 text-[color:var(--muted)] sm:hidden"}>
                  {discountInputError || `До скидки ${formatPrice(subtotal)}, скидка ${formatPrice(discount)}`}
                </div>
              ) : null}

              <div className="flex flex-col gap-1 lg:gap-0.5">


                <div className="flex flex-col gap-1 sm:flex-row sm:flex-nowrap sm:items-center sm:justify-end sm:gap-0">
                    <button
                      type="button"
                      onClick={handleSaveDraft}
                      disabled={cartItems.length === 0 || isSavingOrder || isCompletedUnpaidOrder || Boolean(discountInputError)}
                      className="h-10 w-full whitespace-nowrap border border-[color:var(--primary)] bg-white px-5 text-[15px] font-medium text-[color:var(--primary)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 sm:hidden"
                    >
                      {isSavingOrder ? "Сохраняем..." : "Записать"}
                    </button>
                    <button
                      type="button"
                      onClick={handleCompleteOrder}
                      disabled={isSavingOrder}
                      className="h-10 w-full whitespace-nowrap border border-blue-600 bg-blue-50 px-5 text-[15px] font-medium text-blue-700 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300 sm:hidden"
                    >
                      {isSavingOrder ? "Обработка..." : "Выполнить"}
                    </button>
                    <button
                      type="button"
                      onClick={handleAcceptPayment}
                      disabled={
                        cartItems.length === 0 ||
                        isOpeningPaymentModal ||
                        isSavingOrder ||
                        payment.paymentStatus === "Оплачен" ||
                        Boolean(discountInputError)
                      }
                      className="h-10 w-full whitespace-nowrap border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[15px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 sm:hidden"
                    >
                      {isOpeningPaymentModal ? "Открываем оплату..." : "Принять оплату"}
                    </button>
                    <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-1.5 xl:flex-nowrap">
                      <div className="flex items-center gap-1.5">
                        <label className="text-[12px] font-medium leading-4 text-[color:var(--muted)]" htmlFor="order-discount-percent">
                          Скидка
                        </label>
                        <input
                          id="order-discount-percent"
                          type="number"
                          min="0"
                          max={MAX_ORDER_DISCOUNT_PERCENT}
                          step="0.01"
                          value={discountPercentValue}
                          onChange={(event) => setDiscountPercentValue(event.target.value)}
                          disabled={payment.paymentStatus === "Оплачен" || isCompletedUnpaidOrder}
                          className="h-9 w-20 border border-[color:var(--border)] bg-white px-2 text-right text-[13px] text-[color:var(--foreground)] disabled:bg-slate-100 disabled:text-slate-400"
                          aria-label="Скидка в процентах"
                        />
                        <span className="text-[12px] text-[color:var(--muted)]">%</span>
                      </div>
                      <div className="flex items-end gap-1 text-[14px] leading-4 text-[color:var(--foreground)]">
                        <span className="font-medium text-[color:var(--muted)] lowercase">Итого к оплате:</span>
                        <span className="text-[24px] font-semibold leading-none tabular-nums">
                          {formatPrice(total)}
                        </span>
                      </div>
                      {discount > 0 || discountInputError ? (
                        <div className={discountInputError ? "min-w-[160px] text-[12px] leading-4 text-red-600" : "min-w-[160px] text-[12px] leading-4 text-[color:var(--muted)]"}>
                          {discountInputError || `${formatPrice(subtotal)} - ${formatPrice(discount)}`}
                        </div>
                      ) : null}
                      <div className="flex min-w-[214px] flex-col gap-0.5">
                        <div className="truncate whitespace-nowrap border border-[color:var(--border)] bg-[color:var(--background)] px-2.5 py-2 text-[12px] font-medium leading-4 text-[color:var(--foreground)]">
                          {currentShiftFooterLabel ?? "Смена не открыта"}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveDraft}
                        disabled={cartItems.length === 0 || isSavingOrder || isCompletedUnpaidOrder || Boolean(discountInputError)}
                        className="h-9 min-w-[138px] whitespace-nowrap border border-[color:var(--primary)] bg-white px-4 text-[14px] font-medium text-[color:var(--primary)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-white disabled:text-slate-300"
                      >
                        {isSavingOrder ? "Сохраняем..." : "Записать"}
                      </button>
                      <button
                        type="button"
                        onClick={handleCompleteOrder}
                        disabled={isSavingOrder}
                        className="h-9 min-w-[120px] whitespace-nowrap border border-blue-600 bg-blue-50 px-4 text-[14px] font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {isSavingOrder ? (
                          <RefreshCw className="h-4 w-4 animate-spin" />
                        ) : (
                          "Выполнить"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleAcceptPayment}
                        disabled={
                          cartItems.length === 0 ||
                          isOpeningPaymentModal ||
                          isSavingOrder ||
                          payment.paymentStatus === "Оплачен" ||
                          Boolean(discountInputError)
                        }
                        className="h-9 min-w-[138px] whitespace-nowrap border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500 sm:border-l-0"
                      >
                        {isOpeningPaymentModal ? "Открываем оплату..." : "Принять оплату"}
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenPrintPreview}
                        disabled={Boolean(discountInputError)}
                        className="flex h-9 w-9 items-center justify-center border border-[color:var(--primary)] text-[color:var(--primary)] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300 sm:border-l-0"
                        title="Распечатать предварительный заказ"
                        aria-label="Распечатать предварительный заказ"
                      >
                        <Printer className="h-4 w-4" />
                      </button>
                    </div>
                </div>
              </div>

              {orderEditorError ? (
                <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] leading-5 text-amber-900 sm:text-right">
                  {orderEditorError}
                </div>
              ) : null}

              {servicesCount > 0 ? (
                <div className="text-right text-[14px] text-[color:var(--muted)] sm:hidden">
                  Позиций в заказе: {servicesCount}
                </div>
              ) : null}
              {executorOptions.length === 0 ? (
                <div className="text-right text-[13px] leading-5 text-[color:var(--muted)] sm:hidden">
                  {currentShift
                    ? "Исполнителем можно назначить только сотрудника текущей смены с разрешением на исполнение."
                    : "Исполнитель выбирается после открытия смены в текущем филиале."}
                </div>
              ) : currentShiftLabel ? (
                <div className="text-right text-[13px] leading-5 text-[color:var(--muted)] sm:hidden">
                  Исполнителя можно менять отдельно, смена заказа остаётся в текущем контексте филиала.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {priceEditorState?.open ? (
        <DemoModal
          title={
            priceEditorState.inputKind === "manual"
              ? "Свободная цена"
              : "Уточнение цены"
          }
          onClose={closePriceEditor}
          actions={
            <>
              <button
                type="button"
                onClick={closePriceEditor}
                className="h-9 border border-[color:var(--border)] px-4 text-[14px] text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handlePriceEditorSave}
                disabled={parsePriceInput(priceEditorState.priceValue) === null}
                className="h-9 border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
              >
                Сохранить
              </button>
            </>
          }
        >
          <div className="space-y-3">
            <div>
              <div className="text-[15px] font-medium text-[color:var(--foreground)]">
                {priceEditorState.serviceName}
              </div>
              <div className="mt-1 text-[13px] text-[color:var(--muted)]">
                {[
                  priceEditorState.vehicleLabel,
                  formatRadiusDisplayLabel(priceEditorState.vehicleType, priceEditorState.radius),
                  priceEditorState.lowProfile ? "Низкий профиль" : null,
                  priceEditorState.runflat ? "RunFlat" : null,
                  `Кол-во: ${priceEditorState.quantity}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>

            {priceEditorState.priceOptions.length > 0 ? (
              <div className="space-y-2">
                <div className="text-[13px] font-medium text-[color:var(--foreground)]">
                  Подтверждённые варианты
                </div>
                <div className="flex flex-wrap gap-2">
                  {priceEditorState.priceOptions.map((option) => {
                    const active =
                      priceEditorState.selectedOptionLabel === option.label;

                    return (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() =>
                          setPriceEditorState((current) =>
                            current
                              ? {
                                  ...current,
                                  priceValue: String(option.price),
                                  selectedOptionLabel: option.label,
                                }
                              : current,
                          )
                        }
                        className={clsx(
                          "border px-3 py-2 text-[13px]",
                          active
                            ? "border-[color:var(--primary)] bg-[color:var(--primary)]/5 text-[color:var(--primary)]"
                            : "border-[color:var(--border)] bg-white text-[color:var(--foreground)]",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <label className="block space-y-1">
              <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                Сумма за единицу
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={priceEditorState.priceValue}
                onChange={(event) =>
                  setPriceEditorState((current) => {
                    if (!current) {
                      return current;
                    }

                    const nextValue = event.target.value;
                    const matchedOption = current.priceOptions.find(
                      (option) => String(option.price) === nextValue,
                    );

                    return {
                      ...current,
                      priceValue: nextValue,
                      selectedOptionLabel: matchedOption?.label ?? "",
                    };
                  })
                }
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)]"
              />
            </label>

            {usesCostPriceRule(priceEditorState.salaryRuleSnapshot) ? (
              <label className="block space-y-1">
                <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                  Закупочная цена
                </span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={priceEditorState.costPriceValue}
                  onChange={(event) =>
                    setPriceEditorState((current) =>
                      current
                        ? {
                            ...current,
                            costPriceValue: event.target.value,
                          }
                        : current,
                    )
                  }
                  placeholder="Не указана"
                  className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)]"
                />
                <span className="block text-[12px] leading-4 text-[color:var(--muted)]">
                  Нужно для `% от прибыли`.
                </span>
              </label>
            ) : null}

            <label className="block space-y-1">
              <span className="text-[13px] font-medium text-[color:var(--foreground)]">
                Комментарий
              </span>
              <input
                type="text"
                value={priceEditorState.operatorNote}
                onChange={(event) =>
                  setPriceEditorState((current) =>
                    current
                      ? {
                          ...current,
                          operatorNote: event.target.value,
                        }
                      : current,
                  )
                }
                placeholder={
                  priceEditorState.inputKind === "manual"
                    ? "Например: слесарные работы по факту"
                    : "Например: выбран тариф по размеру"
                }
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)]"
              />
            </label>
          </div>
        </DemoModal>
      ) : null}

      {paymentModalOpen ? (
        <>
          <div className="fixed inset-0 z-50 bg-slate-900/25 sm:hidden">
            <div className="absolute inset-x-2 bottom-2">
              <div className="flex max-h-[70dvh] min-h-0 w-full flex-col overflow-hidden rounded-t-[14px] border border-b-0 border-[color:var(--border)] bg-white">
                <div className="flex items-center justify-between border-b border-[color:var(--border)] px-3 py-1.5">
                  <h2 className="text-[14px] font-semibold text-[color:var(--foreground)]">
                    Принять оплату
                  </h2>
                  <button
                    type="button"
                    onClick={handlePaymentModalClose}
                    className="flex h-6 w-6 items-center justify-center text-[color:var(--muted)]"
                    aria-label="Закрыть окно"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-3 py-2.5 text-sm text-[color:var(--foreground)]">
                  {paymentModalContent}
                </div>
                <div className="shrink-0 flex items-center justify-end border-t border-[color:var(--border)] px-3 py-2">
                  {paymentModalActions}
                </div>
              </div>
            </div>
          </div>

          <div className="hidden sm:block">
            <DemoModal
              title="Принять оплату"
              onClose={handlePaymentModalClose}
              actions={paymentModalActions}
            >
              {paymentModalContent}
            </DemoModal>
          </div>
        </>
      ) : null}


      {shiftGuardModalOpen ? (
        <DemoModal
          title="Сначала откройте смену"
          onClose={() => setShiftGuardModalOpen(false)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setShiftGuardModalOpen(false)}
                className="h-9 border border-[color:var(--border)] px-4 text-[14px] text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  setShiftGuardModalOpen(false);
                  router.push("/shift");
                }}
                className="h-9 border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white"
              >
                Перейти к смене
              </button>
            </>
          }
        >
          <div className="text-[14px] leading-6 text-[color:var(--foreground)]">
            Чтобы принять оплату по заказу, нужно открыть смену в текущем филиале.
          </div>
        </DemoModal>
      ) : null}

      {deleteDraftConfirmOpen ? (
        <DemoModal
          title="Удалить черновик"
          onClose={() => setDeleteDraftConfirmOpen(false)}
          actions={
            <>
              <button
                type="button"
                onClick={() => setDeleteDraftConfirmOpen(false)}
                className="h-9 border border-[color:var(--border)] px-4 text-[14px] text-[color:var(--foreground)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleDeleteDraftOrder();
                }}
                className="h-9 border border-rose-600 bg-rose-600 px-4 text-[14px] font-medium text-white"
              >
                Удалить
              </button>
            </>
          }
        >
          <div className="space-y-2">
            <div className="text-[14px] leading-5 text-[color:var(--foreground)]">
              Черновик заказа №{orderNumber || "—"} будет удалён.
            </div>
            <div className="text-[13px] leading-5 text-[color:var(--muted)]">
              Оплаченные и завершённые заказы этим действием не удаляются.
            </div>
          </div>
        </DemoModal>
      ) : null}

    </section>
  );
}

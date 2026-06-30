/**
 * Order editor — pure utility functions.
 *
 * Extracted from /orders/page.tsx (step 2.1 of decomposition).
 * No side effects, no React hooks, no API calls.
 * Safe to import from any component in the orders feature.
 */

import type { CartItem } from "@/features/cashier/types";
import { RADII, formatPrice } from "@/features/pricing/config";
import { resolveServicesAdminPrice } from "@/features/pricing/resolver";
import type {
  PricingContext,
  PricingInputKind,
  Radius,
  VehicleTypeId,
} from "@/features/pricing/types";
import type { ServicesAdminService } from "@/features/services-admin/types";
import type { DemoClient } from "@/features/clients/types";
import type { DemoShiftState } from "@/features/shifts/types";
import type { DemoOrderPaymentMethod } from "@/features/orders/types";

export type CatalogService = ServicesAdminService;

export type Executor = {
  id: string;
  label: string;
  subtitle?: string;
  isLeft?: boolean;
};

export type ExecutorChip = {
  id: string;
  label: string;
  amount: number | null;
  isLeft?: boolean;
};

export type ShiftExecutorEntry = {
  id: string;
  label: string;
  subtitle?: string;
  amount: number | null;
  arrivedAt: string | null;
  leftAt: string | null;
  isLeft: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────

export const MAIN_PACKAGE_SERVICE_ID = "main-package";
export const MAIN_PACKAGE_WHEEL_COUNT = 4;
export const PAYMENT_METHOD_NOTE_PREFIX = "Комментарий к оплате:";
export const GENERIC_PAYMENT_NOTE_PREFIX = "Общий комментарий:";
export const DEFAULT_ORDER_RECOMMENDATION =
  "Рекомендуем проверять давление в шинах один раз в две недели";

// ── Client helpers ────────────────────────────────────────────────────────

export function getClientPrimaryVehicle(client: DemoClient) {
  return client.vehicles[0] ?? null;
}

export function getClientPreferredRadius(client: DemoClient): Radius | "" {
  const radius = getClientPrimaryVehicle(client)?.radius;
  return radius && RADII.includes(radius as Radius) ? (radius as Radius) : "";
}

export function getExistingClientSearchLabel(client: DemoClient) {
  const vehicle = getClientPrimaryVehicle(client);
  const carLabel = vehicle ? `${vehicle.brand} ${vehicle.model}`.trim() : "";
  const plateLabel = vehicle?.plateNumber ? `[${vehicle.plateNumber.toUpperCase()}]` : "";
  return [client.name, carLabel, plateLabel].filter(Boolean).join(" · ");
}

// ── Catalog service helpers ───────────────────────────────────────────────

export function isMainPackageService(
  service: Pick<CatalogService, "id"> | Pick<CartItem, "serviceId">,
) {
  return (
    ("id" in service ? service.id : service.serviceId) === MAIN_PACKAGE_SERVICE_ID
  );
}

export function getMainPackagePerWheelPrice(price: number) {
  return price / MAIN_PACKAGE_WHEEL_COUNT;
}

export function getCatalogServiceId(item: CatalogService) {
  return item.id;
}

export function getCatalogServiceName(item: CatalogService) {
  return item.name;
}

export function getCatalogServiceDescription(item: CatalogService) {
  return item.displayPriceLabel;
}

export function getCatalogServiceUnitLabel(service: CatalogService) {
  if (service.id === MAIN_PACKAGE_SERVICE_ID) return "за 1 колесо";
  if (service.priceType === "matrix" || service.pricingMode === "package") return "за 1 колесо";
  return "за 1 позицию";
}

export function resolveCatalogServicePricing(item: CatalogService, context: PricingContext) {
  return resolveServicesAdminPrice(item, context);
}

export function getCatalogServiceMetaLabel(
  service: CatalogService,
  resolvedPricing: ReturnType<typeof resolveCatalogServicePricing>,
) {
  const bits: Array<string | null> = [resolvedPricing.displayLabel];

  if (
    isMainPackageService(service) &&
    !resolvedPricing.disabled &&
    resolvedPricing.unitPrice !== null
  ) {
    return `${formatPrice(getMainPackagePerWheelPrice(resolvedPricing.unitPrice))}/колесо · ${formatPrice(resolvedPricing.unitPrice)}/комплект`;
  }

  const unitLabel =
    resolvedPricing.disabled || resolvedPricing.unitPrice === null
      ? null
      : getCatalogServiceUnitLabel(service);

  bits.push(unitLabel);
  return bits.filter(Boolean).join(" · ");
}

// ── Cart helpers ──────────────────────────────────────────────────────────

export function buildCartItemKey(
  serviceId: string,
  vehicleType: VehicleTypeId,
  radius: Radius,
  lowProfile: boolean,
  runflat: boolean,
) {
  return `${serviceId}:${vehicleType}:${radius}:${lowProfile ? "lp" : "std"}:${runflat ? "rf" : "base"}`;
}

export function getCartItemUnitMeta(item: CartItem) {
  if (item.serviceId === MAIN_PACKAGE_SERVICE_ID) return "за 1 колесо";
  return null;
}

export function getQuickQuantityOptions(
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

// ── Pricing helpers ───────────────────────────────────────────────────────

export function parsePriceInput(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed);
}

export function createPricingOperatorNote(
  inputKind: PricingInputKind,
  selectedOptionLabel: string,
  customNote: string,
) {
  const trimmedNote = customNote.trim();
  if (trimmedNote) return trimmedNote;
  if (selectedOptionLabel) return `Выбран тариф: ${selectedOptionLabel}`;
  return inputKind === "manual"
    ? "Свободная цена задана оператором"
    : "Цена уточнена оператором";
}

// ── Vehicle / radius helpers ──────────────────────────────────────────────

export function formatRadiusDisplayLabel(vehicleType: VehicleTypeId, radius: Radius) {
  return vehicleType === "commercial" && ["R13", "R14", "R15", "R16"].includes(radius)
    ? `${radius}C`
    : radius;
}

export function buildRadiusOptions(vehicleType: VehicleTypeId): Array<{ value: Radius; label: string }> {
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
  return RADII.map((radius) => ({ value: radius, label: radius }));
}

export function resolveRadiusForVehicleType(vehicleType: VehicleTypeId, currentRadius: Radius): Radius {
  const options = buildRadiusOptions(vehicleType);
  if (options.some((option) => option.value === currentRadius)) return currentRadius;
  if (vehicleType === "commercial") return "R16";
  if ((vehicleType === "passenger" || vehicleType === "suv") && currentRadius === "R23") return "R22";
  return options[options.length - 1]?.value ?? currentRadius;
}

export function getModifierLabels(lowProfile: boolean, runflat: boolean) {
  return [
    lowProfile ? "Низкий профиль" : null,
    runflat ? "RunFlat" : null,
  ].filter(Boolean);
}

export function formatItemParameters(
  item: Pick<CartItem, "vehicleLabel" | "radius" | "lowProfile" | "runflat">,
) {
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

// ── Executor helpers ──────────────────────────────────────────────────────

export function buildShiftExecutorEntries(
  currentShift: DemoShiftState["currentShift"],
): ShiftExecutorEntry[] {
  if (!currentShift) return [];

  const earningsMap =
    currentShift.salaryBreakdown?.status === "supported"
      ? new Map(
          currentShift.salaryBreakdown.members
            .filter(
              (member): member is typeof member & { employeeId: string } =>
                Boolean(member.employeeId),
            )
            .map((member) => [member.employeeId, member.totalAmount]),
        )
      : new Map<string, number>();

  const seenEmployeeIds = new Set<string>();

  const entries = currentShift.staff.flatMap((staffMember) => {
    const snapshotLabel = staffMember.employeeNameSnapshot.trim();
    const employeeId = staffMember.employeeId;

    if (!employeeId || seenEmployeeIds.has(employeeId)) return [];
    seenEmployeeIds.add(employeeId);

    const label = snapshotLabel || "Сотрудник";
    const arrivedAt = staffMember.arrivedAt ?? null;
    const leftAt = staffMember.leftAt ?? null;
    const isLeft = Boolean(arrivedAt && leftAt);

    return [{
      id: employeeId,
      label,
      amount: earningsMap.get(employeeId) ?? null,
      arrivedAt,
      leftAt,
      isLeft,
    }];
  });

  return entries.sort((left, right) => Number(left.isLeft) - Number(right.isLeft));
}

export function buildExecutorOptions(currentShift: DemoShiftState["currentShift"]): Executor[] {
  return buildShiftExecutorEntries(currentShift).map((entry) => ({
    id: entry.id,
    label: entry.label,
    subtitle: entry.subtitle,
    isLeft: entry.isLeft,
  }));
}

// ── Payment note helpers ──────────────────────────────────────────────────

export function requiresDedicatedPaymentComment(method: DemoOrderPaymentMethod) {
  return method === "bank_account";
}

export function getPaymentCommentFieldCopy(method: DemoOrderPaymentMethod) {
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

export function decomposePaymentNote(
  note: string | null | undefined,
): { genericNote: string; paymentMethodNote: string } {
  const value = (note ?? "").trim();
  if (!value) return { genericNote: "", paymentMethodNote: "" };

  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
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

export function composePaymentNote(input: {
  genericNote: string;
  paymentMethodNote: string;
}): string | null {
  const genericNote = input.genericNote.trim();
  const paymentMethodNote = input.paymentMethodNote.trim();

  if (genericNote && paymentMethodNote) {
    return `${PAYMENT_METHOD_NOTE_PREFIX} ${paymentMethodNote}\n${GENERIC_PAYMENT_NOTE_PREFIX} ${genericNote}`;
  }
  if (paymentMethodNote) return paymentMethodNote;
  if (genericNote) return genericNote;
  return null;
}

// ── Order catalog tab helpers ─────────────────────────────────────────────

import type { DemoServicesStore } from "@/features/services-admin/types";

type OrderCategoryTab = {
  id: string;
  label: string;
  sourceCategoryId?: string;
};

const ORDER_CATEGORY_TABS: OrderCategoryTab[] = [
  { id: "main", label: "Основные услуги", sourceCategoryId: "main" },
  { id: "repair", label: "Ремонт шин", sourceCategoryId: "repair" },
  { id: "disks", label: "Покраска и ремонт дисков", sourceCategoryId: "disks" },
  { id: "extra", label: "Дополнительные услуги", sourceCategoryId: "extra" },
  { id: "tpms", label: "Датчики давления", sourceCategoryId: "sensors" },
  { id: "rings", label: "Проставочные кольца", sourceCategoryId: "rings" },
  { id: "storage", label: "Хранение", sourceCategoryId: "storage" },
  { id: "locks", label: "Колёсные секретки", sourceCategoryId: "locks" },
];

export const REQUIRED_ORDER_CATEGORY_IDS = ["main", "repair", "disks", "extra"] as const;

export function isSuspiciouslyIncompleteOrderCatalog(store: DemoServicesStore) {
  if (store.categories.length === 0) return true;
  const categoriesById = new Map(store.categories.map((c) => [c.id, c]));
  return REQUIRED_ORDER_CATEGORY_IDS.some((categoryId) => {
    const category = categoriesById.get(categoryId);
    return !category || category.services.length === 0;
  });
}

export function buildOrderCategoryTabs(
  categories: DemoServicesStore["categories"],
): OrderCategoryTab[] {
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

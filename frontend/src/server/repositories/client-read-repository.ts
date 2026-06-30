import type { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import { getCanonicalBranchDisplayName } from "@/features/branches/canonical";
import type { DemoClient, DemoClientsStore } from "@/features/clients/types";
import {
  CLIENT_NAME_FALLBACK,
  buildVehicleIdentityLabel,
  getClientDisplayName,
  normalizePhone,
  normalizePlate,
} from "@/features/clients/client-contract";
import {
  buildCarLabel,
  decimalToNumber,
  formatDateOnly,
  formatDateTime,
  parseJsonValue,
} from "@/server/repositories/operational-utils";
import {
  buildClientBranchScopeWhere,
  getBranchVisibleClientVehicles,
} from "@/server/repositories/client-branch-scope";

const DEFAULT_SOURCE_OPTIONS = [
  "Не выбран",
  "Интернет",
  "Рекомендация",
  "Постоянный клиент",
  "Онлайн-запись",
  "Instagram",
  "Повторный визит",
  "Внутренний клиент",
];

export const CLIENT_DETAIL_INCLUDE = {
  vehicles: true,
  orders: {
    include: {
      branch: true,
      lines: true,
    },
  },
  bookings: {
    include: {
      branch: true,
    },
  },
  storageRecords: {
    include: {
      branch: true,
    },
  },
} satisfies Prisma.ClientInclude;

type ClientRecord = Prisma.ClientGetPayload<{
  include: typeof CLIENT_DETAIL_INCLUDE;
}>;

const CLIENT_LIST_INCLUDE = {
  vehicles: true,
  orders: {
    select: {
      branchId: true,
      vehicleId: true,
      totalAmount: true,
      createdAt: true,
      completedAt: true,
    },
  },
  bookings: {
    select: {
      branchId: true,
      vehicleId: true,
    },
  },
  storageRecords: {
    select: {
      branchId: true,
      vehicleId: true,
    },
  },
} satisfies Prisma.ClientInclude;

type LightweightClientRecord = Prisma.ClientGetPayload<{
  include: typeof CLIENT_LIST_INCLUDE;
}>;

function normalizeIdentityKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/[\s·\-\[\]]+/g, "")
    .toLocaleUpperCase("ru-RU");
}

function isVehicleDerivedClientName(record: { fullName: string; vehicles: Array<{ brand: string; model: string; plateNumber: string }> }) {
  const fullNameKey = normalizeIdentityKey(record.fullName);

  if (!fullNameKey) {
    return false;
  }

  return record.vehicles.some((vehicle) => {
    const plateKey = normalizePlate(vehicle.plateNumber);
    const vehicleLabelKey = normalizeIdentityKey(
      buildVehicleIdentityLabel({
        carBrand: vehicle.brand,
        carModel: vehicle.model,
        plateNumber: vehicle.plateNumber,
      }),
    );
    const brandModelKey = normalizeIdentityKey([vehicle.brand, vehicle.model].filter(Boolean).join(" "));

    return (
      fullNameKey === vehicleLabelKey ||
      (Boolean(plateKey) && fullNameKey.includes(plateKey)) ||
      (Boolean(brandModelKey) && fullNameKey === brandModelKey)
    );
  });
}

function buildServicesLabel(lines: Array<{ serviceNameSnapshot: string }>) {
  const labels = [...new Set(lines.map((line) => line.serviceNameSnapshot).filter(Boolean))];
  return labels.join(", ") || "—";
}

function getBranchScopedClientRecord(record: ClientRecord, branchId?: string): ClientRecord {
  if (!branchId) {
    return record;
  }

  const orders = record.orders.filter((order) => order.branchId === branchId);
  const bookings = record.bookings.filter((booking) => booking.branchId === branchId);
  const storageRecords = record.storageRecords.filter((item) => item.branchId === branchId);
  const vehicles = getBranchVisibleClientVehicles(record, branchId);

  return {
    ...record,
    vehicles,
    orders,
    bookings,
    storageRecords,
  };
}

export function mapClientRecord(record: ClientRecord, options: { branchId?: string } = {}): DemoClient {
  const scopedRecord = getBranchScopedClientRecord(record, options.branchId);
  const orders = scopedRecord.orders
    .slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const bookings = scopedRecord.bookings
    .slice()
    .sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.startTime.localeCompare(right.startTime));
  const storageRecords = scopedRecord.storageRecords
    .slice()
    .sort((left, right) => right.acceptedAt.getTime() - left.acceptedAt.getTime());
  const totalSpent = orders.reduce(
    (sum, order) => sum + (decimalToNumber(order.totalAmount) ?? 0),
    0,
  );
  const ordersCount = orders.length;
  const averageCheck = ordersCount > 0 ? Math.round(totalSpent / ordersCount) : 0;
  const lastVisitAt = orders[0]?.completedAt ?? orders[0]?.createdAt ?? null;
  const clientName = isVehicleDerivedClientName(scopedRecord)
    ? CLIENT_NAME_FALLBACK
    : getClientDisplayName({
        firstName: scopedRecord.firstName,
        lastName: scopedRecord.lastName,
        middleName: scopedRecord.middleName,
        fullName: scopedRecord.fullName,
      });
  const phone = normalizePhone(scopedRecord.phone);

  return {
    id: scopedRecord.id,
    name: clientName,
    shortName: clientName,
    firstName: scopedRecord.firstName,
    lastName: scopedRecord.lastName,
    middleName: scopedRecord.middleName,
    phone,
    email: scopedRecord.email ?? "",
    registrationDate: formatDateOnly(scopedRecord.registeredAt ?? scopedRecord.createdAt),
    source: scopedRecord.source ?? "Не выбран",
    sourceOptions: DEFAULT_SOURCE_OPTIONS,
    note: scopedRecord.note ?? "",
    lastVisitDate: lastVisitAt ? formatDateOnly(lastVisitAt) : "",
    ordersCount,
    averageCheck,
    totalSpent,
    averageVisitGapLabel: "—",
    vehicles: scopedRecord.vehicles.map((vehicle) => ({
      id: vehicle.id,
      label:
        buildVehicleIdentityLabel({
          carBrand: vehicle.brand,
          carModel: vehicle.model,
          plateNumber: vehicle.plateNumber,
        }) || vehicle.label,
      brand: vehicle.brand,
      model: vehicle.model,
      plateNumber: normalizePlate(vehicle.plateNumber),
      radius: vehicle.radius,
      totalSpent: decimalToNumber(vehicle.totalSpent) ?? undefined,
    })),
    orders: orders.map((order) => {
      const clientSnapshot = parseJsonValue<{
        carBrand?: string;
        carModel?: string;
        plateNumber?: string;
      }>(order.clientSnapshotJson, {});

      return {
        id: order.id,
        orderNumber: String(order.number),
        dateTime: formatDateTime(order.completedAt ?? order.createdAt),
        branch: getCanonicalBranchDisplayName(order.branchId, order.branch.displayName),
        carLabel: buildCarLabel({
          brand: clientSnapshot.carBrand,
          model: clientSnapshot.carModel,
          plateNumber: clientSnapshot.plateNumber,
        }),
        amount: decimalToNumber(order.totalAmount) ?? 0,
        status: order.status as DemoClient["orders"][number]["status"],
        servicesLabel: buildServicesLabel(order.lines),
      };
    }),
    visits: orders.map((order) => ({
      id: `visit-${order.id}`,
      dateTime: formatDateTime(order.completedAt ?? order.createdAt).replace(", ", " · "),
      branch: getCanonicalBranchDisplayName(order.branchId, order.branch.displayName),
      post: "ПОСТ",
      serviceLabel: buildServicesLabel(order.lines),
      resultLabel: order.status,
    })),
    storages: storageRecords.map((item) => ({
      id: item.id,
      name: item.itemLabelSnapshot,
      branch: getCanonicalBranchDisplayName(item.branchId, item.branch.displayName),
      status:
        item.status === "Выдано" && item.releasedAt
          ? `Выдано ${formatDateOnly(item.releasedAt)}`
          : item.status,
    })),
    bookings: bookings.map((booking) => ({
      id: booking.id,
      date: `${formatDateOnly(`${booking.dateKey}T12:00:00`)} · ${booking.startTime}`,
      branch: getCanonicalBranchDisplayName(booking.branchId, booking.branch.displayName),
      note: booking.comment?.trim() || booking.serviceLabel,
    })),
  };
}

export function mapLightweightClientRecord(
  record: LightweightClientRecord,
  options: { branchId?: string } = {},
): DemoClient {
  const scopedOrders = options.branchId
    ? record.orders.filter((order) => order.branchId === options.branchId)
    : record.orders;
  const visibleVehicles = getBranchVisibleClientVehicles(record, options.branchId);

  const sortedOrders = scopedOrders
    .slice()
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
  const totalSpent = sortedOrders.reduce(
    (sum, order) => sum + (decimalToNumber(order.totalAmount) ?? 0),
    0,
  );
  const ordersCount = sortedOrders.length;
  const averageCheck = ordersCount > 0 ? Math.round(totalSpent / ordersCount) : 0;
  const lastVisitAt = sortedOrders[0]?.completedAt ?? sortedOrders[0]?.createdAt ?? null;
  const clientName = isVehicleDerivedClientName(record)
    ? CLIENT_NAME_FALLBACK
    : getClientDisplayName({
        firstName: record.firstName,
        lastName: record.lastName,
        middleName: record.middleName,
        fullName: record.fullName,
      });
  const phone = normalizePhone(record.phone);

  return {
    id: record.id,
    name: clientName,
    shortName: clientName,
    firstName: record.firstName,
    lastName: record.lastName,
    middleName: record.middleName,
    phone,
    email: record.email ?? "",
    registrationDate: formatDateOnly(record.registeredAt ?? record.createdAt),
    source: record.source ?? "Не выбран",
    sourceOptions: DEFAULT_SOURCE_OPTIONS,
    note: record.note ?? "",
    lastVisitDate: lastVisitAt ? formatDateOnly(lastVisitAt) : "",
    ordersCount,
    averageCheck,
    totalSpent,
    averageVisitGapLabel: "—",
    vehicles: visibleVehicles.map((vehicle) => ({
      id: vehicle.id,
      label:
        buildVehicleIdentityLabel({
          carBrand: vehicle.brand,
          carModel: vehicle.model,
          plateNumber: vehicle.plateNumber,
        }) || vehicle.label || "Не указан",
      brand: vehicle.brand,
      model: vehicle.model,
      plateNumber: normalizePlate(vehicle.plateNumber),
      radius: vehicle.radius,
      totalSpent: decimalToNumber(vehicle.totalSpent) ?? undefined,
    })),
    orders: [],
    visits: [],
    storages: [],
    bookings: [],
  };
}

export async function listClients(): Promise<DemoClientsStore> {
  const clients = await prisma.client.findMany({
    include: CLIENT_LIST_INCLUDE,
    orderBy: { fullName: "asc" },
  });

  return {
    clients: clients.map((client) => mapLightweightClientRecord(client)),
  };
}

export async function listClientsForBranch(branchId: string): Promise<DemoClientsStore> {
  const clients = await prisma.client.findMany({
    where: buildClientBranchScopeWhere(branchId),
    include: CLIENT_LIST_INCLUDE,
    orderBy: { fullName: "asc" },
  });

  return {
    clients: clients.map((client) => mapLightweightClientRecord(client, { branchId })),
  };
}

export async function getClientById(clientId: string) {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: CLIENT_DETAIL_INCLUDE,
  });

  return client ? mapClientRecord(client) : null;
}

export async function getClientByIdForBranch(clientId: string, branchId: string) {
  const client = await prisma.client.findFirst({
    where: {
      id: clientId,
      ...buildClientBranchScopeWhere(branchId),
    },
    include: CLIENT_DETAIL_INCLUDE,
  });

  return client ? mapClientRecord(client, { branchId }) : null;
}

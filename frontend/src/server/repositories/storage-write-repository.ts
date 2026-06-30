import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { buildClientBranchScopeWhere } from "@/server/repositories/client-branch-scope";
import type { DemoStorageItem } from "@/features/storage/types";

function mapStorageRecord(record: {
  id: string;
  storageNumber: string;
  clientId: string | null;
  clientNameSnapshot: string;
  clientPhoneSnapshot: string;
  carBrandSnapshot: string;
  carModelSnapshot: string;
  plateNumberSnapshot: string;
  itemLabelSnapshot: string;
  status: string;
  warehouseId: string | null;
  warehouseName: string;
  shelfLabel: string;
  cellLabel: string;
  acceptedAt: Date;
  releasedAt: Date | null;
  note: string | null;
}): DemoStorageItem {
  return {
    id: record.id,
    storageNumber: record.storageNumber,
    clientId: record.clientId,
    clientName: record.clientNameSnapshot,
    clientPhone: record.clientPhoneSnapshot,
    carBrand: record.carBrandSnapshot,
    carModel: record.carModelSnapshot,
    plateNumber: record.plateNumberSnapshot,
    kitLabel: record.itemLabelSnapshot,
    status: record.status as DemoStorageItem["status"],
    warehouseId: record.warehouseId,
    warehouseName: record.warehouseName,
    shelfLabel: record.shelfLabel,
    cellLabel: record.cellLabel,
    acceptedAt: record.acceptedAt.toISOString(),
    releasedAt: record.releasedAt?.toISOString() ?? null,
    note: record.note ?? "",
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

async function resolveStorageLinks(input: {
  branchId: string;
  clientId: string | null;
  carBrand: string;
  carModel: string;
  plateNumber: string;
  allowNetworkClientAccess?: boolean;
}) {
  if (!input.clientId) {
    return { clientId: null, vehicleId: null };
  }

  const client = await prisma.client.findFirst({
    where: {
      id: input.clientId,
      ...(input.allowNetworkClientAccess ? {} : buildClientBranchScopeWhere(input.branchId)),
    },
    include: { vehicles: true },
  });

  if (!client) {
    return { clientId: null, vehicleId: null };
  }

  const normalizedBrand = input.carBrand.trim().toLocaleLowerCase("ru-RU");
  const normalizedModel = input.carModel.trim().toLocaleLowerCase("ru-RU");
  const normalizedPlate = input.plateNumber.trim().toLocaleLowerCase("ru-RU");
  const matchedVehicle =
    client.vehicles.find((vehicle) => {
      const vehiclePlate = vehicle.plateNumber.trim().toLocaleLowerCase("ru-RU");
      const vehicleBrand = vehicle.brand.trim().toLocaleLowerCase("ru-RU");
      const vehicleModel = vehicle.model.trim().toLocaleLowerCase("ru-RU");

      if (normalizedPlate && vehiclePlate === normalizedPlate) {
        return true;
      }

      return (
        Boolean(normalizedBrand || normalizedModel) &&
        vehicleBrand === normalizedBrand &&
        vehicleModel === normalizedModel
      );
    }) ??
    client.vehicles[0] ??
    null;

  return {
    clientId: client.id,
    vehicleId: matchedVehicle?.id ?? null,
  };
}

export async function createStorageRecordForBranch(
  branchId: string,
  input: {
    storageNumber: string;
    clientId: string | null;
    clientName: string;
    clientPhone: string;
    carBrand: string;
    carModel: string;
    plateNumber: string;
    kitLabel: string;
    warehouseId: string | null;
    warehouseName: string;
    shelfLabel: string;
    cellLabel: string;
    note: string;
  },
  options?: {
    allowNetworkClientAccess?: boolean;
  },
) {
  const storageNumber = input.storageNumber.trim();

  const existingRecord = await prisma.storageRecord.findFirst({
    where: {
      branchId,
      storageNumber,
    },
    select: { id: true },
  });

  if (existingRecord) {
    throw new Error("Такой номер хранения уже есть.");
  }

  const { clientId, vehicleId } = await resolveStorageLinks({
    branchId,
    clientId: normalizeOptionalString(input.clientId) ?? null,
    carBrand: input.carBrand,
    carModel: input.carModel,
    plateNumber: input.plateNumber,
    allowNetworkClientAccess: options?.allowNetworkClientAccess,
  });

  const record = await prisma.storageRecord.create({
    data: {
      id: `storage-${randomUUID()}`,
      branchId,
      storageNumber,
      clientId,
      vehicleId,
      clientNameSnapshot: input.clientName.trim(),
      clientPhoneSnapshot: input.clientPhone.trim(),
      carBrandSnapshot: input.carBrand.trim(),
      carModelSnapshot: input.carModel.trim(),
      plateNumberSnapshot: input.plateNumber.trim(),
      itemLabelSnapshot: input.kitLabel.trim(),
      status: "На хранении",
      warehouseId: normalizeOptionalString(input.warehouseId) ?? null,
      warehouseName: input.warehouseName.trim() || "Не указан",
      shelfLabel: input.shelfLabel.trim(),
      cellLabel: input.cellLabel.trim(),
      acceptedAt: new Date(),
      releasedAt: null,
      note: normalizeOptionalString(input.note) ?? null,
      clientSnapshotJson: clientId
        ? {
            clientId,
            name: input.clientName.trim(),
            phone: input.clientPhone.trim(),
          }
        : undefined,
      vehicleSnapshotJson:
        vehicleId || input.carBrand.trim() || input.carModel.trim() || input.plateNumber.trim()
          ? {
              vehicleId,
              label: [input.carBrand.trim(), input.carModel.trim()]
                .filter(Boolean)
                .join(" ")
                .trim(),
              plateNumber: input.plateNumber.trim(),
            }
          : undefined,
      itemSnapshotJson: {
        kitLabel: input.kitLabel.trim(),
      },
    },
  });

  return mapStorageRecord(record);
}

export async function updateStorageRecordForBranch(
  branchId: string,
  storageRecordId: string,
  input: {
    note?: string;
    warehouseId?: string | null;
    warehouseName?: string;
    shelfLabel?: string;
    cellLabel?: string;
    release?: boolean;
  },
) {
  const existingRecord = await prisma.storageRecord.findFirst({
    where: {
      id: storageRecordId,
      branchId,
    },
  });

  if (!existingRecord) {
    return null;
  }

  const record = await prisma.storageRecord.update({
    where: { id: existingRecord.id },
    data: {
      note:
        input.note === undefined ? undefined : normalizeOptionalString(input.note) ?? null,
      warehouseId:
        input.warehouseId === undefined
          ? undefined
          : normalizeOptionalString(input.warehouseId) ?? null,
      warehouseName:
        input.warehouseName === undefined
          ? undefined
          : input.warehouseName.trim() || "Не указан",
      shelfLabel: input.shelfLabel === undefined ? undefined : input.shelfLabel.trim(),
      cellLabel: input.cellLabel === undefined ? undefined : input.cellLabel.trim(),
      status: input.release ? "Выдано" : undefined,
      releasedAt: input.release ? new Date() : undefined,
    },
  });

  return mapStorageRecord(record);
}

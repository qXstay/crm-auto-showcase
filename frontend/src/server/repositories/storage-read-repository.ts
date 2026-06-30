import { prisma } from "@/server/db/prisma";
import type { DemoStorageItem, DemoStorageStore } from "@/features/storage/types";

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

export async function listStorageRecordsForBranch(branchId: string): Promise<DemoStorageStore> {
  const items = await prisma.storageRecord.findMany({
    where: { branchId },
    orderBy: [{ acceptedAt: "desc" }],
  });

  return {
    items: items.map(mapStorageRecord),
  };
}

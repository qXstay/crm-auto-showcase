"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoStorageItem, DemoStorageStore } from "@/features/storage/types";

type CreateStorageItemInput = {
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
};

type UpdateStorageItemInput = {
  note?: string;
  warehouseId?: string | null;
  warehouseName?: string;
  shelfLabel?: string;
  cellLabel?: string;
  release?: boolean;
};

export async function fetchStorageStore() {
  return apiRequest<DemoStorageStore>("/api/storage-records");
}

export async function createStorageItemViaApi(input: CreateStorageItemInput) {
  return apiRequest<{ item: DemoStorageItem }>("/api/storage-records", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateStorageItemViaApi(
  storageItemId: string,
  input: UpdateStorageItemInput,
) {
  return apiRequest<{ item: DemoStorageItem }>(`/api/storage-records/${storageItemId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function releaseStorageItemViaApi(storageItemId: string) {
  return updateStorageItemViaApi(storageItemId, { release: true });
}

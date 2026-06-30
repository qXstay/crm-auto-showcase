"use client";

import { DEMO_STORAGE_ITEMS } from "@/features/storage/mock-data";
import type {
  DemoStorageItem,
  DemoStorageStore,
} from "@/features/storage/types";

const STORAGE_STORE_KEY = "pegas-demo-storage";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneStorageItem(item: DemoStorageItem): DemoStorageItem {
  return { ...item };
}

function createInitialStore(): DemoStorageStore {
  return {
    items: DEMO_STORAGE_ITEMS.map(cloneStorageItem),
  };
}

export function getInitialDemoStorageStore(): DemoStorageStore {
  return createInitialStore();
}

function normalizeStorageStatus(value: unknown): DemoStorageItem["status"] | null {
  switch (value) {
    case "На хранении":
    case "Готово к выдаче":
    case "Выдано":
      return value;
    default:
      return null;
  }
}

function normalizeStore(value: unknown): DemoStorageStore {
  if (!value || typeof value !== "object" || !Array.isArray((value as DemoStorageStore).items)) {
    return createInitialStore();
  }

  const items = (value as DemoStorageStore).items.filter(
    (item): item is DemoStorageItem => {
      const status = normalizeStorageStatus(item?.status);

      return (
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.storageNumber === "string" &&
        (typeof item.clientId === "string" || item.clientId === null) &&
        typeof item.clientName === "string" &&
        typeof item.clientPhone === "string" &&
        typeof item.carBrand === "string" &&
        typeof item.carModel === "string" &&
        typeof item.plateNumber === "string" &&
        typeof item.kitLabel === "string" &&
        status !== null &&
        (typeof item.warehouseId === "string" || item.warehouseId === null) &&
        typeof item.warehouseName === "string" &&
        typeof item.shelfLabel === "string" &&
        typeof item.cellLabel === "string" &&
        typeof item.acceptedAt === "string" &&
        (typeof item.releasedAt === "string" || item.releasedAt === null) &&
        typeof item.note === "string"
      );
    },
  );

  return {
    items: items.length > 0 ? items.map(cloneStorageItem) : createInitialStore().items,
  };
}

export function loadDemoStorageStore(): DemoStorageStore {
  if (!canUseStorage()) {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_STORE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return createInitialStore();
  }
}

export function saveDemoStorageStore(store: DemoStorageStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    STORAGE_STORE_KEY,
    JSON.stringify({
      items: store.items.map(cloneStorageItem),
    } satisfies DemoStorageStore),
  );
}

export function buildStorageCarLabel(item: Pick<DemoStorageItem, "carBrand" | "carModel" | "plateNumber">) {
  const brandModel = [item.carBrand, item.carModel].filter(Boolean).join(" ").trim();
  const bits = [brandModel || null, item.plateNumber || null].filter(Boolean);

  return bits.length > 0 ? bits.join(" · ") : "Не указан";
}

export function buildStoragePlaceLabel(
  item: Pick<DemoStorageItem, "warehouseName" | "shelfLabel" | "cellLabel">,
) {
  const shelfPart = item.shelfLabel.trim() ? `Стеллаж ${item.shelfLabel.trim()}` : "";
  const cellPart = item.cellLabel.trim() ? `Ячейка ${item.cellLabel.trim()}` : "";
  const secondary = [shelfPart, cellPart].filter(Boolean).join(", ");

  return {
    primary: item.warehouseName.trim() || "Не указан",
    secondary: secondary || "Место не указано",
  };
}

export function formatStorageDateLabel(value: string | null) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function getNextDemoStorageNumber(items: DemoStorageItem[]) {
  const nextNumber =
    items.reduce((maxValue, item) => {
      const match = item.storageNumber.match(/(\d+)(?!.*\d)/);
      const numericValue = match ? Number(match[1]) : 0;

      return Number.isFinite(numericValue) ? Math.max(maxValue, numericValue) : maxValue;
    }, 0) + 1;

  return `ХР-${String(nextNumber).padStart(3, "0")}`;
}

function normalizeStorageSearchValue(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/\+/g, "")
    .replace(/[\s\-()]/g, "")
    .trim();
}

export function matchesDemoStorageQuery(item: DemoStorageItem, query: string) {
  if (!query.trim()) {
    return true;
  }

  const rawQuery = query.toLocaleLowerCase("ru-RU").trim();
  const normalizedQuery = normalizeStorageSearchValue(query);
  const searchFields = [
    item.storageNumber,
    item.clientName,
    item.clientPhone,
    item.plateNumber,
    item.kitLabel,
    item.warehouseName,
    item.shelfLabel,
    item.cellLabel,
    item.note,
    buildStorageCarLabel(item),
  ];
  const rawHaystack = searchFields.join(" ").toLocaleLowerCase("ru-RU");
  const normalizedHaystack = searchFields
    .map((value) => normalizeStorageSearchValue(value))
    .join(" ");

  return rawHaystack.includes(rawQuery) || normalizedHaystack.includes(normalizedQuery);
}

export function createDemoStorageItem(input: {
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
}): DemoStorageItem {
  return {
    id: `storage-${Date.now()}`,
    storageNumber: input.storageNumber.trim(),
    clientId: input.clientId,
    clientName: input.clientName.trim(),
    clientPhone: input.clientPhone.trim(),
    carBrand: input.carBrand.trim(),
    carModel: input.carModel.trim(),
    plateNumber: input.plateNumber.trim(),
    kitLabel: input.kitLabel.trim(),
    status: "На хранении",
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName.trim(),
    shelfLabel: input.shelfLabel.trim(),
    cellLabel: input.cellLabel.trim(),
    acceptedAt: new Date().toISOString(),
    releasedAt: null,
    note: input.note.trim(),
  };
}

export function releaseDemoStorageItem(item: DemoStorageItem): DemoStorageItem {
  return {
    ...item,
    status: "Выдано",
    releasedAt: new Date().toISOString(),
  };
}

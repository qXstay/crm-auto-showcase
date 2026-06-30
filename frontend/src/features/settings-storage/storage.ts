import type {
  DemoStorageSettingsStore,
  DemoStorageWarehouseRecord,
} from "@/features/settings-storage/types";

const STORAGE_SETTINGS_STORAGE_KEY = "pegas-demo-settings-storage";

const INITIAL_WAREHOUSES: DemoStorageWarehouseRecord[] = [
  {
    id: "warehouse-gotvalda-9",
    name: "Северный",
    shelvesCount: 3,
    cellsCount: 10,
    protected: true,
    createdAt: "2026-03-18T09:00:00+05:00",
    updatedAt: "2026-03-18T09:00:00+05:00",
  },
];

function cloneWarehouse(
  warehouse: DemoStorageWarehouseRecord,
): DemoStorageWarehouseRecord {
  return { ...warehouse };
}

function createInitialStore(): DemoStorageSettingsStore {
  return {
    warehouses: INITIAL_WAREHOUSES.map(cloneWarehouse),
  };
}

export function getInitialDemoStorageSettingsStore(): DemoStorageSettingsStore {
  return createInitialStore();
}

function normalizePositiveInteger(value: unknown) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    return null;
  }

  return numberValue;
}

function normalizeStore(value: unknown): DemoStorageSettingsStore {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as DemoStorageSettingsStore).warehouses)
  ) {
    return createInitialStore();
  }

  const warehouses = (value as DemoStorageSettingsStore).warehouses.filter(
    (warehouse): warehouse is DemoStorageWarehouseRecord => {
      const shelvesCount = normalizePositiveInteger(warehouse?.shelvesCount);
      const cellsCount = normalizePositiveInteger(warehouse?.cellsCount);

      return (
        Boolean(warehouse) &&
        typeof warehouse.id === "string" &&
        typeof warehouse.name === "string" &&
        typeof warehouse.protected === "boolean" &&
        typeof warehouse.createdAt === "string" &&
        typeof warehouse.updatedAt === "string" &&
        shelvesCount !== null &&
        cellsCount !== null
      );
    },
  );

  return {
    warehouses:
      warehouses.length > 0 ? warehouses.map(cloneWarehouse) : createInitialStore().warehouses,
  };
}

export function loadDemoStorageSettingsStore(): DemoStorageSettingsStore {
  if (typeof window === "undefined") {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_SETTINGS_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return createInitialStore();
  }
}

export function saveDemoStorageSettingsStore(store: DemoStorageSettingsStore) {
  window.localStorage.setItem(
    STORAGE_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      warehouses: store.warehouses.map(cloneWarehouse),
    } satisfies DemoStorageSettingsStore),
  );
}

export function sanitizeWarehouseName(value: string) {
  return value.trim();
}

function formatCount(
  value: number,
  singular: string,
  paucal: string,
  plural: string,
) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} ${singular}`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${value} ${paucal}`;
  }

  return `${value} ${plural}`;
}

export function formatWarehouseMeta(
  shelvesCount: number,
  cellsCount: number,
) {
  return `(${formatCount(
    shelvesCount,
    "стеллаж",
    "стеллажа",
    "стеллажей",
  )}, ${formatCount(cellsCount, "ячейка", "ячейки", "ячеек")})`;
}

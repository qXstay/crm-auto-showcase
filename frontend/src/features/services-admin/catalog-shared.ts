import {
  cloneCategory,
  cloneService,
  INITIAL_SERVICE_CATEGORIES,
} from "@/features/services-admin/mock-data";
import type {
  DemoServicesStore,
  ServicesAdminCategory,
  ServicesAdminService,
} from "@/features/services-admin/types";

export type CanonicalCatalogServiceEntry = {
  categoryId: string;
  categoryName: string;
  sortOrder: number;
  service: ServicesAdminService;
};

function normalizeCatalogServiceName(value: string | null | undefined) {
  return (value ?? "").trim().toLocaleLowerCase("ru-RU");
}

const CANONICAL_SERVICE_ENTRIES: CanonicalCatalogServiceEntry[] =
  INITIAL_SERVICE_CATEGORIES.flatMap((category) =>
    category.services.map((service, index) => ({
      categoryId: category.id,
      categoryName: category.name,
      sortOrder: (index + 1) * 10,
      service: cloneService(service),
    })),
  );

const CANONICAL_SERVICE_BY_ID = new Map(
  CANONICAL_SERVICE_ENTRIES.map((entry) => [entry.service.id, entry]),
);

const CANONICAL_SERVICE_BY_NAME = new Map<string, CanonicalCatalogServiceEntry | null>();

for (const entry of CANONICAL_SERVICE_ENTRIES) {
  const nameKey = normalizeCatalogServiceName(entry.service.name);

  if (!nameKey) {
    continue;
  }

  const existingEntry = CANONICAL_SERVICE_BY_NAME.get(nameKey);

  if (existingEntry) {
    CANONICAL_SERVICE_BY_NAME.set(nameKey, null);
    continue;
  }

  if (existingEntry === null) {
    continue;
  }

  CANONICAL_SERVICE_BY_NAME.set(nameKey, entry);
}

export function getCanonicalServicesStore(): DemoServicesStore {
  return {
    categories: INITIAL_SERVICE_CATEGORIES.map(cloneCategory),
  };
}

export function getCanonicalServicesCategories(): ServicesAdminCategory[] {
  return getCanonicalServicesStore().categories;
}

export function findCanonicalServiceById(serviceId: string | null | undefined) {
  const normalizedId = (serviceId ?? "").trim();

  if (!normalizedId) {
    return null;
  }

  return CANONICAL_SERVICE_BY_ID.get(normalizedId) ?? null;
}

export function findCanonicalServiceByName(serviceName: string | null | undefined) {
  const normalizedName = normalizeCatalogServiceName(serviceName);

  if (!normalizedName) {
    return null;
  }

  return CANONICAL_SERVICE_BY_NAME.get(normalizedName) ?? null;
}

"use client";

import { apiRequest } from "@/lib/api/client";
import {
  clearCachedClientResource,
  readCachedClientResource,
} from "@/lib/client-resource-cache";
import type { DemoServicesStore } from "@/features/services-admin/types";

const ORDER_SERVICES_CATALOG_CACHE_KEY = "order-services-catalog";
const ORDER_SERVICES_CATALOG_TTL_MS = 60_000;

export async function fetchServicesCatalogForSettings() {
  return apiRequest<DemoServicesStore>("/api/settings/services");
}

export async function saveServicesCatalogViaApi(store: DemoServicesStore) {
  clearCachedClientResource(ORDER_SERVICES_CATALOG_CACHE_KEY);
  return apiRequest<DemoServicesStore>("/api/settings/services", {
    method: "PUT",
    body: JSON.stringify(store),
  });
}

export async function reorderServiceCategoriesViaApi(categoryIds: string[]) {
  clearCachedClientResource(ORDER_SERVICES_CATALOG_CACHE_KEY);
  return apiRequest<DemoServicesStore>("/api/settings/services", {
    method: "PATCH",
    body: JSON.stringify({
      kind: "categories",
      categoryIds,
    }),
  });
}

export async function reorderServicesInCategoryViaApi(
  categoryId: string,
  serviceIds: string[],
) {
  clearCachedClientResource(ORDER_SERVICES_CATALOG_CACHE_KEY);
  return apiRequest<DemoServicesStore>("/api/settings/services", {
    method: "PATCH",
    body: JSON.stringify({
      kind: "services",
      categoryId,
      serviceIds,
    }),
  });
}

export async function fetchServicesCatalogForOrders() {
  return readCachedClientResource(
    ORDER_SERVICES_CATALOG_CACHE_KEY,
    () => apiRequest<DemoServicesStore>("/api/service-catalog"),
    {
      ttlMs: ORDER_SERVICES_CATALOG_TTL_MS,
    },
  );
}

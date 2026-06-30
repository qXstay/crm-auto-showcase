"use client";

import {
  cloneCategory,
  cloneService,
  INITIAL_SERVICE_CATEGORIES,
  normalizeService,
} from "@/features/services-admin/mock-data";
import type {
  DemoServicesStore,
  ServicesAdminCategory,
  ServicesAdminService,
} from "@/features/services-admin/types";

const SERVICES_STORAGE_KEY = "pegas-demo-settings-services";

function createInitialStore(): DemoServicesStore {
  return {
    categories: INITIAL_SERVICE_CATEGORIES.map(cloneCategory),
  };
}

export function getInitialDemoServicesStore(): DemoServicesStore {
  return createInitialStore();
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function isValidService(value: unknown): value is ServicesAdminService {
  if (!value || typeof value !== "object") {
    return false;
  }

  const service = value as Partial<ServicesAdminService>;

  return (
    typeof service.id === "string" &&
    typeof service.categoryId === "string" &&
    typeof service.name === "string" &&
    typeof service.serviceType === "string" &&
    typeof service.pricingMode === "string" &&
    typeof service.priceType === "string" &&
    typeof service.fixedPrice === "number" &&
    typeof service.priceFrom === "number" &&
    typeof service.matrixPrices === "object" &&
    typeof service.modifierMatrixPrices === "object" &&
    (typeof service.modifierEnabled === "object" ||
      typeof service.modifierEnabled === "undefined") &&
    (typeof service.modifierExplicitlyCleared === "object" ||
      typeof service.modifierExplicitlyCleared === "undefined") &&
    typeof service.displayPriceLabel === "string" &&
    Array.isArray(service.priceBands) &&
    typeof service.salaryRuleType === "string" &&
    typeof service.salaryPercent === "number" &&
    typeof service.salaryFixedAmount === "number" &&
    typeof service.salaryPerUnitAmount === "number" &&
    typeof service.usesCostPrice === "boolean" &&
    typeof service.costPrice === "number" &&
    typeof service.reducedEmployeePercentEnabled === "boolean" &&
    typeof service.reducedEmployeePercentValue === "number"
  );
}

function isValidCategory(value: unknown): value is ServicesAdminCategory {
  if (!value || typeof value !== "object") {
    return false;
  }

  const category = value as Partial<ServicesAdminCategory>;

  return (
    typeof category.id === "string" &&
    typeof category.name === "string" &&
    Array.isArray(category.services)
  );
}

function normalizeStore(value: unknown): DemoServicesStore {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as DemoServicesStore).categories)
  ) {
    return createInitialStore();
  }

  const categories = (value as DemoServicesStore).categories
    .filter(isValidCategory)
    .map((category) => ({
      id: category.id,
      name: category.name,
      services: category.services
        .filter(isValidService)
        .map((service) => normalizeService(category.id, cloneService(service))),
    }));

  return {
    categories: mergeSeedCategories(categories).map(cloneCategory),
  };
}

function mergeSeedCategories(
  categories: ServicesAdminCategory[],
): ServicesAdminCategory[] {
  const mergedCategories = categories.map((category) => ({
    ...category,
    services: category.services.map(cloneService),
  }));

  INITIAL_SERVICE_CATEGORIES.forEach((seedCategory) => {
    const existingCategory = mergedCategories.find(
      (category) => category.id === seedCategory.id,
    );

    if (!existingCategory) {
      mergedCategories.push(cloneCategory(seedCategory));
      return;
    }

    seedCategory.services.forEach((seedService) => {
      const hasService = existingCategory.services.some(
        (service) => service.id === seedService.id,
      );

      if (hasService) {
        return;
      }

      existingCategory.services.push(
        normalizeService(existingCategory.id, cloneService(seedService)),
      );
    });
  });

  return mergedCategories;
}

export function loadDemoServicesStore(): DemoServicesStore {
  if (!canUseStorage()) {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(SERVICES_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    const normalizedStore = normalizeStore(JSON.parse(rawValue));
    const normalizedRawValue = JSON.stringify(normalizedStore);

    if (normalizedRawValue !== rawValue) {
      window.localStorage.setItem(SERVICES_STORAGE_KEY, normalizedRawValue);
    }

    return normalizedStore;
  } catch {
    return createInitialStore();
  }
}

export function saveDemoServicesStore(store: DemoServicesStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    SERVICES_STORAGE_KEY,
    JSON.stringify({
      categories: store.categories.map(cloneCategory),
    } satisfies DemoServicesStore),
  );
}

import type {
  ServicesAdminCategory,
  ServicesAdminService,
} from "@/features/services-admin/types";

export const DUPLICATE_SERVICE_MESSAGE =
  "Есть дубль услуги. Оставьте одну позицию, вторую удалите из активных.";

export type DuplicateServiceEntry = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
};

export type DuplicateServiceGroup = {
  key: string;
  name: string;
  entries: DuplicateServiceEntry[];
};

function formatQuotedList(values: string[]) {
  const uniqueValues = Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );

  if (uniqueValues.length === 0) {
    return "«Без категории»";
  }

  if (uniqueValues.length === 1) {
    return `«${uniqueValues[0]}»`;
  }

  return `${uniqueValues
    .slice(0, -1)
    .map((value) => `«${value}»`)
    .join(", ")} и «${uniqueValues[uniqueValues.length - 1]}»`;
}

export function formatDuplicateServiceMessage(
  duplicateGroups: DuplicateServiceGroup[],
) {
  const firstGroup = duplicateGroups[0];

  if (!firstGroup) {
    return DUPLICATE_SERVICE_MESSAGE;
  }

  const serviceName = firstGroup.name.trim() || "Услуга без названия";
  const categoryNames = firstGroup.entries.map((entry) => entry.categoryName);
  const categoryWord =
    new Set(categoryNames).size > 1 ? "категориях" : "категории";

  return `Есть дубль услуги: «${serviceName}» в ${categoryWord} ${formatQuotedList(categoryNames)}. Оставьте одну активную позицию или переименуйте одну из них.`;
}

export function normalizeServiceDuplicateName(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/ё/g, "е")
    .replace(/Ё/g, "е")
    .toLocaleLowerCase("ru-RU");
}

const PREFERRED_DUPLICATE_CATEGORY_BY_NAME = new Map([
  [normalizeServiceDuplicateName("Проверка давления"), "extra"],
  [normalizeServiceDuplicateName("Упаковка колеса (пакет)"), "extra"],
]);

export function getDuplicateServiceGroups(
  categories: ServicesAdminCategory[],
): DuplicateServiceGroup[] {
  const groups = new Map<string, DuplicateServiceGroup>();

  categories.forEach((category) => {
    category.services.forEach((service) => {
      const key = normalizeServiceDuplicateName(service.name);

      if (!key) {
        return;
      }

      const group = groups.get(key) ?? {
        key,
        name: service.name.trim() || "Услуга без названия",
        entries: [],
      };

      group.entries.push({
        id: service.id,
        name: service.name,
        categoryId: category.id,
        categoryName: category.name,
      });

      groups.set(key, group);
    });
  });

  return [...groups.values()].filter((group) => group.entries.length > 1);
}

export function assertNoDuplicateServiceNames(categories: ServicesAdminCategory[]) {
  if (getDuplicateServiceGroups(categories).length > 0) {
    throw new Error(DUPLICATE_SERVICE_MESSAGE);
  }
}

export function checkNewOrIncreasedDuplicates(
  nextCategories: ServicesAdminCategory[],
  currentCategories: ServicesAdminCategory[],
): boolean {
  const currentGroups = getDuplicateServiceGroups(currentCategories);
  const nextGroups = getDuplicateServiceGroups(nextCategories);

  const currentCountMap = new Map<string, number>();
  currentGroups.forEach((group) => {
    currentCountMap.set(group.key, group.entries.length);
  });

  for (const nextGroup of nextGroups) {
    const currentCount = currentCountMap.get(nextGroup.key) ?? 0;
    if (nextGroup.entries.length > currentCount) {
      return true;
    }
  }

  return false;
}

export function dedupeServicesForOrderSearch(
  services: ServicesAdminService[],
): ServicesAdminService[] {
  const serviceByName = new Map<string, ServicesAdminService>();

  services.forEach((service) => {
    const key = normalizeServiceDuplicateName(service.name);

    if (!key) {
      return;
    }

    const currentService = serviceByName.get(key);

    if (!currentService) {
      serviceByName.set(key, service);
      return;
    }

    const preferredCategoryId = PREFERRED_DUPLICATE_CATEGORY_BY_NAME.get(key);

    if (preferredCategoryId && service.categoryId === preferredCategoryId) {
      serviceByName.set(key, service);
    }
  });

  return [...serviceByName.values()];
}

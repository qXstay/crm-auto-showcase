import { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import {
  cloneCategory,
  createEmptyPriceMatrix,
  INITIAL_SERVICE_CATEGORIES,
  normalizeService,
} from "@/features/services-admin/mock-data";
import {
  assertNoDuplicateServiceNames,
  checkNewOrIncreasedDuplicates,
  DUPLICATE_SERVICE_MESSAGE,
} from "@/features/services-admin/duplicates";
import type {
  DemoServicesStore,
  ServicesAdminCategory,
  ServicesAdminModifierEnabledMap,
  ServicesAdminModifierExplicitlyClearedMap,
  ServicesAdminPriceBand,
  ServicesAdminPriceMatrix,
  ServicesAdminService,
} from "@/features/services-admin/types";

function decimalToNumber(value: Prisma.Decimal | null | undefined) {
  return value === null || value === undefined ? 0 : Number(value.toString());
}

type SqlClient = Pick<
  typeof prisma,
  "$executeRaw" | "$queryRaw"
> & Pick<
  typeof prisma,
  "service" | "servicePricingMetadata" | "salaryRule"
>;

type RootSqlClient = SqlClient & Pick<typeof prisma, "$transaction">;

type ServiceCategoryRow = {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

const STAGE1_UNSUPPORTED_SERVICE_IDS = new Set([
  "tpms-binding",
]);

function toDecimalOrNull(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  return new Prisma.Decimal(value);
}

function isValidCostPrice(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function toPlainObject<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  return value as T;
}

function normalizeCategoryInput(category: ServicesAdminCategory, index: number) {
  return {
    id: category.id.trim(),
    name: category.name.trim() || `Категория ${index + 1}`,
    services: category.services.map((service) => normalizeService(category.id.trim(), service)),
  };
}

function isStage1UnsupportedService(service: Pick<ServicesAdminService, "id">) {
  return STAGE1_UNSUPPORTED_SERVICE_IDS.has(service.id.trim());
}

function sanitizeStage1CatalogStore(store: DemoServicesStore): DemoServicesStore {
  return {
    categories: store.categories.map((category) => ({
      ...category,
      services: category.services.filter((service) => !isStage1UnsupportedService(service)),
    })),
  };
}

function assertValidServicesStore(value: unknown, currentStore?: DemoServicesStore): DemoServicesStore {
  if (!value || typeof value !== "object" || !Array.isArray((value as DemoServicesStore).categories)) {
    throw new Error("Некорректный каталог услуг.");
  }

  const categories = sanitizeStage1CatalogStore({
    categories: (value as DemoServicesStore).categories.map(normalizeCategoryInput),
  }).categories;
  const categoryIds = new Set<string>();
  const serviceIds = new Set<string>();

  if (currentStore) {
    if (checkNewOrIncreasedDuplicates(categories, currentStore.categories)) {
      throw new Error(DUPLICATE_SERVICE_MESSAGE);
    }
  } else {
    assertNoDuplicateServiceNames(categories);
  }

  for (const category of categories) {
    if (!category.id) {
      throw new Error("У категории должен быть сохранённый идентификатор.");
    }

    if (categoryIds.has(category.id)) {
      throw new Error(`Категория "${category.name}" дублируется в каталоге.`);
    }

    categoryIds.add(category.id);

    for (const service of category.services) {
      if (!service.id) {
        throw new Error(`Услуга "${service.name || "Новая услуга"}" должна иметь идентификатор.`);
      }

      if (
        service.salaryRuleType === "percent_of_profit" &&
        (!service.usesCostPrice || !isValidCostPrice(service.costPrice))
      ) {
        throw new Error(
          `Услуга "${service.name}" не может использовать stage-1 "% от прибыли" без подтверждённой себестоимости.`,
        );
      }

      if (serviceIds.has(service.id)) {
        throw new Error(`Услуга "${service.name}" дублируется в каталоге.`);
      }

      serviceIds.add(service.id);
    }
  }

  return { categories };
}

function assertStringArray(value: unknown, label: string) {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || !item.trim())
  ) {
    throw new Error(`${label}: некорректный список идентификаторов.`);
  }

  const ids = value.map((item) => item.trim());
  const uniqueIds = new Set(ids);

  if (uniqueIds.size !== ids.length) {
    throw new Error(`${label}: список содержит дубли.`);
  }

  return ids;
}

function assertSameIds(nextIds: string[], currentIds: string[], label: string) {
  const currentIdSet = new Set(currentIds);

  if (
    nextIds.length !== currentIds.length ||
    nextIds.some((id) => !currentIdSet.has(id))
  ) {
    throw new Error(`${label}: reorder не должен добавлять или удалять строки.`);
  }
}

async function upsertServiceFromCatalog(
  tx: SqlClient,
  category: { id: string; name: string },
  service: ServicesAdminService,
  sortOrder: number,
) {
  await tx.service.upsert({
    where: { id: service.id },
    update: {
      categoryKey: category.id,
      categoryLabelSnapshot: category.name,
      name: service.name,
      serviceType: service.serviceType,
      pricingMode: service.pricingMode,
      priceType: service.priceType,
      isActive: true,
      sortOrder,
    },
    create: {
      id: service.id,
      categoryKey: category.id,
      categoryLabelSnapshot: category.name,
      name: service.name,
      serviceType: service.serviceType,
      pricingMode: service.pricingMode,
      priceType: service.priceType,
      isActive: true,
      sortOrder,
    },
  });

  await tx.servicePricingMetadata.upsert({
    where: { serviceId: service.id },
    update: {
      fixedPrice: toDecimalOrNull(service.fixedPrice > 0 ? service.fixedPrice : null),
      priceFrom: toDecimalOrNull(service.priceFrom > 0 ? service.priceFrom : null),
      matrixPricesJson: service.matrixPrices,
      modifierEnabledJson: service.modifierEnabled,
      modifierMatrixPricesJson: service.modifierMatrixPrices,
      modifierExplicitlyClearedJson: service.modifierExplicitlyCleared,
      priceBandsJson: service.priceBands,
      displayPriceLabelOverride: service.displayPriceLabelOverride ?? null,
      costPrice: toDecimalOrNull(isValidCostPrice(service.costPrice) ? service.costPrice : null),
    },
    create: {
      serviceId: service.id,
      fixedPrice: toDecimalOrNull(service.fixedPrice > 0 ? service.fixedPrice : null),
      priceFrom: toDecimalOrNull(service.priceFrom > 0 ? service.priceFrom : null),
      matrixPricesJson: service.matrixPrices,
      modifierEnabledJson: service.modifierEnabled,
      modifierMatrixPricesJson: service.modifierMatrixPrices,
      modifierExplicitlyClearedJson: service.modifierExplicitlyCleared,
      priceBandsJson: service.priceBands,
      displayPriceLabelOverride: service.displayPriceLabelOverride ?? null,
      costPrice: toDecimalOrNull(isValidCostPrice(service.costPrice) ? service.costPrice : null),
    },
  });

  await tx.salaryRule.upsert({
    where: { serviceId: service.id },
    update: {
      ruleType: service.salaryRuleType,
      salaryPercent: toDecimalOrNull(service.salaryPercent > 0 ? service.salaryPercent : null),
      salaryFixedAmount: toDecimalOrNull(
        service.salaryFixedAmount > 0 ? service.salaryFixedAmount : null,
      ),
      salaryPerUnitAmount: toDecimalOrNull(
        service.salaryPerUnitAmount > 0 ? service.salaryPerUnitAmount : null,
      ),
      usesCostPrice: service.usesCostPrice,
      reducedEmployeePercentEnabled: service.reducedEmployeePercentEnabled,
      reducedEmployeePercentValue: toDecimalOrNull(
        service.reducedEmployeePercentValue > 0
          ? service.reducedEmployeePercentValue
          : null,
      ),
    },
    create: {
      serviceId: service.id,
      ruleType: service.salaryRuleType,
      salaryPercent: toDecimalOrNull(service.salaryPercent > 0 ? service.salaryPercent : null),
      salaryFixedAmount: toDecimalOrNull(
        service.salaryFixedAmount > 0 ? service.salaryFixedAmount : null,
      ),
      salaryPerUnitAmount: toDecimalOrNull(
        service.salaryPerUnitAmount > 0 ? service.salaryPerUnitAmount : null,
      ),
      usesCostPrice: service.usesCostPrice,
      reducedEmployeePercentEnabled: service.reducedEmployeePercentEnabled,
      reducedEmployeePercentValue: toDecimalOrNull(
        service.reducedEmployeePercentValue > 0
          ? service.reducedEmployeePercentValue
          : null,
      ),
    },
  });
}

async function listActiveServiceCategories(tx: SqlClient) {
  return tx.$queryRaw<ServiceCategoryRow[]>(Prisma.sql`
    SELECT "id", "name", "sortOrder", "isActive"
    FROM "ServiceCategory"
    WHERE "isActive" = true
    ORDER BY "sortOrder" ASC, "name" ASC
  `);
}

async function upsertServiceCategory(
  tx: SqlClient,
  category: { id: string; name: string },
  sortOrder: number,
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ServiceCategory" ("id", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
    VALUES (${category.id}, ${category.name}, ${sortOrder}, true, NOW(), NOW())
    ON CONFLICT ("id") DO UPDATE
    SET
      "name" = EXCLUDED."name",
      "sortOrder" = EXCLUDED."sortOrder",
      "isActive" = true,
      "updatedAt" = NOW()
  `);
}

async function insertServiceCategoryIfMissing(
  tx: SqlClient,
  category: { id: string; name: string },
  sortOrder: number,
) {
  await tx.$executeRaw(Prisma.sql`
    INSERT INTO "ServiceCategory" ("id", "name", "sortOrder", "isActive", "createdAt", "updatedAt")
    VALUES (${category.id}, ${category.name}, ${sortOrder}, true, NOW(), NOW())
    ON CONFLICT ("id") DO NOTHING
  `);
}

async function deactivateMissingServiceCategories(
  tx: SqlClient,
  categoryIds: string[],
) {
  if (categoryIds.length === 0) {
    await tx.$executeRaw(Prisma.sql`
      UPDATE "ServiceCategory"
      SET "isActive" = false, "updatedAt" = NOW()
      WHERE "isActive" = true
    `);
    return;
  }

  await tx.$executeRaw(Prisma.sql`
    UPDATE "ServiceCategory"
    SET "isActive" = false, "updatedAt" = NOW()
    WHERE "isActive" = true
      AND "id" NOT IN (${Prisma.join(categoryIds)})
  `);
}

export async function reorderServiceCategories(
  categoryIdsInput: unknown,
): Promise<DemoServicesStore> {
  const categoryIds = assertStringArray(categoryIdsInput, "Порядок категорий");

  await prisma.$transaction(async (tx) => {
    const currentCategories = await listActiveServiceCategories(tx);

    assertSameIds(
      categoryIds,
      currentCategories.map((category) => category.id),
      "Порядок категорий",
    );

    for (const [categoryIndex, categoryId] of categoryIds.entries()) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "ServiceCategory"
        SET "sortOrder" = ${(categoryIndex + 1) * 10}
        WHERE "id" = ${categoryId}
          AND "isActive" = true
      `);
    }
  });

  return listServiceCatalog();
}

export async function reorderServicesInCategory(
  categoryIdInput: unknown,
  serviceIdsInput: unknown,
): Promise<DemoServicesStore> {
  if (typeof categoryIdInput !== "string" || !categoryIdInput.trim()) {
    throw new Error("Порядок услуг: некорректная категория.");
  }

  const categoryId = categoryIdInput.trim();
  const serviceIds = assertStringArray(serviceIdsInput, "Порядок услуг");

  await prisma.$transaction(async (tx) => {
    const currentServices = await tx.service.findMany({
      where: {
        categoryKey: categoryId,
        isActive: true,
      },
      select: {
        id: true,
      },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });

    assertSameIds(
      serviceIds,
      currentServices.map((service) => service.id),
      "Порядок услуг",
    );

    for (const [serviceIndex, serviceId] of serviceIds.entries()) {
      await tx.$executeRaw(Prisma.sql`
        UPDATE "Service"
        SET "sortOrder" = ${(serviceIndex + 1) * 10}
        WHERE "id" = ${serviceId}
          AND "categoryKey" = ${categoryId}
          AND "isActive" = true
      `);
    }
  });

  return listServiceCatalog();
}

async function seedInitialCatalog(tx: SqlClient) {
  const seededCategories = INITIAL_SERVICE_CATEGORIES.map(cloneCategory);

  for (const [categoryIndex, category] of seededCategories.entries()) {
    await upsertServiceCategory(tx, category, (categoryIndex + 1) * 10);

    for (const [serviceIndex, service] of category.services.entries()) {
      await upsertServiceFromCatalog(
        tx,
        { id: category.id, name: category.name },
        service,
        (serviceIndex + 1) * 10,
      );
    }
  }
}

type CatalogRepairSnapshot = {
  categoryIds: Set<string>;
  serviceIds: Set<string>;
  pricingMetadataServiceIds: Set<string>;
  salaryRuleServiceIds: Set<string>;
};

async function getCatalogRepairSnapshot(tx: SqlClient): Promise<CatalogRepairSnapshot> {
  const [categoryRows, services, pricingMetadata, salaryRules] = await Promise.all([
    tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "ServiceCategory"
    `),
    tx.service.findMany({
      select: { id: true },
    }),
    tx.servicePricingMetadata.findMany({
      select: { serviceId: true },
    }),
    tx.salaryRule.findMany({
      select: { serviceId: true },
    }),
  ]);

  return {
    categoryIds: new Set(categoryRows.map((category) => category.id)),
    serviceIds: new Set(services.map((service) => service.id)),
    pricingMetadataServiceIds: new Set(
      pricingMetadata.map((metadata) => metadata.serviceId),
    ),
    salaryRuleServiceIds: new Set(salaryRules.map((salaryRule) => salaryRule.serviceId)),
  };
}

async function repairInitialCatalog(tx: SqlClient) {
  const seededCategories = INITIAL_SERVICE_CATEGORIES.map(cloneCategory);
  const snapshot = await getCatalogRepairSnapshot(tx);

  for (const [categoryIndex, category] of seededCategories.entries()) {
    if (!snapshot.categoryIds.has(category.id)) {
      await insertServiceCategoryIfMissing(tx, category, (categoryIndex + 1) * 10);
      snapshot.categoryIds.add(category.id);
    }

    for (const [serviceIndex, service] of category.services.entries()) {
      if (!snapshot.serviceIds.has(service.id)) {
        await tx.service.createMany({
          data: [
            {
              id: service.id,
              categoryKey: category.id,
              categoryLabelSnapshot: category.name,
              name: service.name,
              serviceType: service.serviceType,
              pricingMode: service.pricingMode,
              priceType: service.priceType,
              isActive: true,
              sortOrder: (serviceIndex + 1) * 10,
            },
          ],
          skipDuplicates: true,
        });
        snapshot.serviceIds.add(service.id);
      }

      if (!snapshot.pricingMetadataServiceIds.has(service.id)) {
        await tx.servicePricingMetadata.createMany({
          data: [
            {
              serviceId: service.id,
              fixedPrice: toDecimalOrNull(service.fixedPrice > 0 ? service.fixedPrice : null),
              priceFrom: toDecimalOrNull(service.priceFrom > 0 ? service.priceFrom : null),
              matrixPricesJson: service.matrixPrices,
              modifierEnabledJson: service.modifierEnabled,
              modifierMatrixPricesJson: service.modifierMatrixPrices,
              modifierExplicitlyClearedJson: service.modifierExplicitlyCleared,
              priceBandsJson: service.priceBands,
              displayPriceLabelOverride: service.displayPriceLabelOverride ?? null,
              costPrice: toDecimalOrNull(isValidCostPrice(service.costPrice) ? service.costPrice : null),
            },
          ],
          skipDuplicates: true,
        });
        snapshot.pricingMetadataServiceIds.add(service.id);
      }

      if (!snapshot.salaryRuleServiceIds.has(service.id)) {
        await tx.salaryRule.createMany({
          data: [
            {
              serviceId: service.id,
              ruleType: service.salaryRuleType,
              salaryPercent: toDecimalOrNull(
                service.salaryPercent > 0 ? service.salaryPercent : null,
              ),
              salaryFixedAmount: toDecimalOrNull(
                service.salaryFixedAmount > 0 ? service.salaryFixedAmount : null,
              ),
              salaryPerUnitAmount: toDecimalOrNull(
                service.salaryPerUnitAmount > 0 ? service.salaryPerUnitAmount : null,
              ),
              usesCostPrice: service.usesCostPrice,
              reducedEmployeePercentEnabled: service.reducedEmployeePercentEnabled,
              reducedEmployeePercentValue: toDecimalOrNull(
                service.reducedEmployeePercentValue > 0
                  ? service.reducedEmployeePercentValue
                  : null,
              ),
            },
          ],
          skipDuplicates: true,
        });
        snapshot.salaryRuleServiceIds.add(service.id);
      }
    }
  }
}

function supportsFoundationTransaction(client: SqlClient | RootSqlClient): client is RootSqlClient {
  return typeof (client as RootSqlClient).$transaction === "function";
}

export async function ensureServiceCatalogFoundation(
  tx: SqlClient | RootSqlClient = prisma,
) {
  if (supportsFoundationTransaction(tx)) {
    await tx.$transaction(async (foundationTx) => {
      await repairInitialCatalog(foundationTx);
    });

    return;
  }

  await repairInitialCatalog(tx);
}

function mapServiceRecord(
  category: { id: string; name: string },
  service: {
    id: string;
    name: string;
    serviceType: string;
    pricingMode: string;
    priceType: string;
    pricingMetadata: {
      fixedPrice: Prisma.Decimal | null;
      priceFrom: Prisma.Decimal | null;
      matrixPricesJson: Prisma.JsonValue;
      modifierEnabledJson: Prisma.JsonValue;
      modifierMatrixPricesJson: Prisma.JsonValue;
      modifierExplicitlyClearedJson: Prisma.JsonValue;
      priceBandsJson: Prisma.JsonValue;
      displayPriceLabelOverride: string | null;
      costPrice: Prisma.Decimal | null;
    } | null;
    salaryRule: {
      ruleType: string;
      salaryPercent: Prisma.Decimal | null;
      salaryFixedAmount: Prisma.Decimal | null;
      salaryPerUnitAmount: Prisma.Decimal | null;
      usesCostPrice: boolean;
      reducedEmployeePercentEnabled: boolean;
      reducedEmployeePercentValue: Prisma.Decimal | null;
    } | null;
  },
) {
  return normalizeService(category.id, {
    id: service.id,
    categoryId: category.id,
    name: service.name,
    serviceType: service.serviceType as ServicesAdminService["serviceType"],
    pricingMode: service.pricingMode as ServicesAdminService["pricingMode"],
    priceType: service.priceType as ServicesAdminService["priceType"],
    fixedPrice: decimalToNumber(service.pricingMetadata?.fixedPrice),
    priceFrom: decimalToNumber(service.pricingMetadata?.priceFrom),
    matrixPrices: toPlainObject<ServicesAdminPriceMatrix>(
      service.pricingMetadata?.matrixPricesJson,
      createEmptyPriceMatrix(),
    ),
    modifierMatrixPrices: toPlainObject(
      service.pricingMetadata?.modifierMatrixPricesJson,
      {},
    ),
    modifierEnabled: toPlainObject<ServicesAdminModifierEnabledMap>(
      service.pricingMetadata?.modifierEnabledJson,
      { low_profile: false, runflat: false },
    ),
    modifierExplicitlyCleared: toPlainObject<ServicesAdminModifierExplicitlyClearedMap>(
      service.pricingMetadata?.modifierExplicitlyClearedJson,
      { low_profile: false, runflat: false },
    ),
    displayPriceLabel: "",
    displayPriceLabelOverride: service.pricingMetadata?.displayPriceLabelOverride ?? undefined,
    priceBands: Array.isArray(service.pricingMetadata?.priceBandsJson)
      ? (service.pricingMetadata?.priceBandsJson as ServicesAdminPriceBand[])
      : [],
    salaryRuleType: (service.salaryRule?.ruleType ?? "percent_of_work") as ServicesAdminService["salaryRuleType"],
    salaryPercent: decimalToNumber(service.salaryRule?.salaryPercent),
    salaryFixedAmount: decimalToNumber(service.salaryRule?.salaryFixedAmount),
    salaryPerUnitAmount: decimalToNumber(service.salaryRule?.salaryPerUnitAmount),
    usesCostPrice: service.salaryRule?.usesCostPrice ?? false,
    costPrice: decimalToNumber(service.pricingMetadata?.costPrice),
    reducedEmployeePercentEnabled: service.salaryRule?.reducedEmployeePercentEnabled ?? false,
    reducedEmployeePercentValue: decimalToNumber(service.salaryRule?.reducedEmployeePercentValue),
  });
}

export async function listServiceCatalog(): Promise<DemoServicesStore> {
  const [categories, services] = await Promise.all([
    listActiveServiceCategories(prisma),
    prisma.service.findMany({
      where: { isActive: true },
      include: {
        pricingMetadata: true,
        salaryRule: true,
      },
      orderBy: [{ categoryKey: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  const servicesByCategory = new Map<string, typeof services>();
  services.forEach((service: (typeof services)[number]) => {
    const bucket = servicesByCategory.get(service.categoryKey) ?? [];
    bucket.push(service);
    servicesByCategory.set(service.categoryKey, bucket);
  });

  return sanitizeStage1CatalogStore({
    categories: categories.map((category: ServiceCategoryRow) => ({
      id: category.id,
      name: category.name,
      services: (servicesByCategory.get(category.id) ?? []).map((service: (typeof services)[number]) =>
        mapServiceRecord(category, service),
      ),
    })),
  });
}

export async function replaceServiceCatalog(input: unknown): Promise<DemoServicesStore> {
  const currentCatalog = await listServiceCatalog();
  const store = assertValidServicesStore(input, currentCatalog);

  await prisma.$transaction(async (tx) => {
    const nextCategoryIds = new Set(store.categories.map((category) => category.id));
    const nextServiceIds = new Set(
      store.categories.flatMap((category) => category.services.map((service) => service.id)),
    );

    for (const [categoryIndex, category] of store.categories.entries()) {
      await upsertServiceCategory(tx, category, (categoryIndex + 1) * 10);

      for (const [serviceIndex, service] of category.services.entries()) {
        await upsertServiceFromCatalog(
          tx,
          { id: category.id, name: category.name },
          service,
          (serviceIndex + 1) * 10,
        );
      }
    }

    await deactivateMissingServiceCategories(tx, [...nextCategoryIds]);

    await tx.service.updateMany({
      where: {
        isActive: true,
        id: { notIn: [...nextServiceIds] },
      },
      data: { isActive: false },
    });
  });

  return listServiceCatalog();
}

export async function recoverServiceCatalogFromSeed() {
  const seededCategories = INITIAL_SERVICE_CATEGORIES.map(cloneCategory);
  const categoryIds = seededCategories.map((category) => category.id);
  const serviceIds = seededCategories.flatMap((category) =>
    category.services.map((service) => service.id),
  );

  await prisma.$transaction(async (tx) => {
    await seedInitialCatalog(tx);
  });

  return {
    categoryIds,
    serviceIds,
    categoriesRecovered: categoryIds.length,
    servicesRecovered: serviceIds.length,
  };
}

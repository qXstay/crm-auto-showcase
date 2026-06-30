import argon2 from "argon2";
import { pathToFileURL } from "node:url";
import { INITIAL_SERVICE_CATEGORIES } from "./initial-catalog.mjs";
import { configureDemoProfileSqlitePragmas } from "./sqlite-pragmas.mjs";

const DEMO_RESET_EVENT_TYPE = "demo.reset";
const DEMO_RESET_REASON_LABEL = "Возврат к базовому сценарию";
const DEFAULT_RESET_INTERVAL_MINUTES = 15;
const DEFAULT_ACTIVE_SESSION_WINDOW_MINUTES = 15;
const ROSTER_EMPLOYEE_NURISLAMOV_NAME = "Ильнар Нурисламов";
const ROSTER_EMPLOYEE_ELPANOV_NAME = "Максим Елпанов";

function isSqliteDatabaseUrl(value) {
  return typeof value === "string" && value.trim().startsWith("file:");
}

function resolveDatabaseProvider() {
  if ((process.env.SQLITE_DATABASE_URL ?? "").trim().length > 0) {
    return "sqlite";
  }

  if (isSqliteDatabaseUrl(process.env.DATABASE_URL)) {
    return "sqlite";
  }

  return "postgresql";
}

async function loadPrismaClientConstructor() {
  if (DATABASE_PROVIDER === "sqlite") {
    const prismaModule = await import("../node_modules/.prisma/sqlite-client/index.js");
    return prismaModule.PrismaClient;
  }

  const prismaModule = await import("@prisma/client");
  return prismaModule.PrismaClient;
}

const DATABASE_PROVIDER = resolveDatabaseProvider();
const PrismaClient = await loadPrismaClientConstructor();
const prisma = new PrismaClient();
await configureDemoProfileSqlitePragmas(prisma);

function resolvePositiveMinutesOption(optionValue, envName, fallbackValue) {
  if (Number.isFinite(optionValue) && optionValue > 0) {
    return optionValue;
  }

  const envValue = Number.parseInt(process.env[envName] ?? "", 10);
  return Number.isFinite(envValue) && envValue > 0 ? envValue : fallbackValue;
}

function escapeSqlIdentifier(value) {
  return value.replaceAll('"', '""');
}

const MINIMAL_SERVICE_CATEGORIES = INITIAL_SERVICE_CATEGORIES.map((cat, idx) => ({
  id: cat.id,
  name: cat.name,
  sortOrder: (idx + 1) * 10,
}));

const MINIMAL_SEED_SERVICES = INITIAL_SERVICE_CATEGORIES.flatMap((cat) => {
  return cat.services.map((svc, idx) => ({
    id: svc.id,
    categoryKey: cat.id,
    categoryLabelSnapshot: cat.name,
    name: svc.name,
    serviceType: svc.serviceType,
    pricingMode: svc.pricingMode,
    priceType: svc.priceType,
    sortOrder: (idx + 1) * 10,
    pricingMetadata: {
      fixedPrice: svc.fixedPrice > 0 ? svc.fixedPrice : null,
      priceFrom: svc.priceFrom > 0 ? svc.priceFrom : null,
      matrixPricesJson: svc.matrixPrices,
      modifierEnabledJson: svc.modifierEnabled,
      modifierMatrixPricesJson: svc.modifierMatrixPrices,
      modifierExplicitlyClearedJson: svc.modifierExplicitlyCleared,
      priceBandsJson: svc.priceBands,
      displayPriceLabelOverride: svc.displayPriceLabelOverride ?? null,
      costPrice: svc.costPrice > 0 ? svc.costPrice : null,
    },
    salaryRule: {
      ruleType: svc.salaryRuleType,
      salaryPercent: svc.salaryPercent > 0 ? svc.salaryPercent : null,
      salaryFixedAmount: svc.salaryFixedAmount > 0 ? svc.salaryFixedAmount : null,
      salaryPerUnitAmount: svc.salaryPerUnitAmount > 0 ? svc.salaryPerUnitAmount : null,
      usesCostPrice: svc.usesCostPrice,
      reducedEmployeePercentEnabled: svc.reducedEmployeePercentEnabled,
      reducedEmployeePercentValue: svc.reducedEmployeePercentValue > 0 ? svc.reducedEmployeePercentValue : null,
    },
  }));
});


async function ensureMinimalServiceFoundation() {
  for (const category of MINIMAL_SERVICE_CATEGORIES) {
    await prisma.serviceCategory.upsert({
      where: { id: category.id },
      update: {
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true,
      },
      create: {
        id: category.id,
        name: category.name,
        sortOrder: category.sortOrder,
        isActive: true,
      },
    });
  }

  for (const service of MINIMAL_SEED_SERVICES) {
    await prisma.service.upsert({
      where: { id: service.id },
      update: {
        categoryKey: service.categoryKey,
        categoryLabelSnapshot: service.categoryLabelSnapshot,
        name: service.name,
        serviceType: service.serviceType,
        pricingMode: service.pricingMode,
        priceType: service.priceType,
        sortOrder: service.sortOrder,
        isActive: true,
      },
      create: {
        id: service.id,
        categoryKey: service.categoryKey,
        categoryLabelSnapshot: service.categoryLabelSnapshot,
        name: service.name,
        serviceType: service.serviceType,
        pricingMode: service.pricingMode,
        priceType: service.priceType,
        sortOrder: service.sortOrder,
        isActive: true,
      },
    });

    await prisma.servicePricingMetadata.upsert({
      where: { serviceId: service.id },
      update: service.pricingMetadata,
      create: {
        serviceId: service.id,
        ...service.pricingMetadata,
      },
    });

    await prisma.salaryRule.upsert({
      where: { serviceId: service.id },
      update: service.salaryRule,
      create: {
        serviceId: service.id,
        ...service.salaryRule,
      },
    });
  }
}

async function truncatePostgresPublicTables() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename ASC
  `);
  const tableNames = rows
    .map((row) => row?.tablename)
    .filter((value) => typeof value === "string" && value.length > 0);

  if (tableNames.length === 0) {
    return;
  }

  const identifiers = tableNames
    .map((name) => `"public"."${escapeSqlIdentifier(name)}"`)
    .join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`);
}

async function truncateSqliteTables() {
  const rows = await prisma.$queryRawUnsafe(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name <> '_prisma_migrations'
    ORDER BY name ASC
  `);
  const tableNames = rows
    .map((row) => row?.name)
    .filter((value) => typeof value === "string" && value.length > 0);

  if (tableNames.length === 0) {
    return;
  }

  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = OFF");

  try {
    for (const tableName of tableNames) {
      await prisma.$executeRawUnsafe(`DELETE FROM "${escapeSqlIdentifier(tableName)}"`);
    }

    const sequenceRows = await prisma.$queryRawUnsafe(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'sqlite_sequence'
      LIMIT 1
    `);

    if (sequenceRows.length > 0) {
      await prisma.$executeRawUnsafe("DELETE FROM sqlite_sequence");
    }
  } finally {
    await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}

async function truncateSeedTables() {
  if (DATABASE_PROVIDER === "sqlite") {
    return truncateSqliteTables();
  }

  return truncatePostgresPublicTables();
}

async function seedRolePermissions(role) {
  const permissionRows = role.permissionIds.map((permissionId) => ({
    roleId: role.id,
    permissionId,
  }));

  if (DATABASE_PROVIDER === "sqlite") {
    for (const row of permissionRows) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: row.roleId,
            permissionId: row.permissionId,
          },
        },
        update: {},
        create: row,
      });
    }

    return;
  }

  await prisma.rolePermission.createMany({
    data: permissionRows,
    skipDuplicates: true,
  });
}

async function seedEmployeeBranchAccessRows(employee) {
  const branchAccessRows = employee.branchAccess.map((branchId) => ({
    employeeId: employee.id,
    branchId,
    isDefault: branchId === employee.defaultBranchId,
    canOperate: true,
    canSwitchInto: true,
  }));

  if (DATABASE_PROVIDER === "sqlite") {
    for (const row of branchAccessRows) {
      await prisma.employeeBranchAccess.upsert({
        where: {
          employeeId_branchId: {
            employeeId: row.employeeId,
            branchId: row.branchId,
          },
        },
        update: {
          isDefault: row.isDefault,
          canOperate: row.canOperate,
          canSwitchInto: row.canSwitchInto,
        },
        create: row,
      });
    }

    return;
  }

  await prisma.employeeBranchAccess.createMany({
    data: branchAccessRows,
    skipDuplicates: true,
  });
}

function buildResetAuditId(date = new Date()) {
  return `demo-reset-${date.getTime()}`;
}

async function writeDemoResetAuditEvent(reason, intervalMinutes) {
  const createdAt = new Date();
  await prisma.auditEvent.create({
    data: {
      id: buildResetAuditId(createdAt),
      eventType: DEMO_RESET_EVENT_TYPE,
      actorUserId: null,
      actorEmployeeId: null,
      branchId: null,
      entityType: "demo",
      entityId: "crm-showcase",
      payloadJson: {
        actionLabel: DEMO_RESET_REASON_LABEL,
        reason,
        intervalMinutes,
        resetAt: createdAt.toISOString(),
      },
    },
  });
}

const branches = [
  {
    id: "branch-gotvalda-9",
    code: "severny",
    name: "Северный",
    displayName: "Северный",
    address: "ул. Сервисная, 10",
    phone: "+7 900 001-00-10",
  },
  {
    id: "branch-shorsa-7",
    code: "centralny",
    name: "Центральный",
    displayName: "Центральный",
    address: "ул. Центральная, 24",
    phone: "+7 900 002-00-20",
  },
  {
    id: "branch-pobedy-14",
    code: "yuzhny",
    name: "Южный",
    displayName: "Южный",
    address: "ул. Южная, 7",
    phone: "+7 900 003-00-30",
  },
];

const permissionGroups = [
  {
    id: "analytics",
    permissions: [{ id: "analytics.view", label: "Просмотр аналитики" }],
  },
  {
    id: "booking",
    permissions: [
      { id: "booking.view", label: "Просмотр записей" },
      { id: "booking.create", label: "Создание записей" },
      { id: "booking.edit_own", label: "Редактирование своих записей" },
      { id: "booking.edit_all", label: "Редактирование всех записей" },
      { id: "booking.delete_own", label: "Удаление своих записей" },
      { id: "booking.delete_all", label: "Удаление всех записей" },
    ],
  },
  {
    id: "shift",
    permissions: [
      { id: "shift.view", label: "Просмотр смен" },
      { id: "shift.open", label: "Открытие смены" },
      { id: "shift.close", label: "Закрытие смены" },
    ],
  },
  {
    id: "order",
    permissions: [
      { id: "order.view", label: "Просмотр заказов" },
      { id: "order.create", label: "Создание заказов" },
      { id: "order.edit_own", label: "Редактирование своих заказов" },
      { id: "order.edit_all", label: "Редактирование всех заказов" },
      { id: "order.delete_own", label: "Удаление своих заказов" },
      { id: "order.delete_all", label: "Удаление всех заказов" },
    ],
  },
  {
    id: "storage",
    permissions: [
      { id: "storage.view", label: "Просмотр склада" },
      { id: "storage.create", label: "Создание записей" },
      { id: "storage.edit_own", label: "Редактирование своих записей" },
      { id: "storage.edit_all", label: "Редактирование всех записей" },
    ],
  },
  {
    id: "client",
    permissions: [
      { id: "client.view", label: "Просмотр клиентов" },
      { id: "client.create", label: "Создание клиентов" },
      { id: "client.edit", label: "Редактирование клиентов" },
      { id: "client.delete", label: "Удаление клиентов" },
    ],
  },
  {
    id: "finance",
    permissions: [
      { id: "finance.view", label: "Просмотр финансов" },
      { id: "finance.create", label: "Создание финансов" },
      { id: "finance.delete", label: "Удаление финансов" },
    ],
  },
  {
    id: "report",
    permissions: [{ id: "report.view", label: "Просмотр отчетов" }],
  },
  {
    id: "settings",
    permissions: [
      { id: "settings.main", label: "Общие настройки" },
      { id: "settings.booking", label: "Настройки бронирования" },
      { id: "settings.employees", label: "Настройки сотрудников" },
      { id: "settings.roles", label: "Настройки ролей" },
      { id: "settings.services", label: "Настройки услуг" },
      { id: "settings.clients", label: "Настройки клиентов" },
      { id: "settings.storage", label: "Настройки склада" },
      { id: "settings.accounts", label: "Настройки счетов" },
      { id: "settings.branch", label: "Настройки филиалов" },
    ],
  },
];

const roles = [
  {
    id: "developer",
    name: "Сотрудник",
    systemKey: "developer",
    permissionIds: [
      "booking.view",
      "booking.create",
      "shift.view",
      "shift.open",
      "shift.close",
      "order.view",
      "order.create",
      "storage.view",
      "storage.edit_own",
      "client.view",
      "client.create",
      "client.edit",
    ],
  },
  {
    id: "owner",
    name: "Владелец",
    systemKey: "owner",
    permissionIds: permissionGroups.flatMap((group) =>
      group.permissions.map((permission) => permission.id),
    ),
  },
];

function createRosterEmployee({
  id,
  firstName,
  lastName,
  middleName = "",
  skillLevel = null,
  workPercent = "0",
}) {
  return {
    id,
    userId: null,
    phone: "",
    login: null,
    pin: null,
    firstName,
    lastName,
    middleName,
    roleId: "developer",
    hiredAt: "2026-06-25T09:00:00+05:00",
    firedAt: null,
    lastActivityAt: null,
    skillLevel,
    workPercent,
    shiftMinimum: "0",
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: true,
    branchAccess: branches.map((branch) => branch.id),
    defaultBranchId: "branch-gotvalda-9",
  };
}

const commonRosterEmployees = [
  createRosterEmployee({
    id: "employee-zagorodnov-mikhail",
    firstName: "Алексей",
    lastName: "Орлов",
    skillLevel: "level_1",
    workPercent: "35",
  }),
  createRosterEmployee({
    id: "employee-nurislamov-ilnar",
    firstName: "Ильнар",
    lastName: "Нурисламов",
    skillLevel: "level_2",
    workPercent: "32",
  }),
  createRosterEmployee({
    id: "employee-gaysin-aidar",
    firstName: "Игорь",
    lastName: "Серов",
    skillLevel: "level_3",
    workPercent: "30",
  }),
  createRosterEmployee({
    id: "employee-elpanov-maksim",
    firstName: "Максим",
    lastName: "Елпанов",
    skillLevel: "level_2",
    workPercent: "30",
  }),
];

const employees = [
  {
    id: "employee-admin",
    userId: "user-admin",
    phone: "+7 900 000-00-01",
    login: "9000000001",
    pin: "1234",
    firstName: "Алексей",
    lastName: "Орлов",
    middleName: "",
    roleId: "owner",
    hiredAt: null,
    firedAt: null,
    lastActivityAt: "2026-06-28T11:02:00+05:00",
    skillLevel: "level_1",
    workPercent: "35",
    shiftMinimum: "2500",
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: false,
    branchAccess: ["branch-gotvalda-9", "branch-shorsa-7", "branch-pobedy-14"],
    defaultBranchId: "branch-gotvalda-9",
  },
  {
    id: "employee-manager2",
    userId: "user-manager2",
    phone: "+7 900 000-00-02",
    login: "9000000002",
    pin: "5678",
    firstName: "Марина",
    lastName: "Климова",
    middleName: "",
    roleId: "owner",
    hiredAt: "2026-06-09T09:00:00+05:00",
    firedAt: null,
    lastActivityAt: null,
    skillLevel: "level_1",
    workPercent: "35",
    shiftMinimum: "0",
    addMinimumToWorkPercent: false,
    canBeAssignedExecutor: false,
    branchAccess: ["branch-gotvalda-9", "branch-shorsa-7", "branch-pobedy-14"],
    defaultBranchId: "branch-shorsa-7",
  },
  {
    id: "employee-staff1",
    userId: "user-staff1",
    phone: "+7 900 000-00-03",
    login: "9000000003",
    pin: "9012",
    firstName: "Игорь",
    lastName: "Серов",
    middleName: "",
    roleId: "developer",
    hiredAt: "2026-06-25T09:00:00+05:00",
    firedAt: null,
    lastActivityAt: "2026-06-11T13:21:00+05:00",
    skillLevel: "level_3",
    workPercent: "30",
    shiftMinimum: "3500",
    addMinimumToWorkPercent: true,
    canBeAssignedExecutor: false,
    branchAccess: ["branch-gotvalda-9"],
    defaultBranchId: "branch-gotvalda-9",
  },
  ...commonRosterEmployees,
];

const branchProfiles = [
  {
    branchId: "branch-gotvalda-9",
    legalName: "Auto CRM",
    displayName: "Северный",
    address: "ул. Сервисная, 10",
    phone: "+7 900 001-00-10",
    timezoneLabel: "+5 Екатеринбург, Челябинск, Тюмень",
    workStart: "09:00",
    workEnd: "21:00",
  },
  {
    branchId: "branch-shorsa-7",
    legalName: "Auto CRM",
    displayName: "Центральный",
    address: "ул. Центральная, 24",
    phone: "+7 900 002-00-20",
    timezoneLabel: "+5 Екатеринбург, Челябинск, Тюмень",
    workStart: "09:00",
    workEnd: "21:00",
  },
  {
    branchId: "branch-pobedy-14",
    legalName: "Auto CRM",
    displayName: "Южный",
    address: "ул. Южная, 7",
    phone: "+7 900 003-00-30",
    timezoneLabel: "+5 Екатеринбург, Челябинск, Тюмень",
    workStart: "09:00",
    workEnd: "21:00",
  },
];

const branchPrintSettings = branchProfiles.map((profile) => ({
  branchId: profile.branchId,
  receiptTitle: "Auto CRM",
  footerNote: "Чек из программы без фискализации",
  showPhone: true,
  showAddress: true,
}));

const paymentAccounts = branches.flatMap((branch) => [
  {
    id: `${branch.id}-account-automation-service`,
    branchId: branch.id,
    name: "Основной счёт",
    isArchived: false,
    isProtected: true,
  },
  {
    id: `${branch.id}-account-ip`,
    branchId: branch.id,
    name: "Безнал",
    isArchived: false,
    isProtected: true,
  },
  {
    id: `${branch.id}-account-cash`,
    branchId: branch.id,
    name: "Наличные",
    isArchived: false,
    isProtected: true,
  },
]);

const bookingSettings = branches.map((branch) => ({
  branchId: branch.id,
  publicSlug: branch.code,
  onlineEnabled: true,
  slotWindowMinutes: 15,
  allowPostChoice: true,
  allowMultipleWindows: false,
  metricsId: "0",
  telegramChatId: "0",
  postsJson: [
    { id: "post-1", name: "Пост 1" },
    { id: "post-2", name: "Пост 2" },
    { id: "post-3", name: "Пост 3" },
  ],
}));

const storageSettings = [
  {
    branchId: "branch-gotvalda-9",
    warehousesJson: [
      {
        id: "warehouse-gotvalda-9",
        name: "Северный",
        shelvesCount: 3,
        cellsCount: 10,
        protected: true,
        createdAt: "2026-06-28T09:00:00+05:00",
        updatedAt: "2026-06-28T09:00:00+05:00",
      },
    ],
  },
  {
    branchId: "branch-shorsa-7",
    warehousesJson: [
      {
        id: "warehouse-shorsa-7",
        name: "Центральный",
        shelvesCount: 3,
        cellsCount: 8,
        protected: true,
        createdAt: "2026-06-28T09:00:00+05:00",
        updatedAt: "2026-06-28T09:00:00+05:00",
      },
    ],
  },
  {
    branchId: "branch-pobedy-14",
    warehousesJson: [
      {
        id: "warehouse-pobedy-14",
        name: "Южный",
        shelvesCount: 2,
        cellsCount: 12,
        protected: true,
        createdAt: "2026-06-28T09:00:00+05:00",
        updatedAt: "2026-06-28T09:00:00+05:00",
      },
    ],
  },
];

const clientSourceSettings = branches.map((branch) => ({
  branchId: branch.id,
  sourcesJson: [
    {
      id: "source-internet",
      name: "интернет",
      protected: true,
      createdAt: "2026-06-28T09:00:00+05:00",
      updatedAt: "2026-06-28T09:00:00+05:00",
    },
  ],
}));

// Service catalog is initialized from the current backend catalog truth
// in `INITIAL_SERVICE_CATEGORIES` via `ensureServiceCatalogFoundation()`.
// Keep seed focused on operational entities so a fresh DB does not receive
// legacy duplicate service prices during deploy.
const SHOULD_SEED_DEMO_OPERATIONAL_DATA = true;

const clients = [
  {
    id: "denis-pavlov",
    fullName: "Денис Павлов",
    shortName: "Денис Павлов",
    firstName: "Денис",
    lastName: "Павлов",
    middleName: "",
    phone: "+7 900 100-10-01",
    email: "",
    source: "Постоянный клиент",
    note: "Чаще приезжает после работы, любит быстрый приём.",
    registeredAt: "2026-06-05T09:00:00+05:00",
  },
  {
    id: "natalya-orlova",
    fullName: "Наталья Орлова",
    shortName: "Наталья Орлова",
    firstName: "Наталья",
    lastName: "Орлова",
    middleName: "",
    phone: "+7 900 200-20-02",
    email: "",
    source: "Instagram",
    note: "Просит заранее предупредить о готовности машины.",
    registeredAt: "2026-06-09T12:00:00+05:00",
  },
  {
    id: "boris-zelen",
    fullName: "Павел Морозов",
    shortName: "Павел Морозов",
    firstName: "Павел",
    lastName: "Морозов",
    middleName: "",
    phone: "+7 900 300-30-03",
    email: "",
    source: "Рекомендация",
    note: "",
    registeredAt: "2026-06-17T10:00:00+05:00",
  },
  {
    id: "anna-sokolova",
    fullName: "Анна Соколова",
    shortName: "Анна Соколова",
    firstName: "Анна",
    lastName: "Соколова",
    middleName: "",
    phone: "+7 900 400-40-04",
    email: "",
    source: "Повторный визит",
    note: "Ожидает звонок за 30 минут до готовности.",
    registeredAt: "2026-06-11T11:30:00+05:00",
  },
  {
    id: "sergey-volkov",
    fullName: "Ирина Белова",
    shortName: "Ирина Белова",
    firstName: "Ирина",
    lastName: "Белова",
    middleName: "",
    phone: "+7 900 500-50-05",
    email: "",
    source: "Постоянный клиент",
    note: "Оставляет комплект на сезонное хранение.",
    registeredAt: "2026-06-25T10:00:00+05:00",
  },
];

const vehicles = [
  {
    id: "vehicle-bmw-3",
    clientId: "denis-pavlov",
    label: "BMW 3 серии",
    brand: "BMW",
    model: "3 серии",
    plateNumber: "О313АА 196",
    radius: "R17",
    totalSpent: 4820,
  },
  {
    id: "vehicle-skoda-octavia",
    clientId: "denis-pavlov",
    label: "Skoda Octavia",
    brand: "Skoda",
    model: "Octavia",
    plateNumber: "М410НХ 196",
    radius: "R16",
    totalSpent: 2780,
  },
  {
    id: "vehicle-brabus-v12",
    clientId: "natalya-orlova",
    label: "Brabus V12",
    brand: "Brabus",
    model: "V12",
    plateNumber: "А001МР 196",
    radius: "R20",
    totalSpent: 6520,
  },
  {
    id: "vehicle-kia-k5",
    clientId: "anna-sokolova",
    label: "Kia K5",
    brand: "Kia",
    model: "K5",
    plateNumber: "Т412РК 196",
    radius: "R18",
    totalSpent: 4120,
  },
  {
    id: "vehicle-lada-largus",
    clientId: "boris-zelen",
    label: "LADA Largus",
    brand: "LADA",
    model: "Largus",
    plateNumber: "Е220КУ 196",
    radius: "R15",
    totalSpent: 1980,
  },
  {
    id: "vehicle-toyota-camry",
    clientId: "sergey-volkov",
    label: "Toyota Camry",
    brand: "Toyota",
    model: "Camry",
    plateNumber: "С777ОР 196",
    radius: "R18",
    totalSpent: 4260,
  },
];

const shifts = [
  {
    id: "shift-gotvalda-11",
    branchId: "branch-gotvalda-9",
    number: 11,
    status: "closed",
    openedAt: "2026-06-26T09:00:00+05:00",
    closedAt: "2026-06-26T21:05:00+05:00",
    openedByEmployeeId: "employee-zagorodnov-mikhail",
    staffLabelSnapshot: "Алексей Орлов",
    expensesItemsJson: [],
    ordersCountSnapshot: 2,
    revenueTotalSnapshot: 6780,
    cashTotalSnapshot: 4260,
    cashlessTotalSnapshot: 2520,
    expensesTotalSnapshot: 0,
    salaryFundTotalSnapshot: 2373,
    accountBreakdownSnapshotJson: [
      {
        accountId: "branch-gotvalda-9-account-cash",
        accountName: "Наличные",
        amount: 4260,
        isArchived: false,
      },
      {
        accountId: "branch-gotvalda-9-account-ip",
        accountName: "Карта",
        amount: 2520,
        isArchived: false,
      },
    ],
    staff: [
      {
        id: "shift-gotvalda-11-staff-1",
        employeeId: "employee-zagorodnov-mikhail",
        employeeNameSnapshot: "Алексей Орлов",
        workPercentSnapshot: 35,
        shiftMinimumSnapshot: 0,
        skillLevelSnapshot: "level_1",
      },
    ],
  },
  {
    id: "shift-gotvalda-12",
    branchId: "branch-gotvalda-9",
    number: 12,
    status: "closed",
    openedAt: "2026-06-27T09:00:00+05:00",
    closedAt: "2026-06-27T21:00:00+05:00",
    openedByEmployeeId: "employee-zagorodnov-mikhail",
    staffLabelSnapshot: `Алексей Орлов, ${ROSTER_EMPLOYEE_ELPANOV_NAME}`,
    expensesItemsJson: [{ id: "expense-12-1", amount: 450, description: "Хоз. расход", createdAt: "2026-06-27T16:20:00+05:00" }],
    ordersCountSnapshot: 2,
    revenueTotalSnapshot: 10000,
    cashTotalSnapshot: 3480,
    cashlessTotalSnapshot: 6520,
    expensesTotalSnapshot: 450,
    salaryFundTotalSnapshot: 3500,
    accountBreakdownSnapshotJson: [
      {
        accountId: "branch-gotvalda-9-account-cash",
        accountName: "Наличные",
        amount: 3480,
        isArchived: false,
      },
      {
        accountId: "branch-gotvalda-9-account-ip",
        accountName: "Карта",
        amount: 6520,
        isArchived: false,
      },
    ],
    staff: [
      {
        id: "shift-gotvalda-12-staff-1",
        employeeId: "employee-zagorodnov-mikhail",
        employeeNameSnapshot: "Алексей Орлов",
        workPercentSnapshot: 35,
        shiftMinimumSnapshot: 0,
        skillLevelSnapshot: "level_1",
      },
      {
        id: "shift-gotvalda-12-staff-2",
        employeeId: "employee-elpanov-maksim",
        employeeNameSnapshot: ROSTER_EMPLOYEE_ELPANOV_NAME,
        workPercentSnapshot: 30,
        shiftMinimumSnapshot: 0,
        skillLevelSnapshot: "level_2",
      },
    ],
  },
  {
    id: "shift-gotvalda-13",
    branchId: "branch-gotvalda-9",
    number: 13,
    status: "open",
    openedAt: "2026-06-28T09:00:00+05:00",
    closedAt: null,
    openedByEmployeeId: "employee-zagorodnov-mikhail",
    staffLabelSnapshot: `Алексей Орлов, ${ROSTER_EMPLOYEE_NURISLAMOV_NAME}, ${ROSTER_EMPLOYEE_ELPANOV_NAME}`,
    expensesItemsJson: [],
    ordersCountSnapshot: null,
    revenueTotalSnapshot: null,
    cashTotalSnapshot: null,
    cashlessTotalSnapshot: null,
    expensesTotalSnapshot: null,
    salaryFundTotalSnapshot: null,
    accountBreakdownSnapshotJson: null,
    staff: [
      {
        id: "shift-gotvalda-13-staff-1",
        employeeId: "employee-zagorodnov-mikhail",
        employeeNameSnapshot: "Алексей Орлов",
        workPercentSnapshot: 35,
        shiftMinimumSnapshot: 0,
        skillLevelSnapshot: "level_1",
      },
      {
        id: "shift-gotvalda-13-staff-2",
        employeeId: "employee-nurislamov-ilnar",
        employeeNameSnapshot: ROSTER_EMPLOYEE_NURISLAMOV_NAME,
        workPercentSnapshot: 35,
        shiftMinimumSnapshot: 0,
        skillLevelSnapshot: "level_1",
      },
      {
        id: "shift-gotvalda-13-staff-3",
        employeeId: "employee-elpanov-maksim",
        employeeNameSnapshot: ROSTER_EMPLOYEE_ELPANOV_NAME,
        workPercentSnapshot: 30,
        shiftMinimumSnapshot: 0,
        skillLevelSnapshot: "level_2",
      },
    ],
  },
  {
    id: "shift-shorsa-9",
    branchId: "branch-shorsa-7",
    number: 9,
    status: "closed",
    openedAt: "2026-06-25T09:00:00+05:00",
    closedAt: "2026-06-25T20:00:00+05:00",
    openedByEmployeeId: "employee-gaysin-aidar",
    staffLabelSnapshot: "Игорь Серов",
    expensesItemsJson: [],
    ordersCountSnapshot: 2,
    revenueTotalSnapshot: 11480,
    cashTotalSnapshot: 0,
    cashlessTotalSnapshot: 11480,
    expensesTotalSnapshot: 0,
    salaryFundTotalSnapshot: 4018,
    accountBreakdownSnapshotJson: [
      {
        accountId: "branch-shorsa-7-account-ip",
        accountName: "Карта",
        amount: 11480,
        isArchived: false,
      },
    ],
    staff: [
      {
        id: "shift-shorsa-9-staff-1",
        employeeId: "employee-gaysin-aidar",
        employeeNameSnapshot: "Игорь Серов",
        workPercentSnapshot: 30,
        shiftMinimumSnapshot: 0,
        skillLevelSnapshot: "level_3",
      },
    ],
  },
];

const orders = [
  {
    id: "order-44",
    branchId: "branch-shorsa-7",
    number: 44,
    createdAt: "2026-06-25T10:15:00+05:00",
    updatedAt: "2026-06-25T11:00:00+05:00",
    completedAt: "2026-06-25T11:00:00+05:00",
    status: "Оплачен",
    clientId: "sergey-volkov",
    vehicleId: "vehicle-toyota-camry",
    shiftId: "shift-shorsa-9",
    executorEmployeeId: "employee-gaysin-aidar",
    vehicleType: "passenger",
    radius: "R18",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 1400,
    subtotal: 4000,
    discount: 0,
    totalAmount: 4000,
    servicesCount: 1,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "sergey-volkov",
      label: "Ирина Белова",
      details: "+7 900 500-50-05",
      name: "Ирина Белова",
      phone: "+7 900 500-50-05",
      carBrand: "Toyota",
      carModel: "Camry",
      plateNumber: "С777ОР 196",
      preferredRadius: "R18",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "Toyota Camry",
      brand: "Toyota",
      model: "Camry",
      plateNumber: "С777ОР 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-gaysin-aidar",
      executorNameSnapshot: "Игорь Серов",
    },
    shiftSnapshotJson: {
      shiftId: "shift-shorsa-9",
      shiftLabelSnapshot: "№9 от 25 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-25T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "card",
      paymentLabel: "Карта",
      accountId: "branch-shorsa-7-account-ip",
      accountNameSnapshot: "Карта",
      paidAt: "2026-06-25T11:00:00+05:00",
      paidAmount: 4000,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 4000, discount: 0, total: 4000 },
    printSnapshotJson: {
      branchDisplayName: "Центральный",
      orderNumber: "44",
      paidAmount: 4000,
    },
    lines: [
      {
        id: "order-44-line-1",
        serviceId: "main-package",
        sortOrder: 10,
        quantity: 1,
        unitPrice: 4000,
        lineTotal: 4000,
        serviceNameSnapshot: "Комплекс шиномонтажа",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 1400,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "package",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R18",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 4000,
          resolvedUnitPrice: 4000,
          displayLabel: "R18",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R18",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 4000,
          appliedPercent: 35,
          resultAmount: 1400,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-44",
        accountId: "branch-shorsa-7-account-ip",
        paymentMethod: "card",
        amount: 4000,
        paidAt: "2026-06-25T11:00:00+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "card",
          paymentLabel: "Карта",
          accountId: "branch-shorsa-7-account-ip",
          accountNameSnapshot: "Карта",
          paidAt: "2026-06-25T11:00:00+05:00",
          paidAmount: 4000,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-45",
    branchId: "branch-shorsa-7",
    number: 45,
    createdAt: "2026-06-25T12:30:00+05:00",
    updatedAt: "2026-06-25T13:02:00+05:00",
    completedAt: "2026-06-25T13:02:00+05:00",
    status: "Оплачен",
    clientId: "natalya-orlova",
    vehicleId: "vehicle-brabus-v12",
    shiftId: "shift-shorsa-9",
    executorEmployeeId: "employee-gaysin-aidar",
    vehicleType: "suv",
    radius: "R21",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 2618,
    subtotal: 7480,
    discount: 0,
    totalAmount: 7480,
    servicesCount: 2,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "natalya-orlova",
      label: "Наталья Орлова",
      details: "+7 900 200-20-02",
      name: "Наталья Орлова",
      phone: "+7 900 200-20-02",
      carBrand: "Brabus",
      carModel: "V12",
      plateNumber: "А001МР 196",
      preferredRadius: "R20",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "Brabus V12",
      brand: "Brabus",
      model: "V12",
      plateNumber: "А001МР 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-gaysin-aidar",
      executorNameSnapshot: "Игорь Серов",
    },
    shiftSnapshotJson: {
      shiftId: "shift-shorsa-9",
      shiftLabelSnapshot: "№9 от 25 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-25T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "card",
      paymentLabel: "Карта",
      accountId: "branch-shorsa-7-account-ip",
      accountNameSnapshot: "Карта",
      paidAt: "2026-06-25T13:02:00+05:00",
      paidAmount: 7480,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 2, subtotal: 7480, discount: 0, total: 7480 },
    printSnapshotJson: {
      branchDisplayName: "Центральный",
      orderNumber: "45",
      paidAmount: 7480,
    },
    lines: [
      {
        id: "order-45-line-1",
        serviceId: "balancing",
        sortOrder: 10,
        quantity: 4,
        unitPrice: 1320,
        lineTotal: 5280,
        serviceNameSnapshot: "Балансировка колеса",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 1848,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "service",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "suv",
          radius: "R21",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 1320,
          resolvedUnitPrice: 1320,
          displayLabel: "R21",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Внедорожник",
          radiusLabel: "R21",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 5280,
          appliedPercent: 35,
          resultAmount: 1848,
        },
      },
      {
        id: "order-45-line-2",
        serviceId: null,
        sortOrder: 20,
        quantity: 1,
        unitPrice: 2200,
        lineTotal: 2200,
        serviceNameSnapshot: "Правка литого диска",
        serviceCategorySnapshot: "Ремонт",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 770,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "from",
          pricingMode: "service",
          inputKind: "price_band",
          selectionMode: "price_band",
          vehicleType: null,
          radius: null,
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 2200,
          resolvedUnitPrice: 2200,
          displayLabel: "от 1 700 ₽ до 5 200 ₽",
          selectedOptionLabel: "Легковой · R20+",
          operatorNote: null,
          priceOptions: [{ label: "Легковой · R20+", price: 2200 }],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R20+",
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 2200,
          appliedPercent: 35,
          resultAmount: 770,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-45",
        accountId: "branch-shorsa-7-account-ip",
        paymentMethod: "card",
        amount: 7480,
        paidAt: "2026-06-25T13:02:00+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "card",
          paymentLabel: "Карта",
          accountId: "branch-shorsa-7-account-ip",
          accountNameSnapshot: "Карта",
          paidAt: "2026-06-25T13:02:00+05:00",
          paidAmount: 7480,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-56",
    branchId: "branch-gotvalda-9",
    number: 56,
    createdAt: "2026-06-26T20:48:04+05:00",
    updatedAt: "2026-06-26T21:02:18+05:00",
    completedAt: "2026-06-26T21:02:18+05:00",
    status: "Оплачен",
    clientId: "anna-sokolova",
    vehicleId: "vehicle-kia-k5",
    shiftId: "shift-gotvalda-11",
    executorEmployeeId: "employee-zagorodnov-mikhail",
    vehicleType: "passenger",
    radius: "R18",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 1491,
    subtotal: 4260,
    discount: 0,
    totalAmount: 4260,
    servicesCount: 1,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "anna-sokolova",
      label: "Анна Соколова",
      details: "+7 900 400-40-04",
      name: "Анна Соколова",
      phone: "+7 900 400-40-04",
      carBrand: "Kia",
      carModel: "K5",
      plateNumber: "Т412РК 196",
      preferredRadius: "R18",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "Kia K5",
      brand: "Kia",
      model: "K5",
      plateNumber: "Т412РК 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-zagorodnov-mikhail",
      executorNameSnapshot: "Алексей Орлов",
    },
    shiftSnapshotJson: {
      shiftId: "shift-gotvalda-11",
      shiftLabelSnapshot: "№11 от 26 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-26T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "cash",
      paymentLabel: "Наличные",
      accountId: "branch-gotvalda-9-account-cash",
      accountNameSnapshot: "Наличные",
      paidAt: "2026-06-26T21:02:18+05:00",
      paidAmount: 4260,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 4260, discount: 0, total: 4260 },
    printSnapshotJson: {
      branchDisplayName: "Северный",
      orderNumber: "56",
      paidAmount: 4260,
    },
    lines: [
      {
        id: "order-56-line-1",
        serviceId: "main-package",
        sortOrder: 10,
        quantity: 1,
        unitPrice: 4260,
        lineTotal: 4260,
        serviceNameSnapshot: "Комплекс шиномонтажа",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 1491,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "package",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R18",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 4120,
          resolvedUnitPrice: 4260,
          displayLabel: "R18",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R18",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 4260,
          appliedPercent: 35,
          resultAmount: 1491,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-56",
        accountId: "branch-gotvalda-9-account-cash",
        paymentMethod: "cash",
        amount: 4260,
        paidAt: "2026-06-26T21:02:18+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "cash",
          paymentLabel: "Наличные",
          accountId: "branch-gotvalda-9-account-cash",
          accountNameSnapshot: "Наличные",
          paidAt: "2026-06-26T21:02:18+05:00",
          paidAmount: 4260,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-57",
    branchId: "branch-gotvalda-9",
    number: 57,
    createdAt: "2026-06-26T11:20:00+05:00",
    updatedAt: "2026-06-26T12:05:00+05:00",
    completedAt: "2026-06-26T12:05:00+05:00",
    status: "Оплачен",
    clientId: "sergey-volkov",
    vehicleId: "vehicle-toyota-camry",
    shiftId: "shift-gotvalda-11",
    executorEmployeeId: "employee-zagorodnov-mikhail",
    vehicleType: "passenger",
    radius: "R18",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 882,
    subtotal: 2520,
    discount: 0,
    totalAmount: 2520,
    servicesCount: 1,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "sergey-volkov",
      label: "Ирина Белова",
      details: "+7 900 500-50-05",
      name: "Ирина Белова",
      phone: "+7 900 500-50-05",
      carBrand: "Toyota",
      carModel: "Camry",
      plateNumber: "С777ОР 196",
      preferredRadius: "R18",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "Toyota Camry",
      brand: "Toyota",
      model: "Camry",
      plateNumber: "С777ОР 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-zagorodnov-mikhail",
      executorNameSnapshot: "Алексей Орлов",
    },
    shiftSnapshotJson: {
      shiftId: "shift-gotvalda-11",
      shiftLabelSnapshot: "№11 от 26 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-26T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "card",
      paymentLabel: "Карта",
      accountId: "branch-gotvalda-9-account-ip",
      accountNameSnapshot: "Карта",
      paidAt: "2026-06-26T12:05:00+05:00",
      paidAmount: 2520,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 2520, discount: 0, total: 2520 },
    printSnapshotJson: {
      branchDisplayName: "Северный",
      orderNumber: "57",
      paidAmount: 2520,
    },
    lines: [
      {
        id: "order-57-line-1",
        serviceId: "balancing",
        sortOrder: 10,
        quantity: 4,
        unitPrice: 630,
        lineTotal: 2520,
        serviceNameSnapshot: "Балансировка колеса",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 882,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "service",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R18",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 630,
          resolvedUnitPrice: 630,
          displayLabel: "R18",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R18",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 2520,
          appliedPercent: 35,
          resultAmount: 882,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-57",
        accountId: "branch-gotvalda-9-account-ip",
        paymentMethod: "card",
        amount: 2520,
        paidAt: "2026-06-26T12:05:00+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "card",
          paymentLabel: "Карта",
          accountId: "branch-gotvalda-9-account-ip",
          accountNameSnapshot: "Карта",
          paidAt: "2026-06-26T12:05:00+05:00",
          paidAmount: 2520,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-58",
    branchId: "branch-gotvalda-9",
    number: 58,
    createdAt: "2026-06-27T10:15:00+05:00",
    updatedAt: "2026-06-27T11:00:00+05:00",
    completedAt: "2026-06-27T11:00:00+05:00",
    status: "Оплачен",
    clientId: "denis-pavlov",
    vehicleId: "vehicle-bmw-3",
    shiftId: "shift-gotvalda-12",
    executorEmployeeId: "employee-zagorodnov-mikhail",
    vehicleType: "passenger",
    radius: "R17",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 1218,
    subtotal: 3480,
    discount: 0,
    totalAmount: 3480,
    servicesCount: 1,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "denis-pavlov",
      label: "Денис Павлов",
      details: "+7 900 100-10-01",
      name: "Денис Павлов",
      phone: "+7 900 100-10-01",
      carBrand: "BMW",
      carModel: "3 серии",
      plateNumber: "О313АА 196",
      preferredRadius: "R17",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "BMW 3 серии",
      brand: "BMW",
      model: "3 серии",
      plateNumber: "О313АА 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-zagorodnov-mikhail",
      executorNameSnapshot: "Алексей Орлов",
    },
    shiftSnapshotJson: {
      shiftId: "shift-gotvalda-12",
      shiftLabelSnapshot: "№12 от 27 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-27T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "cash",
      paymentLabel: "Наличные",
      accountId: "branch-gotvalda-9-account-cash",
      accountNameSnapshot: "Наличные",
      paidAt: "2026-06-27T11:00:00+05:00",
      paidAmount: 3480,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 3480, discount: 0, total: 3480 },
    printSnapshotJson: {
      branchDisplayName: "Северный",
      orderNumber: "58",
      paidAmount: 3480,
    },
    lines: [
      {
        id: "order-58-line-1",
        serviceId: "main-package",
        sortOrder: 10,
        quantity: 1,
        unitPrice: 3480,
        lineTotal: 3480,
        serviceNameSnapshot: "Комплекс шиномонтажа",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 1218,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "package",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R17",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 3480,
          resolvedUnitPrice: 3480,
          displayLabel: "R17",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R17",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 3480,
          appliedPercent: 35,
          resultAmount: 1218,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-58",
        accountId: "branch-gotvalda-9-account-cash",
        paymentMethod: "cash",
        amount: 3480,
        paidAt: "2026-06-27T11:00:00+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "cash",
          paymentLabel: "Наличные",
          accountId: "branch-gotvalda-9-account-cash",
          accountNameSnapshot: "Наличные",
          paidAt: "2026-06-27T11:00:00+05:00",
          paidAmount: 3480,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-59",
    branchId: "branch-gotvalda-9",
    number: 59,
    createdAt: "2026-06-27T17:52:10+05:00",
    updatedAt: "2026-06-27T18:10:42+05:00",
    completedAt: "2026-06-27T18:10:42+05:00",
    status: "Оплачен",
    clientId: "natalya-orlova",
    vehicleId: "vehicle-brabus-v12",
    shiftId: "shift-gotvalda-12",
    executorEmployeeId: "employee-elpanov-maksim",
    vehicleType: "passenger",
    radius: "R20",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 2282,
    subtotal: 6520,
    discount: 0,
    totalAmount: 6520,
    servicesCount: 1,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "natalya-orlova",
      label: "Наталья Орлова",
      details: "+7 900 200-20-02",
      name: "Наталья Орлова",
      phone: "+7 900 200-20-02",
      carBrand: "Brabus",
      carModel: "V12",
      plateNumber: "А001МР 196",
      preferredRadius: "R20",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "Brabus V12",
      brand: "Brabus",
      model: "V12",
      plateNumber: "А001МР 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-elpanov-maksim",
      executorNameSnapshot: ROSTER_EMPLOYEE_ELPANOV_NAME,
    },
    shiftSnapshotJson: {
      shiftId: "shift-gotvalda-12",
      shiftLabelSnapshot: "№12 от 27 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-27T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "card",
      paymentLabel: "Карта",
      accountId: "branch-gotvalda-9-account-ip",
      accountNameSnapshot: "Карта",
      paidAt: "2026-06-27T18:10:42+05:00",
      paidAmount: 6520,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 6520, discount: 0, total: 6520 },
    printSnapshotJson: {
      branchDisplayName: "Северный",
      orderNumber: "59",
      paidAmount: 6520,
    },
    lines: [
      {
        id: "order-59-line-1",
        serviceId: "main-package",
        sortOrder: 10,
        quantity: 1,
        unitPrice: 6520,
        lineTotal: 6520,
        serviceNameSnapshot: "Комплекс шиномонтажа",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 2282,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "package",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R20",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 6520,
          resolvedUnitPrice: 6520,
          displayLabel: "R20",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: true,
          reducedEmployeePercentValue: 35,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R20",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 6520,
          appliedPercent: 35,
          resultAmount: 2282,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-59",
        accountId: "branch-gotvalda-9-account-ip",
        paymentMethod: "card",
        amount: 6520,
        paidAt: "2026-06-27T18:10:42+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "card",
          paymentLabel: "Карта",
          accountId: "branch-gotvalda-9-account-ip",
          accountNameSnapshot: "Карта",
          paidAt: "2026-06-27T18:10:42+05:00",
          paidAmount: 6520,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-60",
    branchId: "branch-gotvalda-9",
    number: 60,
    createdAt: "2026-06-28T10:05:00+05:00",
    updatedAt: "2026-06-28T10:18:00+05:00",
    completedAt: "2026-06-28T10:18:00+05:00",
    status: "Оплачен",
    clientId: "denis-pavlov",
    vehicleId: "vehicle-bmw-3",
    shiftId: "shift-gotvalda-13",
    executorEmployeeId: "employee-nurislamov-ilnar",
    vehicleType: "passenger",
    radius: "R17",
    lowProfile: true,
    runflat: false,
    salaryAccrualTotal: 1330,
    subtotal: 3800,
    discount: 0,
    totalAmount: 3800,
    servicesCount: 1,
    note: "Комплект клиента, без мойки.",
    clientSnapshotJson: {
      mode: "client",
      clientId: "denis-pavlov",
      label: "Денис Павлов",
      details: "+7 900 100-10-01",
      name: "Денис Павлов",
      phone: "+7 900 100-10-01",
      carBrand: "BMW",
      carModel: "3 серии",
      plateNumber: "О313АА 196",
      preferredRadius: "R17",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "BMW 3 серии",
      brand: "BMW",
      model: "3 серии",
      plateNumber: "О313АА 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-nurislamov-ilnar",
      executorNameSnapshot: ROSTER_EMPLOYEE_NURISLAMOV_NAME,
    },
    shiftSnapshotJson: {
      shiftId: "shift-gotvalda-13",
      shiftLabelSnapshot: "№13 от 28 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-28T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "card",
      paymentLabel: "Карта",
      accountId: "branch-gotvalda-9-account-ip",
      accountNameSnapshot: "Карта",
      paidAt: "2026-06-28T10:18:00+05:00",
      paidAmount: 3800,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 3800, discount: 0, total: 3800 },
    printSnapshotJson: {
      branchDisplayName: "Северный",
      orderNumber: "60",
      paidAmount: 3800,
    },
    lines: [
      {
        id: "order-60-line-1",
        serviceId: "main-package",
        sortOrder: 10,
        quantity: 1,
        unitPrice: 3800,
        lineTotal: 3800,
        serviceNameSnapshot: "Комплекс шиномонтажа",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 1330,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "package",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R17",
          lowProfile: true,
          runflat: false,
          appliedModifiers: ["low_profile"],
          baseUnitPrice: 3480,
          resolvedUnitPrice: 3800,
          displayLabel: "R17 · Низкий профиль",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R17",
          lowProfile: true,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 3800,
          appliedPercent: 35,
          resultAmount: 1330,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-60",
        accountId: "branch-gotvalda-9-account-ip",
        paymentMethod: "card",
        amount: 3800,
        paidAt: "2026-06-28T10:18:00+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "card",
          paymentLabel: "Карта",
          accountId: "branch-gotvalda-9-account-ip",
          accountNameSnapshot: "Карта",
          paidAt: "2026-06-28T10:18:00+05:00",
          paidAmount: 3800,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-61",
    branchId: "branch-gotvalda-9",
    number: 61,
    createdAt: "2026-06-28T11:40:00+05:00",
    updatedAt: "2026-06-28T12:15:00+05:00",
    completedAt: "2026-06-28T12:15:00+05:00",
    status: "Оплачен",
    clientId: "boris-zelen",
    vehicleId: "vehicle-lada-largus",
    shiftId: "shift-gotvalda-13",
    executorEmployeeId: "employee-elpanov-maksim",
    vehicleType: "passenger",
    radius: "R15",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 693,
    subtotal: 1980,
    discount: 0,
    totalAmount: 1980,
    servicesCount: 1,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "boris-zelen",
      label: "Павел Морозов",
      details: "+7 900 300-30-03",
      name: "Павел Морозов",
      phone: "+7 900 300-30-03",
      carBrand: "LADA",
      carModel: "Largus",
      plateNumber: "Е220КУ 196",
      preferredRadius: "R15",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "LADA Largus",
      brand: "LADA",
      model: "Largus",
      plateNumber: "Е220КУ 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-elpanov-maksim",
      executorNameSnapshot: ROSTER_EMPLOYEE_ELPANOV_NAME,
    },
    shiftSnapshotJson: {
      shiftId: "shift-gotvalda-13",
      shiftLabelSnapshot: "№13 от 28 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-28T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Оплачен",
      paymentMethod: "cash",
      paymentLabel: "Наличные",
      accountId: "branch-gotvalda-9-account-cash",
      accountNameSnapshot: "Наличные",
      paidAt: "2026-06-28T12:15:00+05:00",
      paidAmount: 1980,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 1980, discount: 0, total: 1980 },
    printSnapshotJson: {
      branchDisplayName: "Северный",
      orderNumber: "61",
      paidAmount: 1980,
    },
    lines: [
      {
        id: "order-61-line-1",
        serviceId: "balancing",
        sortOrder: 10,
        quantity: 4,
        unitPrice: 495,
        lineTotal: 1980,
        serviceNameSnapshot: "Балансировка колеса",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 693,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "service",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R15",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 495,
          resolvedUnitPrice: 495,
          displayLabel: "R15",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R15",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 1980,
          appliedPercent: 35,
          resultAmount: 693,
        },
      },
    ],
    payments: [
      {
        id: "payment-order-61",
        accountId: "branch-gotvalda-9-account-cash",
        paymentMethod: "cash",
        amount: 1980,
        paidAt: "2026-06-28T12:15:00+05:00",
        paymentSnapshotJson: {
          paymentStatus: "Оплачен",
          paymentMethod: "cash",
          paymentLabel: "Наличные",
          accountId: "branch-gotvalda-9-account-cash",
          accountNameSnapshot: "Наличные",
          paidAt: "2026-06-28T12:15:00+05:00",
          paidAmount: 1980,
          note: null,
        },
      },
    ],
  },
  {
    id: "order-62",
    branchId: "branch-gotvalda-9",
    number: 62,
    createdAt: "2026-06-28T13:20:00+05:00",
    updatedAt: "2026-06-28T13:20:00+05:00",
    completedAt: null,
    status: "Ожидает оплаты",
    clientId: "anna-sokolova",
    vehicleId: "vehicle-kia-k5",
    shiftId: "shift-gotvalda-13",
    executorEmployeeId: "employee-zagorodnov-mikhail",
    vehicleType: "passenger",
    radius: "R18",
    lowProfile: false,
    runflat: false,
    salaryAccrualTotal: 1008,
    subtotal: 2880,
    discount: 0,
    totalAmount: 2880,
    servicesCount: 1,
    note: "",
    clientSnapshotJson: {
      mode: "client",
      clientId: "anna-sokolova",
      label: "Анна Соколова",
      details: "+7 900 400-40-04",
      name: "Анна Соколова",
      phone: "+7 900 400-40-04",
      carBrand: "Kia",
      carModel: "K5",
      plateNumber: "Т412РК 196",
      preferredRadius: "R18",
      anonymous: false,
    },
    vehicleSnapshotJson: {
      label: "Kia K5",
      brand: "Kia",
      model: "K5",
      plateNumber: "Т412РК 196",
    },
    executorSnapshotJson: {
      executorEmployeeId: "employee-zagorodnov-mikhail",
      executorNameSnapshot: "Алексей Орлов",
    },
    shiftSnapshotJson: {
      shiftId: "shift-gotvalda-13",
      shiftLabelSnapshot: "№13 от 28 июня 2026",
      shiftOpenedAtSnapshot: "2026-06-28T09:00:00+05:00",
    },
    paymentSnapshotJson: {
      paymentStatus: "Не оплачено",
      paymentMethod: null,
      paymentLabel: null,
      accountId: null,
      accountNameSnapshot: null,
      paidAt: null,
      paidAmount: null,
      note: null,
    },
    totalsSnapshotJson: { servicesCount: 1, subtotal: 2880, discount: 0, total: 2880 },
    printSnapshotJson: {
      branchDisplayName: "Северный",
      orderNumber: "62",
      paidAmount: null,
    },
    lines: [
      {
        id: "order-62-line-1",
        serviceId: "balancing",
        sortOrder: 10,
        quantity: 4,
        unitPrice: 720,
        lineTotal: 2880,
        serviceNameSnapshot: "Балансировка колеса",
        serviceCategorySnapshot: "Основные услуги",
        costPriceSnapshot: 0,
        salaryAccrualAmount: 1008,
        pricingSnapshotJson: {
          source: "services_admin",
          priceType: "matrix",
          pricingMode: "service",
          inputKind: "none",
          selectionMode: "automatic",
          vehicleType: "passenger",
          radius: "R18",
          lowProfile: false,
          runflat: false,
          appliedModifiers: [],
          baseUnitPrice: 720,
          resolvedUnitPrice: 720,
          displayLabel: "R18",
          selectedOptionLabel: null,
          operatorNote: null,
          priceOptions: [],
        },
        salaryRuleSnapshotJson: {
          ruleType: "percent_of_work",
          percent: 35,
          fixedAmount: 0,
          perUnitAmount: 0,
          usesCostPrice: false,
          reducedEmployeePercentEnabled: false,
          reducedEmployeePercentValue: 30,
        },
        lineContextSnapshotJson: {
          vehicleLabel: "Легковой",
          radiusLabel: "R18",
          lowProfile: false,
          runflat: false,
        },
        salaryAccrualSnapshotJson: {
          ruleType: "percent_of_work",
          baseAmount: 2880,
          appliedPercent: 35,
          resultAmount: 1008,
        },
      },
    ],
    payments: [],
  },
];

const bookings = [
  {
    id: "booking-day-1",
    groupId: "booking-day-1",
    branchId: "branch-gotvalda-9",
    clientId: "denis-pavlov",
    vehicleId: "vehicle-bmw-3",
    anonymous: false,
    clientNameSnapshot: "Денис Павлов",
    phoneSnapshot: "+7 900 100-10-01",
    carSnapshot: "BMW 3 серии",
    dateKey: "2026-06-27",
    startTime: "12:30",
    endTime: "13:15",
    postId: "post-2",
    serviceLabel: "Комплекс шиномонтажа",
    comment: "Переобувка комплекта",
    createdByEmployeeId: "employee-admin",
    clientSnapshotJson: { clientId: "denis-pavlov", name: "Денис Павлов", phone: "+7 900 100-10-01" },
    vehicleSnapshotJson: { vehicleId: "vehicle-bmw-3", label: "BMW 3 серии" },
    contactSnapshotJson: { phone: "+7 900 100-10-01" },
  },
  {
    id: "booking-day-2",
    groupId: "booking-day-2",
    branchId: "branch-gotvalda-9",
    clientId: null,
    vehicleId: null,
    anonymous: true,
    clientNameSnapshot: "Запись без клиента",
    phoneSnapshot: "+7 900 000-00-02",
    carSnapshot: "LADA Vesta",
    dateKey: "2026-06-27",
    startTime: "16:00",
    endTime: "16:45",
    postId: "post-1",
    serviceLabel: "Балансировка",
    comment: "Клиент просил подтвердить время за час до приезда.",
    createdByEmployeeId: "employee-admin",
    clientSnapshotJson: null,
    vehicleSnapshotJson: null,
    contactSnapshotJson: { phone: "+7 900 000-00-02" },
  },
  {
    id: "booking-month-1",
    groupId: "booking-month-1",
    branchId: "branch-shorsa-7",
    clientId: "natalya-orlova",
    vehicleId: "vehicle-brabus-v12",
    anonymous: false,
    clientNameSnapshot: "Наталья Орлова",
    phoneSnapshot: "+7 900 200-20-02",
    carSnapshot: "Brabus V12",
    dateKey: "2026-06-30",
    startTime: "11:00",
    endTime: "12:00",
    postId: "post-2",
    serviceLabel: "Датчики давления",
    comment: "",
    createdByEmployeeId: "employee-manager2",
    clientSnapshotJson: { clientId: "natalya-orlova", name: "Наталья Орлова", phone: "+7 900 200-20-02" },
    vehicleSnapshotJson: { vehicleId: "vehicle-brabus-v12", label: "Brabus V12" },
    contactSnapshotJson: { phone: "+7 900 200-20-02" },
  },
];

const storageRecords = [
  {
    id: "storage-1",
    branchId: "branch-gotvalda-9",
    storageNumber: "ХР-001",
    clientId: "denis-pavlov",
    vehicleId: "vehicle-bmw-3",
    clientNameSnapshot: "Денис Павлов",
    clientPhoneSnapshot: "+7 900 100-10-01",
    carBrandSnapshot: "BMW",
    carModelSnapshot: "3 серии",
    plateNumberSnapshot: "О313АА 196",
    itemLabelSnapshot: "Комплект колёс BMW R17",
    status: "На хранении",
    warehouseId: "warehouse-gotvalda-9",
    warehouseName: "Северный",
    shelfLabel: "2",
    cellLabel: "4",
    acceptedAt: "2026-06-27T10:15:00+05:00",
    releasedAt: null,
    note: "До осени 2026",
    clientSnapshotJson: { clientId: "denis-pavlov", name: "Денис Павлов", phone: "+7 900 100-10-01" },
    vehicleSnapshotJson: { vehicleId: "vehicle-bmw-3", label: "BMW 3 серии", plateNumber: "О313АА 196" },
    itemSnapshotJson: { kitLabel: "Комплект колёс BMW R17" },
  },
  {
    id: "storage-2",
    branchId: "branch-gotvalda-9",
    storageNumber: "ХР-002",
    clientId: "boris-zelen",
    vehicleId: "vehicle-lada-largus",
    clientNameSnapshot: "Павел Морозов",
    clientPhoneSnapshot: "+7 900 300-30-03",
    carBrandSnapshot: "LADA",
    carModelSnapshot: "Largus",
    plateNumberSnapshot: "Е220КУ 196",
    itemLabelSnapshot: "Комплект шин Nokian R15",
    status: "Выдано",
    warehouseId: "warehouse-gotvalda-9",
    warehouseName: "Северный",
    shelfLabel: "1",
    cellLabel: "7",
    acceptedAt: "2026-06-17T15:40:00+05:00",
    releasedAt: "2026-06-20T11:05:00+05:00",
    note: "Выдано клиенту 20.06.2026",
    clientSnapshotJson: { clientId: "boris-zelen", name: "Павел Морозов", phone: "+7 900 300-30-03" },
    vehicleSnapshotJson: { vehicleId: "vehicle-lada-largus", label: "LADA Largus", plateNumber: "Е220КУ 196" },
    itemSnapshotJson: { kitLabel: "Комплект шин Nokian R15" },
  },
  {
    id: "storage-3",
    branchId: "branch-shorsa-7",
    storageNumber: "ХР-001",
    clientId: "natalya-orlova",
    vehicleId: "vehicle-brabus-v12",
    clientNameSnapshot: "Наталья Орлова",
    clientPhoneSnapshot: "+7 900 200-20-02",
    carBrandSnapshot: "Brabus",
    carModelSnapshot: "V12",
    plateNumberSnapshot: "А001МР 196",
    itemLabelSnapshot: "Комплект шин Pirelli R20",
    status: "На хранении",
    warehouseId: "warehouse-shorsa-7",
    warehouseName: "Центральный",
    shelfLabel: "1",
    cellLabel: "2",
    acceptedAt: "2026-06-25T16:00:00+05:00",
    releasedAt: null,
    note: "До 01.10.2026",
    clientSnapshotJson: { clientId: "natalya-orlova", name: "Наталья Орлова", phone: "+7 900 200-20-02" },
    vehicleSnapshotJson: { vehicleId: "vehicle-brabus-v12", label: "Brabus V12", plateNumber: "А001МР 196" },
    itemSnapshotJson: { kitLabel: "Комплект шин Pirelli R20" },
  },
];

const operationalAuditEvents = [
  {
    id: "audit-shift-opened-13",
    eventType: "shift.opened",
    actorUserId: "user-admin",
    actorEmployeeId: "employee-admin",
    branchId: "branch-gotvalda-9",
    entityType: "shift",
    entityId: "shift-gotvalda-13",
    payloadJson: {
      actionLabel: "Открыта смена",
      actionDetails: "Смена №13",
      dateTime: "2026-06-28T09:00:00+05:00",
    },
  },
  {
    id: "audit-order-paid-59",
    eventType: "order.payment",
    actorUserId: "user-staff1",
    actorEmployeeId: "employee-staff1",
    branchId: "branch-gotvalda-9",
    entityType: "order",
    entityId: "order-59",
    payloadJson: {
      actionLabel: "Завершён заказ",
      actionDetails: "Заказ №59 · 6 520 ₽ · Карта",
      dateTime: "2026-06-27T18:10:42+05:00",
    },
  },
  {
    id: "audit-shift-closed-12",
    eventType: "shift.closed",
    actorUserId: "user-admin",
    actorEmployeeId: "employee-admin",
    branchId: "branch-gotvalda-9",
    entityType: "shift",
    entityId: "shift-gotvalda-12",
    payloadJson: {
      actionLabel: "Закрыта смена",
      actionDetails: "Смена №12 · выручка 10 000 ₽",
      dateTime: "2026-06-27T21:00:00+05:00",
    },
  },
];

function collectRequiredSeedServiceIds() {
  return Array.from(
    new Set(
      orders.flatMap((order) =>
        order.lines
          .map((line) => line.serviceId)
          .filter((serviceId) => typeof serviceId === "string" && serviceId.length > 0),
      ),
    ),
  );
}

async function resolveMissingSeedOrderServiceIds() {
  const requiredServiceIds = collectRequiredSeedServiceIds();

  if (requiredServiceIds.length === 0) {
    return [];
  }

  const existingServices = await prisma.service.findMany({
    where: { id: { in: requiredServiceIds } },
    select: { id: true },
  });
  const existingServiceIds = new Set(existingServices.map((service) => service.id));

  return requiredServiceIds.filter((serviceId) => !existingServiceIds.has(serviceId));
}

export async function seedDemoData(options = {}) {
  const resetReason = options.reason ?? "seed";
  const resetIntervalMinutes = resolvePositiveMinutesOption(
    options.resetIntervalMinutes,
    "DEMO_RESET_INTERVAL_MINUTES",
    DEFAULT_RESET_INTERVAL_MINUTES,
  );

  for (const branch of branches) {
    await prisma.branch.upsert({
      where: { id: branch.id },
      update: {}, // Never overwrite branch details in prod during seed
      create: branch,
    });
  }

  for (const group of permissionGroups) {
    for (const permission of group.permissions) {
      await prisma.permission.upsert({
        where: { id: permission.id },
        update: {},
        create: {
          id: permission.id,
          groupKey: group.id,
          actionKey: permission.id.split(".")[1] ?? permission.id,
          label: permission.label,
        },
      });
    }
  }

  for (const role of roles) {
    await prisma.role.upsert({
      where: { id: role.id },
      update: {},
      create: { id: role.id, name: role.name, systemKey: role.systemKey, isSystem: true },
    });

    await seedRolePermissions(role);
  }

  await prisma.employee.deleteMany({
    where: { id: { in: ["employee-empty"] } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: ["user-empty"] } },
  });

  for (const employee of employees) {
    if (employee.userId && employee.pin) {
      const pinHash = await argon2.hash(employee.pin);

      await prisma.user.upsert({
        where: { id: employee.userId },
        update: {},
        create: {
          id: employee.userId,
          phone: employee.phone || null,
          login: employee.login,
          pinHash,
          isActive: true,
        },
      });
    }

    await prisma.employee.upsert({
      where: { id: employee.id },
      update: {}, // Preserve production edits to employee profiles
      create: {
        id: employee.id,
        userId: employee.userId ?? null,
        phone: employee.phone,
        firstName: employee.firstName,
        lastName: employee.lastName,
        middleName: employee.middleName,
        roleId: employee.roleId,
        hiredAt: employee.hiredAt ? new Date(employee.hiredAt) : null,
        firedAt: employee.firedAt ? new Date(employee.firedAt) : null,
        lastActivityAt: employee.lastActivityAt ? new Date(employee.lastActivityAt) : null,
        skillLevel: employee.skillLevel,
        workPercent: employee.workPercent,
        shiftMinimum: employee.shiftMinimum,
        addMinimumToWorkPercent: employee.addMinimumToWorkPercent,
        canBeAssignedExecutor: employee.canBeAssignedExecutor,
      },
    });

    await seedEmployeeBranchAccessRows(employee);
  }

  for (const profile of branchProfiles) {
    await prisma.branchProfile.upsert({
      where: { branchId: profile.branchId },
      update: {},
      create: profile,
    });
  }

  for (const settings of branchPrintSettings) {
    await prisma.branchPrintSettings.upsert({
      where: { branchId: settings.branchId },
      update: {},
      create: settings,
    });
  }

  for (const account of paymentAccounts) {
    await prisma.paymentAccount.upsert({
      where: { id: account.id },
      update: {},
      create: account,
    });
  }

  for (const settings of bookingSettings) {
    await prisma.bookingSettings.upsert({
      where: { branchId: settings.branchId },
      update: {},
      create: settings,
    });
  }

  for (const settings of storageSettings) {
    await prisma.storageSettings.upsert({
      where: { branchId: settings.branchId },
      update: {},
      create: settings,
    });
  }

  for (const settings of clientSourceSettings) {
    await prisma.clientSourceSettings.upsert({
      where: { branchId: settings.branchId },
      update: {},
      create: settings,
    });
  }

  if (SHOULD_SEED_DEMO_OPERATIONAL_DATA) {
    for (const client of clients) {
      await prisma.client.upsert({
        where: { id: client.id },
        update: {
          fullName: client.fullName,
          shortName: client.shortName,
          firstName: client.firstName,
          lastName: client.lastName,
          middleName: client.middleName,
          phone: client.phone,
          email: client.email || null,
          source: client.source || null,
          note: client.note || null,
          registeredAt: client.registeredAt ? new Date(client.registeredAt) : null,
        },
        create: {
          id: client.id,
          fullName: client.fullName,
          shortName: client.shortName,
          firstName: client.firstName,
          lastName: client.lastName,
          middleName: client.middleName,
          phone: client.phone,
          email: client.email || null,
          source: client.source || null,
          note: client.note || null,
          registeredAt: client.registeredAt ? new Date(client.registeredAt) : null,
        },
      });
    }

    for (const vehicle of vehicles) {
      await prisma.vehicle.upsert({
        where: { id: vehicle.id },
        update: {
          clientId: vehicle.clientId,
          label: vehicle.label,
          brand: vehicle.brand,
          model: vehicle.model,
          plateNumber: vehicle.plateNumber,
          radius: vehicle.radius,
          totalSpent: vehicle.totalSpent,
        },
        create: {
          id: vehicle.id,
          clientId: vehicle.clientId,
          label: vehicle.label,
          brand: vehicle.brand,
          model: vehicle.model,
          plateNumber: vehicle.plateNumber,
          radius: vehicle.radius,
          totalSpent: vehicle.totalSpent,
        },
      });
    }

    for (const shift of shifts) {
      await prisma.shift.upsert({
        where: { id: shift.id },
        update: {
          branchId: shift.branchId,
          number: shift.number,
          status: shift.status,
          openedAt: new Date(shift.openedAt),
          closedAt: shift.closedAt ? new Date(shift.closedAt) : null,
          openedByEmployeeId: shift.openedByEmployeeId,
          staffLabelSnapshot: shift.staffLabelSnapshot,
          expensesItemsJson: shift.expensesItemsJson,
          ordersCountSnapshot: shift.ordersCountSnapshot,
          revenueTotalSnapshot: shift.revenueTotalSnapshot,
          cashTotalSnapshot: shift.cashTotalSnapshot,
          cashlessTotalSnapshot: shift.cashlessTotalSnapshot,
          expensesTotalSnapshot: shift.expensesTotalSnapshot,
          salaryFundTotalSnapshot: shift.salaryFundTotalSnapshot,
          accountBreakdownSnapshotJson: shift.accountBreakdownSnapshotJson,
        },
        create: {
          id: shift.id,
          branchId: shift.branchId,
          number: shift.number,
          status: shift.status,
          openedAt: new Date(shift.openedAt),
          closedAt: shift.closedAt ? new Date(shift.closedAt) : null,
          openedByEmployeeId: shift.openedByEmployeeId,
          staffLabelSnapshot: shift.staffLabelSnapshot,
          expensesItemsJson: shift.expensesItemsJson,
          ordersCountSnapshot: shift.ordersCountSnapshot,
          revenueTotalSnapshot: shift.revenueTotalSnapshot,
          cashTotalSnapshot: shift.cashTotalSnapshot,
          cashlessTotalSnapshot: shift.cashlessTotalSnapshot,
          expensesTotalSnapshot: shift.expensesTotalSnapshot,
          salaryFundTotalSnapshot: shift.salaryFundTotalSnapshot,
          accountBreakdownSnapshotJson: shift.accountBreakdownSnapshotJson,
        },
      });

      await prisma.shiftStaff.deleteMany({ where: { shiftId: shift.id } });
      await prisma.shiftStaff.createMany({
        data: shift.staff.map((staffMember) => ({
          id: staffMember.id,
          shiftId: shift.id,
          employeeId: staffMember.employeeId,
          employeeNameSnapshot: staffMember.employeeNameSnapshot,
          workPercentSnapshot: staffMember.workPercentSnapshot,
          shiftMinimumSnapshot: staffMember.shiftMinimumSnapshot,
          skillLevelSnapshot: staffMember.skillLevelSnapshot,
        })),
      });
    }

    await ensureMinimalServiceFoundation();
    const missingSeedOrderServiceIds = await resolveMissingSeedOrderServiceIds();
    const shouldSeedDemoOrders = missingSeedOrderServiceIds.length === 0;

    if (!shouldSeedDemoOrders) {
      console.warn(
        `[seed] Skipping demo orders because current service catalog foundation is not available yet. Missing services: ${missingSeedOrderServiceIds.join(
          ", ",
        )}. Open /settings/services or /orders after first start to initialize the catalog, then reseed orders if needed.`,
      );
    } else {
      for (const order of orders) {
        await prisma.order.upsert({
          where: { id: order.id },
          update: {
            branchId: order.branchId,
            number: order.number,
            createdAt: new Date(order.createdAt),
            updatedAt: new Date(order.updatedAt),
            completedAt: order.completedAt ? new Date(order.completedAt) : null,
            status: order.status,
            clientId: order.clientId,
            vehicleId: order.vehicleId,
            shiftId: order.shiftId,
            executorEmployeeId: order.executorEmployeeId,
            vehicleType: order.vehicleType,
            radius: order.radius,
            lowProfile: order.lowProfile,
            runflat: order.runflat,
            salaryAccrualTotal: order.salaryAccrualTotal,
            subtotal: order.subtotal,
            discount: order.discount,
            totalAmount: order.totalAmount,
            servicesCount: order.servicesCount,
            note: order.note,
            clientSnapshotJson: order.clientSnapshotJson,
            vehicleSnapshotJson: order.vehicleSnapshotJson,
            executorSnapshotJson: order.executorSnapshotJson,
            shiftSnapshotJson: order.shiftSnapshotJson,
            paymentSnapshotJson: order.paymentSnapshotJson,
            totalsSnapshotJson: order.totalsSnapshotJson,
            printSnapshotJson: order.printSnapshotJson,
          },
          create: {
            id: order.id,
            branchId: order.branchId,
            number: order.number,
            createdAt: new Date(order.createdAt),
            updatedAt: new Date(order.updatedAt),
            completedAt: order.completedAt ? new Date(order.completedAt) : null,
            status: order.status,
            clientId: order.clientId,
            vehicleId: order.vehicleId,
            shiftId: order.shiftId,
            executorEmployeeId: order.executorEmployeeId,
            vehicleType: order.vehicleType,
            radius: order.radius,
            lowProfile: order.lowProfile,
            runflat: order.runflat,
            salaryAccrualTotal: order.salaryAccrualTotal,
            subtotal: order.subtotal,
            discount: order.discount,
            totalAmount: order.totalAmount,
            servicesCount: order.servicesCount,
            note: order.note,
            clientSnapshotJson: order.clientSnapshotJson,
            vehicleSnapshotJson: order.vehicleSnapshotJson,
            executorSnapshotJson: order.executorSnapshotJson,
            shiftSnapshotJson: order.shiftSnapshotJson,
            paymentSnapshotJson: order.paymentSnapshotJson,
            totalsSnapshotJson: order.totalsSnapshotJson,
            printSnapshotJson: order.printSnapshotJson,
          },
        });

        await prisma.orderLine.deleteMany({ where: { orderId: order.id } });
        if (order.lines.length > 0) {
          await prisma.orderLine.createMany({
            data: order.lines.map((line) => ({
              id: line.id,
              orderId: order.id,
              serviceId: line.serviceId,
              sortOrder: line.sortOrder,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              lineTotal: line.lineTotal,
              serviceNameSnapshot: line.serviceNameSnapshot,
              serviceCategorySnapshot: line.serviceCategorySnapshot,
              costPriceSnapshot: line.costPriceSnapshot,
              salaryAccrualAmount: line.salaryAccrualAmount,
              pricingSnapshotJson: line.pricingSnapshotJson,
              salaryRuleSnapshotJson: line.salaryRuleSnapshotJson,
              lineContextSnapshotJson: line.lineContextSnapshotJson,
              salaryAccrualSnapshotJson: line.salaryAccrualSnapshotJson,
            })),
          });
        }

        await prisma.payment.deleteMany({ where: { orderId: order.id } });
        if (order.payments.length > 0) {
          await prisma.payment.createMany({
            data: order.payments.map((payment) => ({
              id: payment.id,
              orderId: order.id,
              accountId: payment.accountId,
              paymentMethod: payment.paymentMethod,
              amount: payment.amount,
              paidAt: new Date(payment.paidAt),
              paymentSnapshotJson: payment.paymentSnapshotJson,
            })),
          });
        }
      }
    }

    for (const booking of bookings) {
      await prisma.booking.upsert({
        where: { id: booking.id },
        update: {
          groupId: booking.groupId,
          branchId: booking.branchId,
          clientId: booking.clientId,
          vehicleId: booking.vehicleId,
          anonymous: booking.anonymous,
          clientNameSnapshot: booking.clientNameSnapshot,
          phoneSnapshot: booking.phoneSnapshot,
          carSnapshot: booking.carSnapshot,
          dateKey: booking.dateKey,
          startTime: booking.startTime,
          endTime: booking.endTime,
          postId: booking.postId,
          serviceLabel: booking.serviceLabel,
          comment: booking.comment,
          createdByEmployeeId: booking.createdByEmployeeId,
          clientSnapshotJson: booking.clientSnapshotJson,
          vehicleSnapshotJson: booking.vehicleSnapshotJson,
          contactSnapshotJson: booking.contactSnapshotJson,
        },
        create: {
          id: booking.id,
          groupId: booking.groupId,
          branchId: booking.branchId,
          clientId: booking.clientId,
          vehicleId: booking.vehicleId,
          anonymous: booking.anonymous,
          clientNameSnapshot: booking.clientNameSnapshot,
          phoneSnapshot: booking.phoneSnapshot,
          carSnapshot: booking.carSnapshot,
          dateKey: booking.dateKey,
          startTime: booking.startTime,
          endTime: booking.endTime,
          postId: booking.postId,
          serviceLabel: booking.serviceLabel,
          comment: booking.comment,
          createdByEmployeeId: booking.createdByEmployeeId,
          clientSnapshotJson: booking.clientSnapshotJson,
          vehicleSnapshotJson: booking.vehicleSnapshotJson,
          contactSnapshotJson: booking.contactSnapshotJson,
        },
      });
    }

    for (const record of storageRecords) {
      await prisma.storageRecord.upsert({
        where: { id: record.id },
        update: {
          branchId: record.branchId,
          storageNumber: record.storageNumber,
          clientId: record.clientId,
          vehicleId: record.vehicleId,
          clientNameSnapshot: record.clientNameSnapshot,
          clientPhoneSnapshot: record.clientPhoneSnapshot,
          carBrandSnapshot: record.carBrandSnapshot,
          carModelSnapshot: record.carModelSnapshot,
          plateNumberSnapshot: record.plateNumberSnapshot,
          itemLabelSnapshot: record.itemLabelSnapshot,
          status: record.status,
          warehouseId: record.warehouseId,
          warehouseName: record.warehouseName,
          shelfLabel: record.shelfLabel,
          cellLabel: record.cellLabel,
          acceptedAt: new Date(record.acceptedAt),
          releasedAt: record.releasedAt ? new Date(record.releasedAt) : null,
          note: record.note,
          clientSnapshotJson: record.clientSnapshotJson,
          vehicleSnapshotJson: record.vehicleSnapshotJson,
          itemSnapshotJson: record.itemSnapshotJson,
        },
        create: {
          id: record.id,
          branchId: record.branchId,
          storageNumber: record.storageNumber,
          clientId: record.clientId,
          vehicleId: record.vehicleId,
          clientNameSnapshot: record.clientNameSnapshot,
          clientPhoneSnapshot: record.clientPhoneSnapshot,
          carBrandSnapshot: record.carBrandSnapshot,
          carModelSnapshot: record.carModelSnapshot,
          plateNumberSnapshot: record.plateNumberSnapshot,
          itemLabelSnapshot: record.itemLabelSnapshot,
          status: record.status,
          warehouseId: record.warehouseId,
          warehouseName: record.warehouseName,
          shelfLabel: record.shelfLabel,
          cellLabel: record.cellLabel,
          acceptedAt: new Date(record.acceptedAt),
          releasedAt: record.releasedAt ? new Date(record.releasedAt) : null,
          note: record.note,
          clientSnapshotJson: record.clientSnapshotJson,
          vehicleSnapshotJson: record.vehicleSnapshotJson,
          itemSnapshotJson: record.itemSnapshotJson,
        },
      });
    }

    const auditEventsToSeed = shouldSeedDemoOrders
      ? operationalAuditEvents
      : operationalAuditEvents.filter((event) => event.entityType !== "order");

    for (const event of auditEventsToSeed) {
      await prisma.auditEvent.upsert({
        where: { id: event.id },
        update: {
          eventType: event.eventType,
          actorUserId: event.actorUserId,
          actorEmployeeId: event.actorEmployeeId,
          branchId: event.branchId,
          entityType: event.entityType,
          entityId: event.entityId,
          payloadJson: event.payloadJson,
        },
        create: {
          id: event.id,
          eventType: event.eventType,
          actorUserId: event.actorUserId,
          actorEmployeeId: event.actorEmployeeId,
          branchId: event.branchId,
          entityType: event.entityType,
          entityId: event.entityId,
          payloadJson: event.payloadJson,
        },
      });
    }

    await writeDemoResetAuditEvent(resetReason, resetIntervalMinutes);
  }
}

export async function resetDemoData(options = {}) {
  const force = options.force === true;
  const reason = options.reason ?? (force ? "manual" : "quick_access");
  const resetIntervalMinutes = resolvePositiveMinutesOption(
    options.resetIntervalMinutes,
    "DEMO_RESET_INTERVAL_MINUTES",
    DEFAULT_RESET_INTERVAL_MINUTES,
  );
  const activeSessionWindowMinutes = resolvePositiveMinutesOption(
    options.activeSessionWindowMinutes,
    "DEMO_ACTIVE_SESSION_WINDOW_MINUTES",
    DEFAULT_ACTIVE_SESSION_WINDOW_MINUTES,
  );
  const now = new Date();
  const activeSessionSince = new Date(
    now.getTime() - activeSessionWindowMinutes * 60 * 1000,
  );

  const activeSessions = await prisma.session.count({
    where: {
      expiresAt: { gt: now },
      lastSeenAt: { gte: activeSessionSince },
    },
  });

  const lastResetEvent = await prisma.auditEvent.findFirst({
    where: { eventType: DEMO_RESET_EVENT_TYPE, entityType: "demo", entityId: "crm-showcase" },
    orderBy: { createdAt: "desc" },
  });
  const lastResetAt = lastResetEvent?.createdAt?.toISOString() ?? null;

  if (!force && activeSessions > 0) {
    return {
      ok: true,
      resetPerformed: false,
      reason: "active_sessions",
      activeSessions,
      lastResetAt,
    };
  }

  if (!force && lastResetEvent) {
    const cooldownEndsAt =
      lastResetEvent.createdAt.getTime() + resetIntervalMinutes * 60 * 1000;

    if (cooldownEndsAt > now.getTime()) {
      return {
        ok: true,
        resetPerformed: false,
        reason: "cooldown",
        activeSessions,
        lastResetAt,
      };
    }
  }

  await truncateSeedTables();
  await seedDemoData({ reason, resetIntervalMinutes });

  return {
    ok: true,
    resetPerformed: true,
    reason: force ? "forced" : "reset",
    activeSessions,
    lastResetAt: new Date().toISOString(),
  };
}

const cliArgs = new Set(process.argv.slice(2));
const runAsLegacyReset = cliArgs.size === 0;
const runAsSeedOnly = cliArgs.has("--seed-only");
const runAsForceReset =
  cliArgs.has("--demo-reset") ||
  cliArgs.has("--reset") ||
  cliArgs.has("--force-reset");

function resolveCliEntrypoint() {
  if (runAsSeedOnly) {
    return () => seedDemoData({ reason: "seed" });
  }

  if (runAsForceReset) {
    return () =>
      resetDemoData({
        force: true,
        reason: cliArgs.has("--demo-reset") ? "demo:reset" : "force-reset",
      });
  }

  if (runAsLegacyReset) {
    console.warn(
      "[seed] Running without explicit CLI mode keeps legacy force-reset behavior for compatibility. Prefer --seed-only or --force-reset.",
    );

    return () => resetDemoData({ force: true, reason: "seed" });
  }

  return () => seedDemoData({ reason: "seed" });
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  try {
    const entrypoint = resolveCliEntrypoint();
    await entrypoint();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

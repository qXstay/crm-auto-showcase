import { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import type { CartItem } from "@/features/cashier/types";
import type { DemoOrder, DemoOrderClientSnapshot, DemoOrderPaymentSnapshot } from "@/features/orders/types";
import {
  isOrderMarkedForDeletion,
  ORDER_MARKED_FOR_DELETION_STATUS,
} from "@/features/orders/lifecycle";
import { calculateLineAccrualSnapshot, calculateOrderAccrualTotal } from "@/features/orders/salary-shared";
import { calculateOrderTotals } from "@/features/orders/totals";
import { buildStage22PayrollPreview } from "@/features/payroll/stage22-preview";
import {
  defaultPayrollFormulaSettings,
  readStoredPayrollSettings,
} from "@/features/payroll/payroll-formula-settings";
import type { Stage22MatrixRule } from "@/features/payroll/stage22-calculator";
import { resolveStage1EmployeeSkillLevel } from "@/features/settings-employees/skill-level";
import { getOrderByIdForBranch } from "@/server/repositories/order-read-repository";
import type { DemoShiftStaffMember } from "@/features/shifts/types";
import { buildShiftMatrixPayout } from "@/features/shifts/payout-matrix";
import { decimalToNumber } from "@/server/repositories/operational-utils";
import { ensureServiceCatalogFoundation } from "@/server/repositories/service-catalog-repository";
import {
  CLIENT_BRANCH_VEHICLE_VISIBILITY_INCLUDE,
  buildClientBranchScopeWhere,
  getBranchVisibleClientVehicles,
} from "@/server/repositories/client-branch-scope";
import {
  CLIENT_NAME_FALLBACK,
  RUSSIAN_PLATE_REGION_REQUIRED_MESSAGE,
  buildVehicleIdentityLabel,
  duplicateReasonRequiresSamePlateConfirmation,
  formatPlateForDisplay,
  getNormalizedVehicleIdentity,
  getSamePlateVehicleDuplicateReason,
  getClientDisplayName,
  isRussianPlateBodyWithoutRegion,
  normalizePhone,
  normalizePlate,
  parseClientFullName,
  type SamePlateVehicleDuplicateReason,
} from "@/features/clients/client-contract";

function toDecimal(value: number | null | undefined) {
  return value === null || value === undefined ? null : new Prisma.Decimal(value);
}

function toJsonValue(value: Prisma.InputJsonValue | null | undefined) {
  return value === null || value === undefined ? Prisma.JsonNull : value;
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type JsonRecord = Record<string, unknown>;

type Stage22PayrollFormulaSettingsSnapshot = {
  fourPlusFundPercent: number | null;
  fourPlusWeights: {
    level_1: number;
    level_2: number;
    level_3: number;
  };
  matrixRules: Stage22MatrixRule[];
};

const STAGE22_D9A_CALCULATION_SOURCE = "stage2.2-d9a-payout-materialization";
const PAYROLL_EXECUTOR_REQUIRED_MESSAGE =
  "Выберите исполнителя, чтобы программа рассчитала зарплату по заказу.";
const IS_SQLITE_ORDER_PAYMENT_RUNTIME =
  process.env.CRM_AUTO_PRISMA_CLIENT === "sqlite" ||
  (process.env.SQLITE_DATABASE_URL ?? "").trim().length > 0;

async function createOrderPayrollPayoutRows(
  tx: Prisma.TransactionClient,
  payoutRows: Prisma.OrderPayrollPayoutCreateManyInput[],
) {
  if (payoutRows.length === 0) {
    return;
  }

  if (IS_SQLITE_ORDER_PAYMENT_RUNTIME) {
    await tx.orderPayrollPayout.createMany({
      data: payoutRows,
    });
    return;
  }

  await tx.orderPayrollPayout.createMany({
    data: payoutRows,
    skipDuplicates: true,
  });
}

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonRecord(value: unknown): JsonRecord | null {
  if (isJsonRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isJsonRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasPayrollRelevantOrderLines(
  lines: Array<Pick<CartItem, "salaryRuleSnapshot" | "salaryAccrualSnapshot">>,
) {
  return lines.some(
    (line) => line.salaryRuleSnapshot !== null || line.salaryAccrualSnapshot !== null,
  );
}

function hasPayrollRelevantPersistedOrderLines(
  lines: Array<{
    salaryRuleSnapshotJson: Prisma.JsonValue | null;
    salaryAccrualSnapshotJson: Prisma.JsonValue | null;
  }>,
) {
  return lines.some(
    (line) =>
      readJsonRecord(line.salaryRuleSnapshotJson) !== null ||
      readJsonRecord(line.salaryAccrualSnapshotJson) !== null,
  );
}

function parseStage22PayrollFormulaSettings(
  value: unknown,
): Stage22PayrollFormulaSettingsSnapshot | null {
  const settings = readStoredPayrollSettings(value);

  if (!settings) {
    return null;
  }

  return {
    fourPlusFundPercent: settings.fourPlusFundPercent,
    fourPlusWeights: settings.fourPlusWeights,
    matrixRules: settings.matrixRules,
  };
}

async function readStage22PayrollFormulaSettings(
  tx: Prisma.TransactionClient,
): Promise<Stage22PayrollFormulaSettingsSnapshot | null> {
  const rows = await tx.payrollFormulaSettings.findMany({
    select: { fourPlusLevelWeightsJson: true },
    orderBy: { id: "asc" },
    take: 2,
  });

  if (rows.length > 1) {
    return null;
  }

  if (rows.length === 0) {
    const settings = defaultPayrollFormulaSettings();

    return {
      fourPlusFundPercent: settings.fourPlusFundPercent,
      fourPlusWeights: settings.fourPlusWeights,
      matrixRules: settings.matrixRules,
    };
  }

  return parseStage22PayrollFormulaSettings(rows[0].fourPlusLevelWeightsJson) ??
    defaultPayrollFormulaSettings();
}

function enrichStage22MatrixSalaryRuleSnapshot(
  salaryRuleSnapshot: unknown,
  settings: Stage22PayrollFormulaSettingsSnapshot | null,
) {
  if (!settings) {
    return salaryRuleSnapshot;
  }

  const snapshot = readJsonRecord(salaryRuleSnapshot);

  if (!snapshot) {
    return salaryRuleSnapshot;
  }

  const marker = snapshot.stage22PayrollRule;

  if (!isJsonRecord(marker) || marker.type !== "matrix") {
    return salaryRuleSnapshot;
  }

  return {
    ...snapshot,
    stage22PayrollRule: {
      ...marker,
      type: "matrix",
      fourPlusFundPercent: settings.fourPlusFundPercent,
      fourPlusWeights: settings.fourPlusWeights,
      matrixRules: settings.matrixRules,
    },
  };
}

export class InvalidOrderServiceCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderServiceCatalogError";
  }
}

export class InvalidOrderPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderPaymentError";
  }
}

export class InvalidOrderClientAccessError extends Error {
  status: number;
  reason?: "duplicate_phone" | SamePlateVehicleDuplicateReason;
  duplicate?: OrderDuplicateSummary;

  constructor(
    message: string,
    options: {
      status?: number;
      reason?: "duplicate_phone" | SamePlateVehicleDuplicateReason;
      duplicate?: OrderDuplicateSummary;
    } = {},
  ) {
    super(message);
    this.name = "InvalidOrderClientAccessError";
    this.status = options.status ?? 400;
    this.reason = options.reason;
    this.duplicate = options.duplicate;
  }
}

export class InvalidOrderExecutorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderExecutorError";
  }
}

function isWriteConflictError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2034"
  );
}

async function runOrderWriteTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => callback(tx),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isWriteConflictError(error) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error("Не удалось завершить запись заказа.");
}

function buildOrderTotals(lines: CartItem[], inputTotals?: DemoOrder["totals"]) {
  return calculateOrderTotals(lines, inputTotals?.discountPercent ?? 0);
}

function isSnapshotNameVehicleDerived(snapshot: DemoOrderClientSnapshot) {
  const nameKey = (snapshot.name || snapshot.label || "")
    .normalize("NFKC")
    .replace(/[\s·\-\[\]]+/g, "")
    .toLocaleUpperCase("ru-RU");
  const plateKey = normalizePlate(snapshot.plateNumber);
  const vehicleKey = buildVehicleIdentityLabel({
    carBrand: snapshot.carBrand,
    carModel: snapshot.carModel,
    plateNumber: snapshot.plateNumber,
  })
    .normalize("NFKC")
    .replace(/[\s·\-\[\]]+/g, "")
    .toLocaleUpperCase("ru-RU");

  return Boolean(
    nameKey &&
      ((vehicleKey && nameKey === vehicleKey) ||
        (plateKey && nameKey.includes(plateKey))),
  );
}

function buildClientNameParts(snapshot: DemoOrderClientSnapshot) {
  const snapshotName = isSnapshotNameVehicleDerived(snapshot)
    ? ""
    : (snapshot.name || snapshot.label || "").trim();
  const baseName = getClientDisplayName({
    clientKind: snapshot.clientKind,
    organizationName: snapshot.organizationName,
    fullName: snapshotName,
    fallback: CLIENT_NAME_FALLBACK,
  });
  const parsedName = parseClientFullName(baseName);
  const firstName = parsedName.firstName || CLIENT_NAME_FALLBACK;
  const lastName = parsedName.lastName;
  const middleName = parsedName.middleName;
  const fullName = parsedName.fullName || firstName;

  return {
    firstName,
    lastName,
    middleName,
    fullName: fullName || firstName,
  };
}

function normalizeOrderClientSnapshot(snapshot: DemoOrderClientSnapshot): DemoOrderClientSnapshot {
  const plateNumber = normalizePlate(snapshot.plateNumber);

  if (isRussianPlateBodyWithoutRegion(plateNumber)) {
    throw new InvalidOrderClientAccessError(RUSSIAN_PLATE_REGION_REQUIRED_MESSAGE);
  }

  const name = isSnapshotNameVehicleDerived(snapshot)
    ? getClientDisplayName({
        clientKind: snapshot.clientKind,
        organizationName: snapshot.organizationName,
        fallback: CLIENT_NAME_FALLBACK,
      })
    : getClientDisplayName({
        clientKind: snapshot.clientKind,
        organizationName: snapshot.organizationName,
        fullName: snapshot.name || snapshot.label,
        fallback: CLIENT_NAME_FALLBACK,
      });

  return {
    ...snapshot,
    name,
    label: name,
    phone: normalizePhone(snapshot.phone),
    carBrand: snapshot.carBrand.trim(),
    carModel: snapshot.carModel.trim(),
    plateNumber,
  };
}

type AccessibleOrderClientWithVehicles = Prisma.ClientGetPayload<{
  include: typeof CLIENT_BRANCH_VEHICLE_VISIBILITY_INCLUDE;
}>;

type OrderDuplicateSummary = {
  kind: "phone" | "plate";
  reason: "duplicate_phone" | SamePlateVehicleDuplicateReason;
  requiresConfirmation: boolean;
  clientId: string;
  clientName: string;
  phone: string;
  vehicleId: string | null;
  vehicleLabel: string;
  plateNumber: string;
  sameClient: boolean;
};

type OrderWriteOptions = {
  allowSamePlateDifferentVehicle?: boolean;
  allowNetworkClientAccess?: boolean;
};

async function listAccessibleOrderClientsWithVehicles(
  tx: Prisma.TransactionClient,
  branchId: string,
  options: OrderWriteOptions = {},
) {
  return tx.client.findMany({
    where: options.allowNetworkClientAccess ? {} : buildClientBranchScopeWhere(branchId),
    include: CLIENT_BRANCH_VEHICLE_VISIBILITY_INCLUDE,
  });
}

function getOrderDuplicateClientName(client: AccessibleOrderClientWithVehicles) {
  return getClientDisplayName({
    firstName: client.firstName,
    lastName: client.lastName,
    middleName: client.middleName,
    fullName: client.fullName,
  });
}

function findOrderPhoneDuplicate(
  clients: AccessibleOrderClientWithVehicles[],
  phone: string,
  excludeClientId?: string | null,
) {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  return (
    clients.find(
      (client) =>
        client.id !== excludeClientId &&
        normalizePhone(client.phone) === normalizedPhone,
    ) ?? null
  );
}

function findOrderPlateDuplicates(
  clients: AccessibleOrderClientWithVehicles[],
  branchId: string | undefined,
  input: {
    brand: string;
    model: string;
    plateNumber: string;
  },
) {
  const normalizedPlate = normalizePlate(input.plateNumber);

  if (!normalizedPlate) {
    return [];
  }

  const duplicates: Array<{
    client: AccessibleOrderClientWithVehicles;
    vehicle: AccessibleOrderClientWithVehicles["vehicles"][number];
    reason: SamePlateVehicleDuplicateReason;
  }> = [];

  for (const client of clients) {
    for (const vehicle of getBranchVisibleClientVehicles(client, branchId)) {
      if (normalizePlate(vehicle.plateNumber) === normalizedPlate) {
        const reason = getSamePlateVehicleDuplicateReason(
          {
            carBrand: input.brand,
            carModel: input.model,
            plateNumber: input.plateNumber,
          },
          {
            carBrand: vehicle.brand,
            carModel: vehicle.model,
            plateNumber: vehicle.plateNumber,
          },
        );

        if (reason) {
          duplicates.push({ client, vehicle, reason });
        }
      }
    }
  }

  return duplicates;
}

function buildOrderPhoneDuplicateMessage(
  client: AccessibleOrderClientWithVehicles,
  phone: string,
) {
  return `Телефон ${normalizePhone(phone)} уже есть у клиента «${getOrderDuplicateClientName(client)}». Выберите существующего клиента вместо создания дубля.`;
}

function buildOrderPlateDuplicateMessage(
  duplicate: {
    client: AccessibleOrderClientWithVehicles;
    vehicle: AccessibleOrderClientWithVehicles["vehicles"][number];
    reason: SamePlateVehicleDuplicateReason;
  },
  targetClientId?: string | null,
) {
  const plateLabel =
    formatPlateForDisplay(duplicate.vehicle.plateNumber) ||
    normalizePlate(duplicate.vehicle.plateNumber);

  if (targetClientId && duplicate.client.id === targetClientId) {
    if (duplicate.reason !== "same_vehicle_identity") {
      return "Такой госномер уже есть у другой машины. Можно выбрать существующий автомобиль или создать отдельный.";
    }

    return `Госномер ${plateLabel} уже есть в этой карточке клиента. Выберите существующий автомобиль, чтобы не создавать дубль.`;
  }

  if (duplicate.reason !== "same_vehicle_identity") {
    return "Такой госномер уже есть у другой машины. Можно выбрать существующий автомобиль или создать отдельный.";
  }

  return `Госномер ${plateLabel} уже есть у клиента «${getOrderDuplicateClientName(duplicate.client)}». Выберите существующего клиента/автомобиль вместо создания дубля.`;
}

function buildOrderPhoneDuplicateSummary(
  client: AccessibleOrderClientWithVehicles,
  phone: string,
): OrderDuplicateSummary {
  return {
    kind: "phone",
    reason: "duplicate_phone",
    requiresConfirmation: false,
    clientId: client.id,
    clientName: getOrderDuplicateClientName(client),
    phone: normalizePhone(phone),
    vehicleId: null,
    vehicleLabel: "",
    plateNumber: "",
    sameClient: false,
  };
}

function buildOrderPlateDuplicateSummary(
  duplicate: {
    client: AccessibleOrderClientWithVehicles;
    vehicle: AccessibleOrderClientWithVehicles["vehicles"][number];
    reason: SamePlateVehicleDuplicateReason;
  },
  targetClientId?: string | null,
): OrderDuplicateSummary {
  return {
    kind: "plate",
    reason: duplicate.reason,
    requiresConfirmation: duplicateReasonRequiresSamePlateConfirmation(duplicate.reason),
    clientId: duplicate.client.id,
    clientName: getOrderDuplicateClientName(duplicate.client),
    phone: normalizePhone(duplicate.client.phone),
    vehicleId: duplicate.vehicle.id,
    vehicleLabel:
      buildVehicleIdentityLabel({
        carBrand: duplicate.vehicle.brand,
        carModel: duplicate.vehicle.model,
        plateNumber: duplicate.vehicle.plateNumber,
      }) || duplicate.vehicle.label,
    plateNumber:
      formatPlateForDisplay(duplicate.vehicle.plateNumber) ||
      normalizePlate(duplicate.vehicle.plateNumber),
    sameClient: Boolean(targetClientId && duplicate.client.id === targetClientId),
  };
}

function selectOrderPlateDuplicate(
  duplicates: Array<{
    client: AccessibleOrderClientWithVehicles;
    vehicle: AccessibleOrderClientWithVehicles["vehicles"][number];
    reason: SamePlateVehicleDuplicateReason;
  }>,
) {
  return (
    duplicates.find((duplicate) => duplicate.reason === "same_vehicle_identity") ??
    duplicates.find(
      (duplicate) => duplicate.reason === "same_plate_vehicle_identity_ambiguous_requires_confirmation",
    ) ??
    duplicates[0] ??
    null
  );
}

function vehicleIdentityMatchesIncludingIncomplete(
  left: {
    brand?: string | null;
    model?: string | null;
    plateNumber?: string | null;
  },
  right: {
    brand?: string | null;
    model?: string | null;
    plateNumber?: string | null;
  },
) {
  const leftIdentity = getNormalizedVehicleIdentity(left);
  const rightIdentity = getNormalizedVehicleIdentity(right);

  return Boolean(
    leftIdentity.plateNumber &&
      leftIdentity.plateNumber === rightIdentity.plateNumber &&
      leftIdentity.brand === rightIdentity.brand &&
      leftIdentity.model === rightIdentity.model,
  );
}

async function ensureClientAndVehicle(
  tx: Prisma.TransactionClient,
  branchId: string,
  snapshot: DemoOrderClientSnapshot,
  radiusFallback: string,
  options: OrderWriteOptions = {},
) {
  if (snapshot.anonymous || snapshot.mode === "anonymous") {
    return {
      clientId: null,
      vehicleId: null,
    };
  }

  const phone = normalizePhone(snapshot.phone);
  const plateNumber = normalizePlate(snapshot.plateNumber);
  const clientVehicleBranchId = options.allowNetworkClientAccess ? undefined : branchId;
  const accessibleClients = await listAccessibleOrderClientsWithVehicles(tx, branchId, options);
  let client = snapshot.clientId
    ? await tx.client.findFirst({
        where: {
          id: snapshot.clientId,
          ...(options.allowNetworkClientAccess ? {} : buildClientBranchScopeWhere(branchId)),
        },
      })
    : null;

  if (!client && snapshot.clientId && snapshot.clientId !== "anonymous") {
    const inaccessibleClient = await tx.client.findUnique({
      where: { id: snapshot.clientId },
      select: { id: true },
    });

    if (inaccessibleClient) {
      throw new InvalidOrderClientAccessError("Клиент недоступен в текущем филиале.");
    }
  }

  if (!client) {
    const phoneDuplicate = findOrderPhoneDuplicate(accessibleClients, phone);

    if (phoneDuplicate) {
      const summary = buildOrderPhoneDuplicateSummary(phoneDuplicate, phone);

      throw new InvalidOrderClientAccessError(
        buildOrderPhoneDuplicateMessage(phoneDuplicate, phone),
        {
          status: 409,
          reason: summary.reason,
          duplicate: summary,
        },
      );
    }

    const plateDuplicate = selectOrderPlateDuplicate(
      findOrderPlateDuplicates(accessibleClients, clientVehicleBranchId, {
        brand: snapshot.carBrand.trim(),
        model: snapshot.carModel.trim(),
        plateNumber,
      }),
    );

    if (plateDuplicate) {
      const summary = buildOrderPlateDuplicateSummary(plateDuplicate);

      if (!summary.requiresConfirmation || !options.allowSamePlateDifferentVehicle) {
        throw new InvalidOrderClientAccessError(
          buildOrderPlateDuplicateMessage(plateDuplicate),
          {
            status: 409,
            reason: summary.reason,
            duplicate: summary,
          },
        );
      }
    }

    const names = buildClientNameParts(snapshot);
    const clientId =
      snapshot.clientId && snapshot.clientId !== "anonymous"
        ? snapshot.clientId
        : `client-${crypto.randomUUID()}`;

    client = await tx.client.create({
      data: {
        id: clientId,
        fullName: names.fullName,
        shortName: names.fullName,
        firstName: names.firstName,
        lastName: names.lastName,
        middleName: names.middleName,
        phone,
        registeredAt: new Date(),
      },
    });
  }

  const hasVehicleData = Boolean(
    snapshot.carBrand.trim() || snapshot.carModel.trim() || snapshot.plateNumber.trim(),
  );

  if (!hasVehicleData) {
    return {
      clientId: client.id,
      vehicleId: null,
    };
  }

  const brand = snapshot.carBrand.trim();
  const model = snapshot.carModel.trim();
  const radius = snapshot.preferredRadius || radiusFallback;
  const label =
    buildVehicleIdentityLabel({
      carBrand: brand,
      carModel: model,
      plateNumber,
    }) || "Не указан";
  const plateDuplicates = findOrderPlateDuplicates(accessibleClients, clientVehicleBranchId, {
    brand,
    model,
    plateNumber,
  });
  const sameClientPlateDuplicate = selectOrderPlateDuplicate(
    plateDuplicates.filter((duplicate) => duplicate.client.id === client.id),
  );
  const crossClientPlateDuplicate = selectOrderPlateDuplicate(
    plateDuplicates.filter((duplicate) => duplicate.client.id !== client.id),
  );
  const accessibleClient = accessibleClients.find((item) => item.id === client.id);
  const existingVehicles = accessibleClient
    ? getBranchVisibleClientVehicles(accessibleClient, clientVehicleBranchId)
    : [];
  const existingVehicle =
    sameClientPlateDuplicate &&
    (sameClientPlateDuplicate.reason === "same_vehicle_identity" ||
      vehicleIdentityMatchesIncludingIncomplete(
        {
          brand,
          model,
          plateNumber,
        },
        {
          brand: sameClientPlateDuplicate.vehicle.brand,
          model: sameClientPlateDuplicate.vehicle.model,
          plateNumber: sameClientPlateDuplicate.vehicle.plateNumber,
        },
      ))
      ? sameClientPlateDuplicate.vehicle
      : plateNumber
        ? null
        : existingVehicles.find(
            (vehicle) =>
              vehicle.brand.trim() === brand &&
              vehicle.model.trim() === model &&
              normalizePlate(vehicle.plateNumber) === plateNumber,
          ) ?? null;

  if (existingVehicle) {
    const updatedVehicle = await tx.vehicle.update({
      where: { id: existingVehicle.id },
      data: {
        label,
        radius,
      },
    });

    return {
      clientId: client.id,
      vehicleId: updatedVehicle.id,
    };
  }

  if (sameClientPlateDuplicate) {
    const summary = buildOrderPlateDuplicateSummary(sameClientPlateDuplicate, client.id);

    if (!summary.requiresConfirmation || !options.allowSamePlateDifferentVehicle) {
      throw new InvalidOrderClientAccessError(
        buildOrderPlateDuplicateMessage(sameClientPlateDuplicate, client.id),
        {
          status: 409,
          reason: summary.reason,
          duplicate: summary,
        },
      );
    }
  }

  if (crossClientPlateDuplicate && crossClientPlateDuplicate.client.id !== client.id) {
    const summary = buildOrderPlateDuplicateSummary(crossClientPlateDuplicate, client.id);

    if (!summary.requiresConfirmation || !options.allowSamePlateDifferentVehicle) {
      throw new InvalidOrderClientAccessError(
        buildOrderPlateDuplicateMessage(crossClientPlateDuplicate, client.id),
        {
          status: 409,
          reason: summary.reason,
          duplicate: summary,
        },
      );
    }
  }

  const vehicle = await tx.vehicle.create({
    data: {
      id: `vehicle-${crypto.randomUUID()}`,
      clientId: client.id,
      label,
      brand,
      model,
      plateNumber,
      radius,
    },
  });

  return {
    clientId: client.id,
    vehicleId: vehicle.id,
  };
}

function buildVehicleSnapshot(order: DemoOrder) {
  if (!order.client.carBrand.trim() && !order.client.carModel.trim() && !order.client.plateNumber.trim()) {
    return null;
  }

  return {
    brand: order.client.carBrand.trim(),
    model: order.client.carModel.trim(),
    plateNumber: normalizePlate(order.client.plateNumber),
    radius: order.client.preferredRadius || order.radius,
  };
}

function normalizeOrderLines(lines: CartItem[]) {
  return lines.map((line) => {
    const salaryAccrualSnapshot =
      line.salaryAccrualSnapshot ??
      calculateLineAccrualSnapshot({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        salaryRuleSnapshot: line.salaryRuleSnapshot,
        costPrice: line.costPrice,
      });

    return {
      ...line,
      salaryAccrualSnapshot,
    };
  });
}

async function resolveOrderLineServiceIds(
  tx: Prisma.TransactionClient,
  lines: CartItem[],
) {
  if (lines.length === 0) {
    return lines;
  }

  const requestedIds = [...new Set(lines.map((line) => line.serviceId.trim()).filter(Boolean))];
  await ensureServiceCatalogFoundation(tx);

  const directServices = await tx.service.findMany({
    where: {
      id: { in: requestedIds },
    },
    select: {
      id: true,
      name: true,
    },
  });
  const existingServiceIds = new Set(directServices.map((service) => service.id));
  const resolvedLines: CartItem[] = [];

  for (const line of lines) {
    const normalizedServiceId = line.serviceId.trim();

    if (normalizedServiceId && existingServiceIds.has(normalizedServiceId)) {
      resolvedLines.push({
        ...line,
        serviceId: normalizedServiceId,
      });
      continue;
    }

    const serviceLabel = (line.serviceNameSnapshot || line.serviceName || "Услуга").trim();
    const serviceByName = serviceLabel
      ? await tx.service.findMany({
          where: {
            name: {
              equals: serviceLabel,
              mode: "insensitive",
            },
          },
          select: {
            id: true,
            name: true,
          },
          take: 2,
        })
      : [];

    if (serviceByName.length !== 1) {
      throw new InvalidOrderServiceCatalogError(
        `Услуга "${serviceLabel}" не найдена в актуальном backend-каталоге услуг. Сохранение заказа остановлено.`,
      );
    }

    const matchedService = serviceByName[0];
    existingServiceIds.add(matchedService.id);

    resolvedLines.push({
      ...line,
      serviceId: matchedService.id,
      serviceName: matchedService.name,
      serviceNameSnapshot: matchedService.name,
    });
  }

  return resolvedLines;
}

function hasPositivePaymentAmount(payment: DemoOrderPaymentSnapshot) {
  return (
    typeof payment.paidAmount === "number" &&
    Number.isFinite(payment.paidAmount) &&
    payment.paidAmount > 0
  );
}

function buildPaymentRecord(payment: DemoOrderPaymentSnapshot, accountId: string | null) {
  if (
    !hasPositivePaymentAmount(payment) ||
    !payment.paymentMethod ||
    !payment.paidAt ||
    payment.paidAmount === null
  ) {
    return null;
  }

  return {
    id: `payment-${crypto.randomUUID()}`,
    accountId,
    paymentMethod: payment.paymentMethod,
    amount: new Prisma.Decimal(payment.paidAmount),
    paidAt: new Date(payment.paidAt),
    paymentSnapshotJson: payment,
  };
}

export async function createStage22PayrollAccrualForPayment(
  tx: Prisma.TransactionClient,
  params: {
    orderId: string;
    paymentId: string;
    shift: {
      id: string;
      staff: Array<{
        employeeId: string | null;
        arrivedAt: Date | null;
        leftAt: Date | null;
      }>;
    } | null;
    totals: {
      subtotal: number;
      discount: number;
      total: number;
    };
    legacyAccrualTotal: number | null;
    paymentAmount: number;
    paidTotalAfterPayment: number;
    alreadyAccruedPaidBase: number;
  },
) {
  const [lines, executors] = await Promise.all([
    tx.orderLine.findMany({
      where: { orderId: params.orderId },
      select: {
        id: true,
        serviceNameSnapshot: true,
        unitPrice: true,
        quantity: true,
        costPriceSnapshot: true,
        salaryRuleSnapshotJson: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
    tx.orderExecutor.findMany({
      where: { orderId: params.orderId },
      select: {
        id: true,
        employeeId: true,
        employeeNameSnapshot: true,
        skillLevelSnapshot: true,
        workPercentSnapshot: true,
        sortOrder: true,
        createdAt: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    }),
  ]);

  const preview = buildStage22PayrollPreview({
    id: params.orderId,
    subtotal: params.totals.subtotal,
    discount: params.totals.discount,
    total: params.totals.total,
    legacyAccrualTotal: params.legacyAccrualTotal,
    alreadyAccruedPaidBase: params.alreadyAccruedPaidBase,
    payments: [{ amount: params.paidTotalAfterPayment }],
    lines: lines.map((line) => ({
      id: line.id,
      label: line.serviceNameSnapshot,
      unitPrice: decimalToNumber(line.unitPrice) ?? 0,
      quantity: decimalToNumber(line.quantity) ?? 0,
      costPriceSnapshot: decimalToNumber(line.costPriceSnapshot),
      salaryRuleSnapshotJson: line.salaryRuleSnapshotJson,
    })),
    executors: executors.map((executor) => ({
      employeeId: executor.employeeId,
      orderExecutorId: executor.id,
      employeeNameSnapshot: executor.employeeNameSnapshot,
      skillLevelSnapshot: executor.skillLevelSnapshot,
      workPercentSnapshot: decimalToNumber(executor.workPercentSnapshot),
    })),
    shiftStaff: params.shift?.staff.map((staffMember) => ({
      employeeId: staffMember.employeeId,
      arrivedAt: staffMember.arrivedAt?.toISOString() ?? null,
      leftAt: staffMember.leftAt?.toISOString() ?? null,
    })),
  });
  const result = preview.result;
  const statusReason = "reason" in result ? result.reason : null;
  const payrollBaseAmount = result.base?.remainingPaidBase ?? 0;
  const salaryFundAmount = result.status === "supported" ? result.totalAmount : null;

  const accrual = await tx.orderPayrollAccrual.create({
    data: {
      id: `order-payroll-accrual-${crypto.randomUUID()}`,
      orderId: params.orderId,
      paymentId: params.paymentId,
      shiftId: params.shift?.id ?? null,
      status: result.status,
      statusReason,
      paymentAmountSnapshot: new Prisma.Decimal(params.paymentAmount),
      payrollBaseAmount: new Prisma.Decimal(payrollBaseAmount),
      salaryFundAmount: toDecimal(salaryFundAmount),
      calculationSnapshotJson: toInputJsonValue({
        source: STAGE22_D9A_CALCULATION_SOURCE,
        orderId: params.orderId,
        paymentId: params.paymentId,
        input: preview.input,
        result,
        comparison: preview.comparison,
        legacyAccrualTotal: preview.legacyAccrualTotal,
      }),
    },
  });

  if (result.status !== "supported" || !params.shift?.id) {
    return;
  }

  const positivePayouts = result.executors.filter((payout) => payout.amountCents > 0);

  if (positivePayouts.length === 0) {
    return;
  }

  const executorsById = new Map(executors.map((executor) => [executor.id, executor]));

  for (const payout of positivePayouts) {
    const orderExecutorId = payout.orderExecutorId?.trim() ?? "";

    if (!orderExecutorId || !executorsById.has(orderExecutorId)) {
      throw new InvalidOrderExecutorError(
        "Нельзя материализовать выплату без сохранённой строки исполнителя заказа.",
      );
    }
  }

  await createOrderPayrollPayoutRows(
    tx,
    positivePayouts.map((payout) => {
      const orderExecutorId = payout.orderExecutorId!.trim();
      const orderExecutor = executorsById.get(orderExecutorId)!;

      return {
        id: `order-payroll-payout-${crypto.randomUUID()}`,
        accrualId: accrual.id,
        orderExecutorId,
        employeeId: payout.employeeId,
        employeeNameSnapshot: payout.name ?? orderExecutor.employeeNameSnapshot,
        skillLevelSnapshot: payout.skillLevel,
        sharePercent: toDecimal(payout.sharePercent),
        weight: toDecimal(payout.weight),
        basisLabel: payout.basisLabel,
        amount: new Prisma.Decimal(payout.amount),
      };
    }),
  );
}

function toMoneyCents(value: number) {
  return Math.round(value * 100);
}

function sumMoney(values: number[]) {
  return Math.round(values.reduce((sum, value) => sum + value, 0) * 100) / 100;
}

export function getRemainingOrderPaymentAmount(totalAmount: number, paidTotal: number) {
  return Math.max(0, (toMoneyCents(totalAmount) - toMoneyCents(paidTotal)) / 100);
}

export function assertPaymentAppendDoesNotOverpay(params: {
  totalAmount: number;
  alreadyPaidAmount: number;
  paymentAmount: number;
}) {
  const remainingAmount = getRemainingOrderPaymentAmount(
    params.totalAmount,
    params.alreadyPaidAmount,
  );

  if (toMoneyCents(params.paymentAmount) > toMoneyCents(remainingAmount)) {
    throw new InvalidOrderPaymentError(
      `Сумма оплаты больше остатка по заказу. Остаток к оплате: ${remainingAmount.toLocaleString("ru-RU")} ₽.`,
    );
  }
}

async function assertOrderHasNoMaterializedPayrollPayouts(
  tx: Prisma.TransactionClient,
  orderId: string,
  message: string,
) {
  const payoutRows = await tx.orderPayrollPayout.count({
    where: {
      accrual: {
        orderId,
      },
    },
  });

  if (payoutRows > 0) {
    throw new InvalidOrderPaymentError(message);
  }
}

function getPaymentMethodLabelForSnapshot(method: DemoOrderPaymentSnapshot["paymentMethod"]) {
  switch (method) {
    case "cash":
      return "Наличные";
    case "card":
      return "Карта";
    case "transfer":
      return "Перевод";
    case "ildar":
      return "Перевод";
    case "bank_account":
      return "Расчётный счёт";
    default:
      return null;
  }
}

function normalizePaymentSnapshotForWrite(
  payment: DemoOrderPaymentSnapshot,
  paymentAccount: { id: string; name: string } | null,
  totalAmount?: number,
): DemoOrderPaymentSnapshot {
  if (!hasPositivePaymentAmount(payment)) {
    return {
      ...payment,
      paymentStatus: "Не оплачено",
      accountId: null,
      accountNameSnapshot: null,
      paidAmount: null,
      paidTotal: null,
      remainingAmount: totalAmount,
    };
  }

  if (!payment.paymentMethod) {
    throw new InvalidOrderPaymentError("Выберите способ оплаты.");
  }

  if (!payment.paidAt) {
    throw new InvalidOrderPaymentError("Не удалось определить дату оплаты.");
  }

  if (
    typeof payment.paidAmount !== "number" ||
    !Number.isFinite(payment.paidAmount) ||
    payment.paidAmount <= 0
  ) {
    throw new InvalidOrderPaymentError("Сумма оплаты должна быть больше нуля.");
  }

  const normalized = {
    ...payment,
    paymentLabel:
      getPaymentMethodLabelForSnapshot(payment.paymentMethod) ?? payment.paymentLabel?.trim() ?? null,
    accountId: paymentAccount?.id ?? null,
    accountNameSnapshot: paymentAccount?.name ?? null,
  };

  if (typeof totalAmount !== "number" || !Number.isFinite(totalAmount)) {
    return normalized;
  }

  const paidAmount = payment.paidAmount;
  const remainingAmount = getRemainingOrderPaymentAmount(totalAmount, paidAmount);

  return {
    ...normalized,
    paymentStatus: toMoneyCents(remainingAmount) === 0 ? "Оплачен" : "Не оплачено",
    paidTotal: paidAmount,
    remainingAmount,
  };
}

function decimalWeight(value: Prisma.Decimal | null | undefined) {
  return decimalToNumber(value) ?? 0;
}

function mapShiftStaffMembers(staff: Array<{
  employeeId: string | null;
  employeeNameSnapshot: string;
  workPercentSnapshot: Prisma.Decimal | null;
  shiftMinimumSnapshot: Prisma.Decimal | null;
  skillLevelSnapshot: string | null;
}>): DemoShiftStaffMember[] {
  return staff.map((member) => ({
    employeeId: member.employeeId,
    employeeNameSnapshot: member.employeeNameSnapshot,
    workPercentSnapshot: decimalWeight(member.workPercentSnapshot),
    shiftMinimumSnapshot: decimalWeight(member.shiftMinimumSnapshot),
    skillLevelSnapshot: resolveStage1EmployeeSkillLevel(
      member.skillLevelSnapshot,
      decimalWeight(member.workPercentSnapshot),
    ),
  }));
}

async function getNextOrderNumber(tx: Prisma.TransactionClient, branchId: string) {
  const lastOrder = await tx.order.findFirst({
    where: { branchId },
    orderBy: { number: "desc" },
    select: { number: true },
  });

  return (lastOrder?.number ?? 0) + 1;
}

function formatExecutorEmployeeNameSnapshot(employee: {
  firstName: string;
  lastName: string;
  phone: string;
}): string {
  const lastName = employee.lastName.trim();
  const firstName = employee.firstName.trim();

  if (lastName && firstName) {
    const lastLetter = lastName.replace(".", "").trim().charAt(0);

    if (lastLetter) {
      return `${firstName} ${lastLetter.toUpperCase()}.`;
    }
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || employee.phone || "Сотрудник";
}

async function writeOrderSnapshot(
  tx: Prisma.TransactionClient,
  branchId: string,
  input: DemoOrder,
  existingOrderId?: string,
  options: OrderWriteOptions = {},
) {
  const normalizedLines = await resolveOrderLineServiceIds(
    tx,
    normalizeOrderLines(input.lines),
  );
  const stage22PayrollSettings = await readStage22PayrollFormulaSettings(tx);
  const totals = buildOrderTotals(normalizedLines, input.totals);
  const salaryAccrualTotal = calculateOrderAccrualTotal(normalizedLines);
  const hasPayment = hasPositivePaymentAmount(input.payment);
  const paidAmount = hasPayment ? input.payment.paidAmount ?? 0 : 0;
  const remainingAfterPayment = getRemainingOrderPaymentAmount(totals.total, paidAmount);
  const isFullyPaidOrder = hasPayment && toMoneyCents(remainingAfterPayment) === 0;
  const isFinishedOrder = hasPayment || input.status === "Выполнен";
  const normalizedInput = {
    ...input,
    client: normalizeOrderClientSnapshot(input.client),
  };
  const clientRef = await ensureClientAndVehicle(
    tx,
    branchId,
    normalizedInput.client,
    normalizedInput.radius,
    options,
  );
  const vehicleSnapshot = buildVehicleSnapshot(normalizedInput);
  const executorEmployeeIdsRaw: unknown = input.executorEmployeeIds;

  if (executorEmployeeIdsRaw !== null && executorEmployeeIdsRaw !== undefined && !Array.isArray(executorEmployeeIdsRaw)) {
    throw new InvalidOrderExecutorError("Некорректный список исполнителей.");
  }

  const rawExecutorEmployeeIds = Array.isArray(input.executorEmployeeIds)
    ? input.executorEmployeeIds
    : [];

  if (rawExecutorEmployeeIds.length > 0) {
    for (const item of rawExecutorEmployeeIds) {
      if (typeof item !== "string" || !item.trim()) {
        throw new InvalidOrderExecutorError("Некорректный идентификатор исполнителя.");
      }
    }
  }

  const deduplicatedExecutorIds = [...new Set(rawExecutorEmployeeIds.map((id) => id.trim()))];
  const useMultiExecutorPath = deduplicatedExecutorIds.length > 0;
  const executorEmployee = !useMultiExecutorPath && input.executorEmployeeId
    ? await tx.employee.findFirst({
        where: {
          id: input.executorEmployeeId,
          firedAt: null,
          canBeAssignedExecutor: true,
          branchAccesses: {
            some: {
              branchId,
              canOperate: true,
            },
          },
        },
        select: { id: true, skillLevel: true, workPercent: true },
      })
    : null;
  const multiExecutorEmployees = useMultiExecutorPath
    ? await tx.employee.findMany({
        where: {
          id: { in: deduplicatedExecutorIds },
          firedAt: null,
          canBeAssignedExecutor: true,
          branchAccesses: {
            some: {
              branchId,
              canOperate: true,
            },
          },
        },
        select: { id: true, firstName: true, lastName: true, phone: true, skillLevel: true, workPercent: true },
      })
    : [];
  const shift = isFinishedOrder && input.shiftId
    ? await tx.shift.findFirst({
        where: {
          id: input.shiftId,
          branchId,
        },
        include: {
          staff: true,
        },
      })
    : null;

  if (!useMultiExecutorPath && input.executorEmployeeId && !executorEmployee) {
    throw new InvalidOrderExecutorError("Исполнитель недоступен в текущем филиале.");
  }

  if (useMultiExecutorPath) {
    const foundMultiIds = new Set(multiExecutorEmployees.map((e) => e.id));

    for (const reqId of deduplicatedExecutorIds) {
      if (!foundMultiIds.has(reqId)) {
        throw new InvalidOrderExecutorError("Исполнитель недоступен в текущем филиале.");
      }
    }

    if (isFinishedOrder && !shift) {
      throw new InvalidOrderExecutorError(
        "Для завершённого заказа с несколькими исполнителями необходимо указать смену.",
      );
    }

    // Executors are per-order rows. A one-off executor may be outside ShiftStaff,
    // but must still be an active branch employee allowed to operate.
  }

  const paymentAccount = hasPayment && input.payment.accountId
    ? await tx.paymentAccount.findFirst({
        where: {
          id: input.payment.accountId,
          branchId,
          isArchived: false,
        },
        select: { id: true, name: true },
      })
    : null;
  const paymentSnapshot = normalizePaymentSnapshotForWrite(input.payment, paymentAccount, totals.total);
  const paymentRecord = buildPaymentRecord(paymentSnapshot, paymentAccount?.id ?? null);

  if (paymentRecord) {
    assertPaymentAppendDoesNotOverpay({
      totalAmount: totals.total,
      alreadyPaidAmount: 0,
      paymentAmount: decimalToNumber(paymentRecord.amount) ?? 0,
    });

    if (
      hasPayrollRelevantOrderLines(normalizedLines) &&
      !useMultiExecutorPath &&
      !executorEmployee
    ) {
      throw new InvalidOrderExecutorError(PAYROLL_EXECUTOR_REQUIRED_MESSAGE);
    }
  }
  const payoutBreakdownSnapshot = isFinishedOrder && shift
    ? (() => {
        if (salaryAccrualTotal === null) {
          return null;
        }

        const matrixPayout = buildShiftMatrixPayout(
          salaryAccrualTotal,
          mapShiftStaffMembers(shift.staff),
        );

        return matrixPayout.status === "supported" ? matrixPayout.members : null;
      })()
    : null;
  const existingOrderMeta = existingOrderId
    ? await tx.order.findFirstOrThrow({
        where: { id: existingOrderId, branchId },
        select: { number: true, completedAt: true },
      })
    : null;
  const completedAt =
    paymentRecord?.paidAt ??
    existingOrderMeta?.completedAt ??
    (input.status === "Выполнен" ? new Date() : null);

  const multiExecutorById = new Map<string, (typeof multiExecutorEmployees)[number]>(
    multiExecutorEmployees.map((e) => [e.id, e]),
  );
  const firstMultiExecutorEmployee =
    useMultiExecutorPath && deduplicatedExecutorIds.length > 0
      ? (multiExecutorById.get(deduplicatedExecutorIds[0]) ?? null)
      : null;
  const firstMultiStaffMember =
    firstMultiExecutorEmployee
      ? (shift?.staff.find((s) => s.employeeId === firstMultiExecutorEmployee.id) ?? null)
      : null;
  const firstMultiExecutorNameSnapshot =
    firstMultiStaffMember?.employeeNameSnapshot ??
    (firstMultiExecutorEmployee
      ? formatExecutorEmployeeNameSnapshot(firstMultiExecutorEmployee)
      : "");

  const commonData = {
    updatedAt: new Date(),
    completedAt,
    status: isFullyPaidOrder ? "Оплачен" : isFinishedOrder ? "Выполнен" : input.status,
    clientId: clientRef.clientId,
    vehicleId: clientRef.vehicleId,
    shiftId: shift?.id ?? null,
    executorEmployeeId: useMultiExecutorPath
      ? (firstMultiExecutorEmployee?.id ?? null)
      : (executorEmployee?.id ?? null),
    vehicleType: input.vehicleType,
    radius: input.radius,
    lowProfile: input.lowProfile,
    runflat: input.runflat,
    salaryAccrualTotal: toDecimal(salaryAccrualTotal),
    subtotal: new Prisma.Decimal(totals.subtotal),
    discount: new Prisma.Decimal(totals.discount),
    totalAmount: new Prisma.Decimal(totals.total),
    servicesCount: totals.servicesCount,
    note: input.note || null,
    clientSnapshotJson: normalizedInput.client,
    vehicleSnapshotJson: toJsonValue(vehicleSnapshot),
    executorSnapshotJson: useMultiExecutorPath
      ? {
          executorEmployeeId: firstMultiExecutorEmployee?.id ?? null,
          executorNameSnapshot: firstMultiExecutorNameSnapshot || null,
        }
      : {
          executorEmployeeId: input.executorEmployeeId,
          executorNameSnapshot: input.executorNameSnapshot,
        },
    shiftSnapshotJson: {
      shiftLabelSnapshot: isFinishedOrder ? input.shiftLabelSnapshot : null,
      shiftOpenedAtSnapshot: isFinishedOrder ? input.shiftOpenedAtSnapshot : null,
    },
    paymentSnapshotJson: paymentSnapshot,
    totalsSnapshotJson: totals,
    payoutBreakdownSnapshotJson: toJsonValue(payoutBreakdownSnapshot),
  } satisfies Omit<Prisma.OrderUncheckedCreateInput, "id" | "branchId" | "number" | "createdAt">;

  const orderId = existingOrderId ?? `order-${crypto.randomUUID()}`;
  const number = existingOrderMeta?.number ?? (await getNextOrderNumber(tx, branchId));

  if (existingOrderId) {
    await assertOrderHasNoMaterializedPayrollPayouts(
      tx,
      orderId,
      "Нельзя изменить заказ: по нему уже материализованы выплаты зарплаты. История оплат и исполнителей должна остаться неизменной.",
    );

    await tx.orderLine.deleteMany({ where: { orderId } });
    await tx.payment.deleteMany({ where: { orderId } });

    await tx.order.update({
      where: { id: orderId },
      data: commonData,
    });
  } else {
    await tx.order.create({
      data: {
        id: orderId,
        branchId,
        number,
        createdAt: input.createdAt ? new Date(input.createdAt) : new Date(),
        ...commonData,
      },
    });
  }

  if (normalizedLines.length > 0) {
    await tx.orderLine.createMany({
      data: normalizedLines.map((line, index) => ({
        id: `order-line-${crypto.randomUUID()}`,
        orderId,
        serviceId: line.serviceId,
        sortOrder: index,
        quantity: new Prisma.Decimal(line.quantity),
        unitPrice: new Prisma.Decimal(line.unitPrice),
        lineTotal: new Prisma.Decimal(line.unitPrice * line.quantity),
        serviceNameSnapshot: line.serviceNameSnapshot,
        serviceCategorySnapshot: null,
        costPriceSnapshot: toDecimal(line.costPrice),
        salaryAccrualAmount: toDecimal(line.salaryAccrualSnapshot?.amount ?? null),
        pricingSnapshotJson: line.pricingSnapshot,
        salaryRuleSnapshotJson: toJsonValue(
          enrichStage22MatrixSalaryRuleSnapshot(
            line.salaryRuleSnapshot,
            stage22PayrollSettings,
          ) as Prisma.InputJsonValue | null,
        ),
        lineContextSnapshotJson: {
          vehicleType: line.vehicleType,
          vehicleLabel: line.vehicleLabel,
          radius: line.radius,
          lowProfile: line.lowProfile,
          runflat: line.runflat,
        },
        salaryAccrualSnapshotJson: toJsonValue(line.salaryAccrualSnapshot),
      })),
    });
  }

  if (paymentRecord) {
    await tx.payment.create({
      data: {
        ...paymentRecord,
        orderId,
      },
    });
  }

  // Build desired executor list — multi-executor path or legacy single-executor path.
  const desiredExecutors: Array<{
    employeeId: string;
    employeeNameSnapshot: string;
    skillLevelSnapshot: string | null;
    workPercentSnapshot: Prisma.Decimal | null;
    sortOrder: number;
  }> = [];

  if (useMultiExecutorPath) {
    for (let i = 0; i < deduplicatedExecutorIds.length; i++) {
      const empId = deduplicatedExecutorIds[i];
      const emp = multiExecutorById.get(empId)!;
      const staffMember = shift?.staff.find((s) => s.employeeId === empId) ?? null;
      const employeeNameSnapshot =
        staffMember?.employeeNameSnapshot ??
        formatExecutorEmployeeNameSnapshot(emp);
      const rawWorkPercent =
        staffMember?.workPercentSnapshot != null
          ? decimalToNumber(staffMember.workPercentSnapshot)
          : decimalToNumber(emp.workPercent);
      const rawSkillLevel = staffMember?.skillLevelSnapshot ?? emp.skillLevel ?? null;
      const skillLevelSnapshot = resolveStage1EmployeeSkillLevel(
        rawSkillLevel,
        rawWorkPercent ?? 0,
      );

      desiredExecutors.push({
        employeeId: empId,
        employeeNameSnapshot,
        skillLevelSnapshot,
        workPercentSnapshot:
          rawWorkPercent != null ? new Prisma.Decimal(rawWorkPercent) : null,
        sortOrder: i,
      });
    }
  } else if (executorEmployee) {
    const staffMember =
      shift?.staff.find((s) => s.employeeId === executorEmployee.id) ?? null;
    const employeeNameSnapshot =
      input.executorNameSnapshot ??
      staffMember?.employeeNameSnapshot ??
      "";
    const rawWorkPercent =
      staffMember?.workPercentSnapshot != null
        ? decimalToNumber(staffMember.workPercentSnapshot)
        : decimalToNumber(executorEmployee.workPercent);
    const rawSkillLevel =
      staffMember?.skillLevelSnapshot ?? executorEmployee.skillLevel ?? null;
    const skillLevelSnapshot = resolveStage1EmployeeSkillLevel(
      rawSkillLevel,
      rawWorkPercent ?? 0,
    );

    desiredExecutors.push({
      employeeId: executorEmployee.id,
      employeeNameSnapshot,
      skillLevelSnapshot,
      workPercentSnapshot:
        rawWorkPercent != null ? new Prisma.Decimal(rawWorkPercent) : null,
      sortOrder: 0,
    });
  }

  // Diff/upsert sync for OrderExecutor rows. This preserves stable OrderExecutor row IDs for
  // unchanged executors across order updates. Once OrderPayrollPayout writes exist,
  // OrderPayrollPayout cascades from OrderExecutor — removing an executor row that already has
  // payouts would destroy those records. Removing an executor after a payout has been written
  // must be handled carefully (likely blocked or separately reconciled at that stage).
  const existingExecutors = await tx.orderExecutor.findMany({
    where: { orderId },
    select: { id: true, employeeId: true, sortOrder: true, createdAt: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });

  const desiredEmployeeIds = new Set(desiredExecutors.map((e) => e.employeeId));

  // Single pass: for each desired employeeId the first row in stable order is the keeper.
  // All other rows (null employeeId, undesired, or duplicate for a desired employeeId) are deleted.
  const existingByEmployeeId = new Map<string, string>();
  const toDeleteIds: string[] = [];

  for (const row of existingExecutors) {
    if (row.employeeId === null || !desiredEmployeeIds.has(row.employeeId)) {
      toDeleteIds.push(row.id);
    } else if (existingByEmployeeId.has(row.employeeId)) {
      toDeleteIds.push(row.id);
    } else {
      existingByEmployeeId.set(row.employeeId, row.id);
    }
  }

  if (toDeleteIds.length > 0) {
    await tx.orderExecutor.deleteMany({ where: { id: { in: toDeleteIds } } });
  }

  for (const desired of desiredExecutors) {
    const existingId = existingByEmployeeId.get(desired.employeeId) ?? null;

    if (existingId) {
      await tx.orderExecutor.update({
        where: { id: existingId },
        data: {
          employeeNameSnapshot: desired.employeeNameSnapshot,
          skillLevelSnapshot: desired.skillLevelSnapshot,
          workPercentSnapshot: desired.workPercentSnapshot,
          sortOrder: desired.sortOrder,
        },
      });
    } else {
      await tx.orderExecutor.create({
        data: {
          id: `order-executor-${crypto.randomUUID()}`,
          orderId,
          employeeId: desired.employeeId,
          employeeNameSnapshot: desired.employeeNameSnapshot,
          skillLevelSnapshot: desired.skillLevelSnapshot,
          workPercentSnapshot: desired.workPercentSnapshot,
          sortOrder: desired.sortOrder,
        },
      });
    }
  }

  if (paymentRecord) {
    await createStage22PayrollAccrualForPayment(tx, {
      orderId,
      paymentId: paymentRecord.id,
      shift: shift
        ? {
            id: shift.id,
            staff: shift.staff.map((staffMember) => ({
              employeeId: staffMember.employeeId,
              arrivedAt: staffMember.arrivedAt,
              leftAt: staffMember.leftAt,
            })),
          }
        : null,
      totals,
      legacyAccrualTotal: salaryAccrualTotal,
      paymentAmount: decimalToNumber(paymentRecord.amount) ?? 0,
      paidTotalAfterPayment: decimalToNumber(paymentRecord.amount) ?? 0,
      alreadyAccruedPaidBase: 0,
    });
  }

  return orderId;
}

export type AppendOrderPaymentInput = {
  payment: DemoOrderPaymentSnapshot;
  shiftId?: string | null;
  shiftLabelSnapshot?: string | null;
  shiftOpenedAtSnapshot?: string | null;
};

export async function appendPaymentForOrderBranch(
  branchId: string,
  orderId: string,
  input: AppendOrderPaymentInput,
) {
  const existingOrder = await prisma.order.findFirst({
    where: {
      id: orderId,
      branchId,
    },
    select: { id: true },
  });

  if (!existingOrder) {
    return null;
  }

  await runOrderWriteTransaction(async (tx) => {
    const order = await tx.order.findFirstOrThrow({
      where: { id: orderId, branchId },
      include: {
        lines: {
          select: {
            salaryRuleSnapshotJson: true,
            salaryAccrualSnapshotJson: true,
          },
        },
        payments: {
          select: { amount: true },
        },
        executors: {
          select: { id: true },
        },
        payrollAccruals: {
          select: { payrollBaseAmount: true },
        },
      },
    });

    if (isOrderMarkedForDeletion(order.status)) {
      throw new InvalidOrderPaymentError("Нельзя добавить оплату к удалённому из списка заказу.");
    }

    if (order.status !== "Выполнен") {
      throw new InvalidOrderPaymentError(
        "Доплату можно добавить только к выполненному заказу, который ещё не оплачен полностью.",
      );
    }

    const totalAmount = decimalToNumber(order.totalAmount) ?? 0;
    const alreadyPaidAmount = sumMoney(
      order.payments.map((payment) => decimalToNumber(payment.amount) ?? 0),
    );
    const alreadyAccruedPaidBase = sumMoney(
      order.payrollAccruals.map((accrual) => decimalToNumber(accrual.payrollBaseAmount) ?? 0),
    );

    const paymentAccount = input.payment.accountId
      ? await tx.paymentAccount.findFirst({
          where: {
            id: input.payment.accountId,
            branchId,
            isArchived: false,
          },
          select: { id: true, name: true },
        })
      : null;
    const normalizedPayment = normalizePaymentSnapshotForWrite(
      {
        ...input.payment,
        paymentStatus: "Оплачен",
      },
      paymentAccount,
      totalAmount,
    );
    const paymentRecord = buildPaymentRecord(normalizedPayment, paymentAccount?.id ?? null);
    const paymentAmount = decimalToNumber(paymentRecord?.amount) ?? 0;

    if (!paymentRecord) {
      throw new InvalidOrderPaymentError("Не удалось подготовить запись оплаты.");
    }

    if (
      hasPayrollRelevantPersistedOrderLines(order.lines) &&
      order.executors.length === 0
    ) {
      throw new InvalidOrderExecutorError(PAYROLL_EXECUTOR_REQUIRED_MESSAGE);
    }

    assertPaymentAppendDoesNotOverpay({
      totalAmount,
      alreadyPaidAmount,
      paymentAmount,
    });

    const paidTotalAfterPayment = sumMoney([alreadyPaidAmount, paymentAmount]);
    const remainingAfterPayment = getRemainingOrderPaymentAmount(totalAmount, paidTotalAfterPayment);
    const isFullyPaid = toMoneyCents(remainingAfterPayment) === 0;
    const paymentSnapshot: DemoOrderPaymentSnapshot = {
      ...normalizedPayment,
      paymentStatus: isFullyPaid ? "Оплачен" : "Не оплачено",
      paidAmount: paidTotalAfterPayment,
      paidTotal: paidTotalAfterPayment,
      remainingAmount: remainingAfterPayment,
    };
    const shiftId = order.shiftId ?? input.shiftId ?? null;
    const shift = shiftId
      ? await tx.shift.findFirst({
          where: {
            id: shiftId,
            branchId,
          },
          include: {
            staff: true,
          },
        })
      : null;

    if (!shift) {
      throw new InvalidOrderPaymentError("Для оплаты выполненного заказа нужна открытая смена.");
    }

    await tx.payment.create({
      data: {
        ...paymentRecord,
        orderId,
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        updatedAt: new Date(),
        completedAt: order.completedAt ?? paymentRecord.paidAt,
        status: isFullyPaid ? "Оплачен" : "Выполнен",
        shiftId: order.shiftId ?? shift.id,
        shiftSnapshotJson:
          order.shiftSnapshotJson ??
          toJsonValue({
            shiftLabelSnapshot: input.shiftLabelSnapshot ?? null,
            shiftOpenedAtSnapshot: input.shiftOpenedAtSnapshot ?? null,
          }),
        paymentSnapshotJson: paymentSnapshot,
      },
    });

    await createStage22PayrollAccrualForPayment(tx, {
      orderId,
      paymentId: paymentRecord.id,
      shift: {
        id: shift.id,
        staff: shift.staff.map((staffMember) => ({
          employeeId: staffMember.employeeId,
          arrivedAt: staffMember.arrivedAt,
          leftAt: staffMember.leftAt,
        })),
      },
      totals: {
        subtotal: decimalToNumber(order.subtotal) ?? totalAmount,
        discount: decimalToNumber(order.discount) ?? 0,
        total: totalAmount,
      },
      legacyAccrualTotal: decimalToNumber(order.salaryAccrualTotal),
      paymentAmount,
      paidTotalAfterPayment,
      alreadyAccruedPaidBase,
    });
  });

  return getOrderByIdForBranch(branchId, orderId);
}

export async function createOrderForBranch(
  branchId: string,
  input: DemoOrder,
  options: OrderWriteOptions = {},
) {
  const orderId = await runOrderWriteTransaction(
    async (tx) => writeOrderSnapshot(tx, branchId, input, undefined, options),
  );

  return getOrderByIdForBranch(branchId, orderId);
}

export async function updateOrderForBranch(
  branchId: string,
  orderId: string,
  input: DemoOrder,
  options: OrderWriteOptions = {},
) {
  const existingOrder = await prisma.order.findFirst({
    where: {
      id: orderId,
      branchId,
    },
    select: { id: true },
  });

  if (!existingOrder) {
    return null;
  }

  await runOrderWriteTransaction(
    async (tx) => writeOrderSnapshot(tx, branchId, input, orderId, options),
  );

  return getOrderByIdForBranch(branchId, orderId);
}

export async function deleteDraftOrderForBranch(branchId: string, orderId: string) {
  return runOrderWriteTransaction(async (tx) => {
    const order = await tx.order.findFirst({
      where: {
        id: orderId,
        branchId,
      },
      select: {
        id: true,
        status: true,
      },
    });

    if (!order || order.status !== "Черновик") {
      return false;
    }

    await assertOrderHasNoMaterializedPayrollPayouts(
      tx,
      order.id,
      "Нельзя удалить черновик: по заказу уже есть материализованные выплаты зарплаты.",
    );

    await tx.order.delete({
      where: { id: order.id },
    });

    return true;
  });
}

export async function deleteOrMarkOrderForBranch(branchId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      branchId,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!order) {
    return null;
  }

  if (order.status === "Черновик") {
    const deleted = await deleteDraftOrderForBranch(branchId, orderId);
    return deleted ? { action: "deleted" as const } : null;
  }

  if (isOrderMarkedForDeletion(order.status)) {
    return { action: "marked" as const };
  }

  await prisma.order.update({
    where: { id: orderId },
    data: {
      status: ORDER_MARKED_FOR_DELETION_STATUS,
      updatedAt: new Date(),
    },
  });

  return { action: "marked" as const };
}

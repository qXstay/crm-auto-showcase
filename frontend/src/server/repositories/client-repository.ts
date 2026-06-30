import { prisma } from "@/server/db/prisma";
import { CLIENT_DETAIL_INCLUDE, mapClientRecord } from "@/server/repositories/client-read-repository";
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
  formatClientFullName,
  formatPlateForDisplay,
  getSamePlateVehicleDuplicateReason,
  getClientDisplayName,
  isRussianPlateBodyWithoutRegion,
  normalizePhone,
  normalizePlate,
  parseClientFullName,
  type SamePlateVehicleDuplicateReason,
} from "@/features/clients/client-contract";

type UpdateClientInput = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  email?: string;
  note?: string;
  source?: string;
};

type CreateClientInput = {
  clientKind?: "individual" | "legal";
  organizationName?: string;
  inn?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  carBrand?: string;
  carModel?: string;
  plateNumber?: string;
  radius?: string;
  allowSamePlateDifferentVehicle?: boolean;
};

type VehicleInput = {
  brand?: string;
  model?: string;
  plateNumber?: string;
  radius?: string;
  allowSamePlateDifferentVehicle?: boolean;
};

type ClientDuplicateReason = "duplicate_phone" | SamePlateVehicleDuplicateReason;

type ClientDuplicateSummary = {
  kind: "phone" | "plate";
  reason: ClientDuplicateReason;
  requiresConfirmation: boolean;
  clientId: string;
  clientName: string;
  phone: string;
  vehicleId: string | null;
  vehicleLabel: string;
  plateNumber: string;
  sameClient: boolean;
};

type ClientAccessOptions = {
  allowNetworkClientAccess?: boolean;
};

export class ClientDuplicateError extends Error {
  status: number;
  reason: ClientDuplicateReason;
  duplicate: ClientDuplicateSummary;

  constructor(message: string, duplicate: ClientDuplicateSummary, status = 409) {
    super(message);
    this.name = "ClientDuplicateError";
    this.status = status;
    this.reason = duplicate.reason;
    this.duplicate = duplicate;
  }
}

export class ClientValidationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "ClientValidationError";
    this.status = status;
  }
}

function normalizePlateForVehicleWrite(value: string | null | undefined) {
  const plateNumber = normalizePlate(value);

  if (isRussianPlateBodyWithoutRegion(plateNumber)) {
    throw new ClientValidationError(RUSSIAN_PLATE_REGION_REQUIRED_MESSAGE);
  }

  return plateNumber;
}

function buildClientAccessWhere(
  branchId: string,
  options: ClientAccessOptions = {},
) {
  return options.allowNetworkClientAccess ? {} : buildClientBranchScopeWhere(branchId);
}

async function listAccessibleClientsWithVehicles(
  branchId: string,
  options: ClientAccessOptions = {},
) {
  return prisma.client.findMany({
    where: buildClientAccessWhere(branchId, options),
    include: CLIENT_BRANCH_VEHICLE_VISIBILITY_INCLUDE,
  });
}

type AccessibleClientWithVehicles = Awaited<
  ReturnType<typeof listAccessibleClientsWithVehicles>
>[number];

function getDuplicateClientName(client: AccessibleClientWithVehicles) {
  return getClientDisplayName({
    firstName: client.firstName,
    lastName: client.lastName,
    middleName: client.middleName,
    fullName: client.fullName,
  });
}

async function findAccessiblePhoneDuplicate(
  branchId: string,
  phone: string,
  options: { excludeClientId?: string | null } & ClientAccessOptions = {},
) {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  const clients = await listAccessibleClientsWithVehicles(branchId, options);

  return (
    clients.find(
      (client) =>
        client.id !== options.excludeClientId &&
        normalizePhone(client.phone) === normalizedPhone,
    ) ?? null
  );
}

async function findAccessiblePlateDuplicates(
  branchId: string,
  input: Pick<VehicleInput, "brand" | "model" | "plateNumber">,
  options: { excludeVehicleId?: string | null } & ClientAccessOptions = {},
) {
  const normalizedPlate = normalizePlate(input.plateNumber);

  if (!normalizedPlate) {
    return [];
  }

  const clients = await listAccessibleClientsWithVehicles(branchId, options);
  const duplicates: Array<{
    client: AccessibleClientWithVehicles;
    vehicle: AccessibleClientWithVehicles["vehicles"][number];
    reason: SamePlateVehicleDuplicateReason;
  }> = [];

  for (const client of clients) {
    for (const vehicle of getBranchVisibleClientVehicles(
      client,
      options.allowNetworkClientAccess ? undefined : branchId,
    )) {
      if (vehicle.id === options.excludeVehicleId) {
        continue;
      }

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

function buildPhoneDuplicateMessage(client: AccessibleClientWithVehicles, phone: string) {
  return `Телефон ${normalizePhone(phone)} уже есть у клиента «${getDuplicateClientName(client)}». Выберите существующего клиента вместо создания дубля.`;
}

function buildVehicleDuplicateSummary(
  duplicate: {
    client: AccessibleClientWithVehicles;
    vehicle: AccessibleClientWithVehicles["vehicles"][number];
    reason: SamePlateVehicleDuplicateReason;
  },
  targetClientId?: string | null,
): ClientDuplicateSummary {
  return {
    kind: "plate",
    reason: duplicate.reason,
    requiresConfirmation: duplicateReasonRequiresSamePlateConfirmation(duplicate.reason),
    clientId: duplicate.client.id,
    clientName: getDuplicateClientName(duplicate.client),
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

function buildPhoneDuplicateSummary(
  client: AccessibleClientWithVehicles,
  phone: string,
): ClientDuplicateSummary {
  return {
    kind: "phone",
    reason: "duplicate_phone",
    requiresConfirmation: false,
    clientId: client.id,
    clientName: getDuplicateClientName(client),
    phone: normalizePhone(phone),
    vehicleId: null,
    vehicleLabel: "",
    plateNumber: "",
    sameClient: false,
  };
}

function buildPlateDuplicateMessage(
  duplicate: {
    client: AccessibleClientWithVehicles;
    vehicle: AccessibleClientWithVehicles["vehicles"][number];
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

  return `Госномер ${plateLabel} уже есть у клиента «${getDuplicateClientName(duplicate.client)}». Выберите существующего клиента/автомобиль вместо создания дубля.`;
}

async function assertNoPhoneDuplicate(
  branchId: string,
  phone: string,
  options: { excludeClientId?: string | null } & ClientAccessOptions = {},
) {
  const duplicate = await findAccessiblePhoneDuplicate(branchId, phone, options);

  if (duplicate) {
    throw new ClientDuplicateError(
      buildPhoneDuplicateMessage(duplicate, phone),
      buildPhoneDuplicateSummary(duplicate, phone),
    );
  }
}

async function assertPlateDuplicatePolicy(
  branchId: string,
  input: Pick<VehicleInput, "brand" | "model" | "plateNumber" | "allowSamePlateDifferentVehicle">,
  options: { targetClientId?: string | null; excludeVehicleId?: string | null } & ClientAccessOptions = {},
) {
  const duplicates = await findAccessiblePlateDuplicates(branchId, input, options);
  const exactDuplicate = duplicates.find(
    (duplicate) => duplicate.reason === "same_vehicle_identity",
  );
  const duplicate =
    exactDuplicate ??
    duplicates.find(
      (item) => item.reason === "same_plate_vehicle_identity_ambiguous_requires_confirmation",
    ) ??
    duplicates[0] ??
    null;

  if (duplicate) {
    const summary = buildVehicleDuplicateSummary(duplicate, options.targetClientId);

    if (summary.requiresConfirmation && input.allowSamePlateDifferentVehicle) {
      return;
    }

    throw new ClientDuplicateError(
      buildPlateDuplicateMessage(duplicate, options.targetClientId),
      summary,
    );
  }
}

export async function createClient(
  branchId: string,
  input: CreateClientInput,
  options: ClientAccessOptions = {},
) {
  const parsedFullName =
    input.fullName !== undefined ? parseClientFullName(input.fullName) : null;
  const firstName = parsedFullName?.firstName ?? input.firstName?.trim() ?? "";
  const lastName = parsedFullName?.lastName ?? input.lastName?.trim() ?? "";
  const middleName = parsedFullName?.middleName ?? input.middleName?.trim() ?? "";
  const organizationName = input.organizationName?.trim() ?? "";
  const brand = input.carBrand?.trim() ?? "";
  const model = input.carModel?.trim() ?? "";
  const plateNumber = normalizePlateForVehicleWrite(input.plateNumber);
  const clientKind = input.clientKind === "legal" ? "legal" : "individual";
  const fullName = getClientDisplayName({
    clientKind,
    organizationName,
    firstName,
    lastName,
    middleName,
    fullName: parsedFullName?.fullName,
    fallback: CLIENT_NAME_FALLBACK,
  });
  const phone = normalizePhone(input.phone);
  const hasVehicleData = Boolean(brand || model || plateNumber);

  if (phone) {
    await assertNoPhoneDuplicate(branchId, phone, options);
  }

  await assertPlateDuplicatePolicy(branchId, {
    brand,
    model,
    plateNumber,
    allowSamePlateDifferentVehicle: input.allowSamePlateDifferentVehicle,
  }, options);

  const client = await prisma.client.create({
    data: {
      id: `client-${crypto.randomUUID()}`,
      fullName,
      shortName: fullName,
      firstName,
      lastName,
      middleName,
      phone,
      registeredAt: new Date(),
      vehicles: hasVehicleData
        ? {
            create: {
              id: `vehicle-${crypto.randomUUID()}`,
              label: buildVehicleIdentityLabel({
                carBrand: brand,
                carModel: model,
                plateNumber,
              }) || "Не указан",
              brand,
              model,
              plateNumber,
              radius: input.radius?.trim() ?? "",
            },
          }
        : undefined,
    },
    include: CLIENT_DETAIL_INCLUDE,
  });

  return mapClientRecord(client, { branchId: options.allowNetworkClientAccess ? undefined : branchId });
}


export async function updateClient(
  branchId: string,
  clientId: string,
  input: UpdateClientInput,
  options: ClientAccessOptions = {},
) {
  const currentClient = await prisma.client.findFirst({
    where: {
      id: clientId,
      ...buildClientAccessWhere(branchId, options),
    },
  });

  if (!currentClient) {
    return null;
  }

  const parsedFullName =
    input.fullName !== undefined ? parseClientFullName(input.fullName) : null;
  const firstName =
    parsedFullName?.firstName ??
    (input.firstName === undefined ? currentClient.firstName : input.firstName.trim());
  const lastName =
    parsedFullName?.lastName ??
    (input.lastName === undefined ? currentClient.lastName : input.lastName.trim());
  const middleName =
    parsedFullName?.middleName ??
    (input.middleName === undefined ? currentClient.middleName : input.middleName.trim());
  const nameWasProvided =
    input.fullName !== undefined ||
    input.firstName !== undefined ||
    input.lastName !== undefined ||
    input.middleName !== undefined;
  const fullName = nameWasProvided
    ? formatClientFullName({
        fullName: parsedFullName?.fullName,
        firstName,
        lastName,
        middleName,
      }) || CLIENT_NAME_FALLBACK
    : currentClient.fullName || CLIENT_NAME_FALLBACK;
  const nextPhone = input.phone === undefined ? undefined : normalizePhone(input.phone);

  if (nextPhone) {
    await assertNoPhoneDuplicate(branchId, nextPhone, {
      excludeClientId: clientId,
      allowNetworkClientAccess: options.allowNetworkClientAccess,
    });
  }

  const client = await prisma.client.update({
    where: { id: clientId },
    data: {
      firstName,
      lastName,
      middleName,
      fullName,
      shortName: fullName,
      phone: nextPhone,
      email: input.email === undefined ? undefined : input.email.trim() || null,
      note: input.note === undefined ? undefined : input.note.trim() || null,
      source: input.source === undefined ? undefined : input.source.trim() || null,
    },
    include: CLIENT_DETAIL_INCLUDE,
  });

  return mapClientRecord(client, { branchId: options.allowNetworkClientAccess ? undefined : branchId });
}

export async function createClientVehicle(
  branchId: string,
  clientId: string,
  input: VehicleInput,
  options: ClientAccessOptions = {},
) {
  const currentClient = await prisma.client.findFirst({
    where: {
      id: clientId,
      ...buildClientAccessWhere(branchId, options),
    },
    include: CLIENT_BRANCH_VEHICLE_VISIBILITY_INCLUDE,
  });

  if (!currentClient) {
    return null;
  }

  const brand = input.brand?.trim() ?? "";
  const model = input.model?.trim() ?? "";
  const plateNumber = normalizePlateForVehicleWrite(input.plateNumber);
  const radius = input.radius?.trim() ?? "";
  const label =
    buildVehicleIdentityLabel({
      carBrand: brand,
      carModel: model,
      plateNumber,
    }) || "Не указан";

  await assertPlateDuplicatePolicy(
    branchId,
    {
      brand,
      model,
      plateNumber,
      allowSamePlateDifferentVehicle: input.allowSamePlateDifferentVehicle,
    },
    {
      targetClientId: clientId,
      allowNetworkClientAccess: options.allowNetworkClientAccess,
    },
  );

  await prisma.vehicle.create({
    data: {
      id: `vehicle-${crypto.randomUUID()}`,
      clientId,
      label,
      brand,
      model,
      plateNumber,
      radius,
    },
  });

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: CLIENT_DETAIL_INCLUDE,
  });

  return client ? mapClientRecord(client, { branchId: options.allowNetworkClientAccess ? undefined : branchId }) : null;
}

export async function updateClientVehicle(
  branchId: string,
  clientId: string,
  vehicleId: string,
  input: VehicleInput,
  options: ClientAccessOptions = {},
) {
  const currentClient = await prisma.client.findFirst({
    where: {
      id: clientId,
      ...buildClientAccessWhere(branchId, options),
    },
    include: CLIENT_BRANCH_VEHICLE_VISIBILITY_INCLUDE,
  });

  if (!currentClient) {
    return null;
  }

  const currentVehicle =
    getBranchVisibleClientVehicles(
      currentClient,
      options.allowNetworkClientAccess ? undefined : branchId,
    ).find(
      (vehicle) => vehicle.id === vehicleId,
    ) ?? null;

  if (!currentVehicle) {
    return null;
  }

  const brand = input.brand === undefined ? currentVehicle.brand : input.brand.trim();
  const model = input.model === undefined ? currentVehicle.model : input.model.trim();
  const plateNumber =
    input.plateNumber === undefined
      ? currentVehicle.plateNumber
      : normalizePlateForVehicleWrite(input.plateNumber);
  const radius = input.radius === undefined ? currentVehicle.radius : input.radius.trim();
  const label =
    buildVehicleIdentityLabel({
      carBrand: brand,
      carModel: model,
      plateNumber,
    }) || "Не указан";

  await assertPlateDuplicatePolicy(
    branchId,
    {
      brand,
      model,
      plateNumber,
      allowSamePlateDifferentVehicle: input.allowSamePlateDifferentVehicle,
    },
    {
      targetClientId: clientId,
      excludeVehicleId: vehicleId,
      allowNetworkClientAccess: options.allowNetworkClientAccess,
    },
  );

  await prisma.vehicle.update({
    where: { id: vehicleId },
    data: {
      label,
      brand,
      model,
      plateNumber,
      radius,
    },
  });

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: CLIENT_DETAIL_INCLUDE,
  });

  return client ? mapClientRecord(client, { branchId: options.allowNetworkClientAccess ? undefined : branchId }) : null;
}

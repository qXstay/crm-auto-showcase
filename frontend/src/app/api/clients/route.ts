import { badRequest, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { listClients, listClientsForBranch } from "@/server/repositories/client-read-repository";
import { ClientDuplicateError, ClientValidationError, createClient } from "@/server/repositories/client-repository";
import { NextRequest } from "next/server";
import { logAuditEvent } from "@/server/services/audit";
import {
  getClientContractState,
  normalizeInn,
  sanitizeClientKind,
  validateInn,
} from "@/features/clients/client-contract";

export async function GET() {
  const auth = await requireApiPermission("client.view");

  if (!auth.ok) {
    return auth.response;
  }

  const allowNetworkClientAccess = await canReadNetworkClients(auth.context);

  return okJson(
    allowNetworkClientAccess
      ? await listClients()
      : await listClientsForBranch(auth.context.currentBranch.id),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission("client.create");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        clientKind?: string;
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
      }
    | null;

  if (!body || typeof body !== "object") {
    return badRequest("Не удалось прочитать данные клиента.");
  }

  const stringFields = [
    "organizationName",
    "inn",
    "fullName",
    "firstName",
    "lastName",
    "middleName",
    "phone",
    "carBrand",
    "carModel",
    "plateNumber",
    "radius",
  ] as const;

  for (const field of stringFields) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      return badRequest("Некорректные данные клиента.");
    }
  }

  if (body.clientKind !== undefined && body.clientKind !== "individual" && body.clientKind !== "legal") {
    return badRequest("Некорректный тип клиента.");
  }

  if (
    body.allowSamePlateDifferentVehicle !== undefined &&
    typeof body.allowSamePlateDifferentVehicle !== "boolean"
  ) {
    return badRequest("Некорректный флаг подтверждения госномера.");
  }

  const normalizedInn = normalizeInn(body.inn);

  if (body.inn && body.inn !== normalizedInn) {
    return badRequest("ИНН должен содержать только цифры.");
  }

  if (!validateInn(normalizedInn)) {
    return badRequest("ИНН должен содержать 10 или 12 цифр.");
  }

  const contract = getClientContractState({
    clientKind: sanitizeClientKind(body.clientKind),
    fullName: body.fullName,
    firstName: body.firstName,
    phone: body.phone,
    carBrand: body.carBrand,
    carModel: body.carModel,
    plateNumber: body.plateNumber,
    organizationName: body.organizationName,
  });

  const canCreateClient =
    contract.clientKind === "legal"
      ? contract.hasOrderMinimumRequiredFields
      : contract.hasCreateClientMinimumRequiredFields;

  if (!canCreateClient) {
    return badRequest(
      contract.clientKind === "legal"
        ? "Для юрлица нужны название организации, марка авто и госномер."
        : "Для клиента нужны ФИО и телефон либо марка авто и госномер.",
    );
  }

  let client;

  try {
    client = await createClient(
      auth.context.currentBranch.id,
      {
        clientKind: contract.clientKind,
        organizationName: body.organizationName,
        inn: normalizedInn,
        fullName: body.fullName,
        firstName: body.firstName,
        lastName: body.lastName,
        middleName: body.middleName,
        phone: body.phone,
        carBrand: body.carBrand,
        carModel: body.carModel,
        plateNumber: body.plateNumber,
        radius: body.radius,
        allowSamePlateDifferentVehicle: body.allowSamePlateDifferentVehicle,
      },
      {
        allowNetworkClientAccess: await canReadNetworkClients(auth.context),
      },
    );
  } catch (error) {
    if (error instanceof ClientValidationError) {
      return badRequest(error.message, error.status);
    }

    if (error instanceof ClientDuplicateError) {
      return badRequest(error.message, error.status, {
        reason: error.reason,
        duplicate: error.duplicate,
      });
    }

    throw error;
  }

  await logAuditEvent({
    eventType: "client.create",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "client",
    entityId: client.id,
    payload: {
      fullName: body.fullName,
      firstName: body.firstName,
      lastName: body.lastName,
      middleName: body.middleName,
      phone: body.phone,
      carBrand: body.carBrand,
      carModel: body.carModel,
      plateNumber: body.plateNumber,
    },
  });

  return okJson({ client });
}

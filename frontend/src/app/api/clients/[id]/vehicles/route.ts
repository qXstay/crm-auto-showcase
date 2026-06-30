import { NextRequest } from "next/server";
import { badRequest, notFound, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { ClientDuplicateError, ClientValidationError, createClientVehicle } from "@/server/repositories/client-repository";
import { logAuditEvent } from "@/server/services/audit";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("client.edit");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | {
        brand?: string;
        model?: string;
        plateNumber?: string;
        radius?: string;
        allowSamePlateDifferentVehicle?: boolean;
      }
    | null;

  if (!body || typeof body !== "object") {
    return badRequest("Не удалось прочитать данные автомобиля.");
  }

  for (const field of ["brand", "model", "plateNumber", "radius"] as const) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      return badRequest("Некорректные данные автомобиля.");
    }
  }

  if (
    body.allowSamePlateDifferentVehicle !== undefined &&
    typeof body.allowSamePlateDifferentVehicle !== "boolean"
  ) {
    return badRequest("Некорректный флаг подтверждения госномера.");
  }

  if (!body.brand?.trim() && !body.model?.trim() && !body.plateNumber?.trim()) {
    return badRequest("Укажите марку, модель или госномер автомобиля.");
  }

  let client;

  try {
    client = await createClientVehicle(auth.context.currentBranch.id, id, body, {
      allowNetworkClientAccess: await canReadNetworkClients(auth.context),
    });
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

  if (!client) {
    return notFound("Клиент не найден.");
  }

  await logAuditEvent({
    eventType: "client.vehicle.create",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "client",
    entityId: id,
    payload: body,
  });

  return okJson({ client });
}

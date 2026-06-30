import { NextRequest } from "next/server";
import { badRequest, notFound, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { getClientById, getClientByIdForBranch } from "@/server/repositories/client-read-repository";
import { ClientDuplicateError, ClientValidationError, updateClient } from "@/server/repositories/client-repository";
import { logAuditEvent } from "@/server/services/audit";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("client.view");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const allowNetworkClientAccess = await canReadNetworkClients(auth.context);
  const client = allowNetworkClientAccess
    ? await getClientById(id)
    : await getClientByIdForBranch(id, auth.context.currentBranch.id);

  if (!client) {
    return notFound("Клиент не найден.");
  }

  return okJson({ client });
}

export async function PATCH(
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
        fullName?: string;
        firstName?: string;
        lastName?: string;
        middleName?: string;
        phone?: string;
        email?: string;
        note?: string;
        source?: string;
      }
    | null;

  if (!body || typeof body !== "object") {
    return badRequest("Не удалось прочитать данные клиента.");
  }

  const stringFields = [
    "fullName",
    "firstName",
    "lastName",
    "middleName",
    "phone",
    "email",
    "note",
    "source",
  ] as const;

  for (const field of stringFields) {
    if (body[field] !== undefined && typeof body[field] !== "string") {
      return badRequest("Некорректные данные клиента.");
    }
  }

  let client;

  try {
    client = await updateClient(auth.context.currentBranch.id, id, body, {
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
    eventType: "client.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "client",
    entityId: id,
    payload: body,
  });

  return okJson({ client });
}

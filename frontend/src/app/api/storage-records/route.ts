import { NextRequest } from "next/server";
import { badRequest, okJson } from "@/server/api/responses";
import { requireApiAuthContext, requireApiPermission } from "@/server/api/guards";
import { hasServerPermission } from "@/server/auth/context";
import { listStorageRecordsForBranch } from "@/server/repositories/storage-read-repository";
import { createStorageRecordForBranch } from "@/server/repositories/storage-write-repository";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { logAuditEvent } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiPermission("storage.view");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await listStorageRecordsForBranch(auth.context.currentBranch.id));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  if (
    !hasServerPermission(auth.context, "storage.edit_all") &&
    !hasServerPermission(auth.context, "storage.edit_own")
  ) {
    return badRequest("Недостаточно прав", 403);
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return badRequest("Некорректное тело запроса.");
  }

  const requiredStringFields = [
    "storageNumber",
    "clientName",
    "clientPhone",
    "kitLabel",
    "warehouseName",
    "shelfLabel",
    "cellLabel",
  ] as const;

  for (const field of requiredStringFields) {
    const value = body[field];

    if (typeof value !== "string" || value.trim().length === 0) {
      return badRequest("Некорректные данные хранения.");
    }
  }

  const item = await createStorageRecordForBranch(auth.context.currentBranch.id, {
    storageNumber: body.storageNumber as string,
    clientId:
      typeof body.clientId === "string" || body.clientId === null
        ? (body.clientId as string | null)
        : null,
    clientName: body.clientName as string,
    clientPhone: body.clientPhone as string,
    carBrand: typeof body.carBrand === "string" ? body.carBrand : "",
    carModel: typeof body.carModel === "string" ? body.carModel : "",
    plateNumber: typeof body.plateNumber === "string" ? body.plateNumber : "",
    kitLabel: body.kitLabel as string,
    warehouseId:
      typeof body.warehouseId === "string" || body.warehouseId === null
        ? (body.warehouseId as string | null)
        : null,
    warehouseName: body.warehouseName as string,
    shelfLabel: body.shelfLabel as string,
    cellLabel: body.cellLabel as string,
    note: typeof body.note === "string" ? body.note : "",
  }, {
    allowNetworkClientAccess: await canReadNetworkClients(auth.context),
  });

  await logAuditEvent({
    eventType: "storage.accept",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "storage_record",
    entityId: item.id,
    payload: body,
  });

  return okJson({ item });
}

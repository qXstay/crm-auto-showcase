import { NextRequest } from "next/server";
import { requireApiAuthContext } from "@/server/api/guards";
import { badRequest, notFound, okJson } from "@/server/api/responses";
import { hasServerPermission } from "@/server/auth/context";
import { updateStorageRecordForBranch } from "@/server/repositories/storage-write-repository";
import { logAuditEvent } from "@/server/services/audit";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return badRequest("Некорректное тело запроса.");
  }

  const item = await updateStorageRecordForBranch(auth.context.currentBranch.id, id, {
    note: typeof body.note === "string" ? body.note : undefined,
    warehouseId:
      typeof body.warehouseId === "string" || body.warehouseId === null
        ? (body.warehouseId as string | null)
        : undefined,
    warehouseName: typeof body.warehouseName === "string" ? body.warehouseName : undefined,
    shelfLabel: typeof body.shelfLabel === "string" ? body.shelfLabel : undefined,
    cellLabel: typeof body.cellLabel === "string" ? body.cellLabel : undefined,
    release: body.release === true,
  });

  if (!item) {
    return notFound("Позиция хранения не найдена.");
  }

  await logAuditEvent({
    eventType: body.release === true ? "storage.release" : "storage.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "storage_record",
    entityId: id,
    payload: body,
  });

  return okJson({ item });
}

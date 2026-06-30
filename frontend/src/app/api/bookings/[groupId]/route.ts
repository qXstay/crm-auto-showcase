import { badRequest, notFound, okJson } from "@/server/api/responses";
import { requireApiAuthContext } from "@/server/api/guards";
import { hasServerPermission } from "@/server/auth/context";
import {
  deleteBookingGroupForBranch,
  listBookingGroupCreatorsForBranch,
} from "@/server/repositories/booking-write-repository";
import { logAuditEvent } from "@/server/services/audit";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ groupId: string }> },
) {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  const canDeleteAll = hasServerPermission(auth.context, "booking.delete_all");
  const canDeleteOwn = hasServerPermission(auth.context, "booking.delete_own");

  if (!canDeleteAll && !canDeleteOwn) {
    return badRequest("Недостаточно прав", 403);
  }

  const { groupId } = await context.params;
  const records = await listBookingGroupCreatorsForBranch(auth.context.currentBranch.id, groupId);

  if (records.length === 0) {
    return notFound("Запись не найдена.");
  }

  if (
    !canDeleteAll &&
    !records.every((record) => record.createdByEmployeeId === auth.context.employee.id)
  ) {
    return badRequest("Недостаточно прав", 403);
  }

  const deleted = await deleteBookingGroupForBranch(auth.context.currentBranch.id, groupId);

  if (!deleted) {
    return notFound("Запись не найдена.");
  }

  await logAuditEvent({
    eventType: "booking.delete",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "booking",
    entityId: groupId,
    payload: deleted,
  });

  return okJson(deleted);
}

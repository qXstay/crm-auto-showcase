import { NextRequest } from "next/server";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import { updateAccountForBranch } from "@/server/repositories/branch-settings-repository";
import { logAuditEvent } from "@/server/services/audit";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("settings.accounts");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { name?: string; isArchived?: boolean }
    | null;

  if (!body) {
    return badRequest("Некорректное тело запроса.");
  }

  const account = await updateAccountForBranch(auth.context.currentBranch.id, id, {
    name: typeof body.name === "string" ? body.name : undefined,
    isArchived: typeof body.isArchived === "boolean" ? body.isArchived : undefined,
  });

  await logAuditEvent({
    eventType: "settings.account.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "payment_account",
    entityId: id,
    payload: body,
  });

  return okJson({ account });
}

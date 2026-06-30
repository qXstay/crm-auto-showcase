import { NextRequest } from "next/server";
import {
  getStorageSettingsForBranch,
  updateStorageSettingsForBranch,
} from "@/server/repositories/branch-settings-repository";
import { requireApiAuthContext, requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import { logAuditEvent } from "@/server/services/audit";
import { hasServerPermission } from "@/server/auth/context";

export async function GET() {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  if (
    !hasServerPermission(auth.context, "settings.storage") &&
    !hasServerPermission(auth.context, "storage.view")
  ) {
    return badRequest("Недостаточно прав", 403);
  }

  return okJson({
    settings: await getStorageSettingsForBranch(auth.context.currentBranch.id),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiPermission("settings.storage");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | { warehouses?: Array<Record<string, unknown>> }
    | null;

  if (!body || !Array.isArray(body.warehouses)) {
    return badRequest("Некорректные настройки хранения.");
  }

  const settings = await updateStorageSettingsForBranch(auth.context.currentBranch.id, {
    warehouses: body.warehouses as never[],
  });

  await logAuditEvent({
    eventType: "settings.storage.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "storage_settings",
    entityId: auth.context.currentBranch.id,
    payload: settings,
  });

  return okJson({ settings });
}

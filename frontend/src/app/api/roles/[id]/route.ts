import { NextRequest } from "next/server";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import {
  RoleMutationDomainError,
  deleteRole,
  updateRole,
} from "@/server/repositories/role-repository";
import { logAuditEvent } from "@/server/services/audit";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("settings.roles");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { name?: string; permissionIds?: string[] }
    | null;

  if (!body?.name?.trim() || !Array.isArray(body.permissionIds) || body.permissionIds.length === 0) {
    return badRequest("Название и хотя бы одно право обязательны.");
  }

  let role;

  try {
    role = await updateRole(
      id,
      {
        name: body.name.trim(),
        permissionIds: body.permissionIds,
      },
      { actorRoleId: auth.context.employee.role },
    );
  } catch (error) {
    if (error instanceof RoleMutationDomainError) {
      return badRequest(error.message, error.status);
    }

    throw error;
  }

  await logAuditEvent({
    eventType: "settings.role.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "role",
    entityId: id,
    payload: body,
  });

  return okJson({ role });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("settings.roles");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    await deleteRole(id, { actorRoleId: auth.context.employee.role });
  } catch (error) {
    if (error instanceof RoleMutationDomainError) {
      return badRequest(error.message, error.status);
    }

    throw error;
  }

  await logAuditEvent({
    eventType: "settings.role.delete",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "role",
    entityId: id,
    payload: {},
  });

  return okJson({ ok: true });
}

import { NextRequest } from "next/server";
import {
  EmployeeDeleteDomainError,
  EmployeeUpdateDomainError,
  deleteEmployeeIfSafe,
  getEmployeeById,
  updateEmployee,
} from "@/server/repositories/employee-repository";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, notFound, okJson } from "@/server/api/responses";
import { logAuditEvent } from "@/server/services/audit";
import { isEmployeeSkillLevel } from "@/features/settings-employees/skill-level";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("settings.employees");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const employee = await getEmployeeById(id, { currentEmployeeId: auth.context.employee.id });

  if (!employee) {
    return notFound("Сотрудник не найден.");
  }

  return okJson({ employee });
}

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("settings.employees");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    await deleteEmployeeIfSafe(id, { currentEmployeeId: auth.context.employee.id });
  } catch (error) {
    if (error instanceof EmployeeDeleteDomainError) {
      return badRequest(error.message, error.status);
    }

    throw error;
  }

  await logAuditEvent({
    eventType: "settings.employee.delete",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "employee",
    entityId: id,
    payload: { hardDelete: true },
  });

  return okJson({ deleted: true as const });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("settings.employees");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;

  if (!body) {
    return badRequest("Некорректное тело запроса.");
  }

  let employee;

  try {
    employee = await updateEmployee(id, {
      phone: typeof body.phone === "string" ? body.phone : undefined,
      pin: typeof body.pin === "string" ? body.pin : undefined,
      lastName: typeof body.lastName === "string" ? body.lastName : undefined,
      firstName: typeof body.firstName === "string" ? body.firstName : undefined,
      middleName: typeof body.middleName === "string" ? body.middleName : undefined,
      role: typeof body.role === "string" ? body.role : undefined,
      firedAt:
        typeof body.firedAt === "string" || body.firedAt === null
          ? (body.firedAt as string | null)
          : undefined,
      workPercent:
        typeof body.workPercent === "number" ? body.workPercent : undefined,
      shiftMinimum:
        typeof body.shiftMinimum === "number" ? body.shiftMinimum : undefined,
      skillLevel:
        body.skillLevel === null
          ? null
          : isEmployeeSkillLevel(body.skillLevel)
            ? body.skillLevel
            : undefined,
      addMinimumToWorkPercent:
        typeof body.addMinimumToWorkPercent === "boolean"
          ? body.addMinimumToWorkPercent
          : undefined,
      canBeAssignedExecutor:
        typeof body.canBeAssignedExecutor === "boolean"
          ? body.canBeAssignedExecutor
          : undefined,
      branchAccesses: Array.isArray(body.branchAccesses)
        ? body.branchAccesses.map((access) => {
            const branchAccess = access as {
              branchId?: unknown;
              isDefault?: unknown;
              canSwitchInto?: unknown;
            };

            return {
              branchId: String(branchAccess.branchId),
              isDefault: Boolean(branchAccess.isDefault),
              canSwitchInto: Boolean(branchAccess.canSwitchInto),
            };
          })
        : undefined,
    });
  } catch (error) {
    if (error instanceof EmployeeUpdateDomainError) {
      return badRequest(error.message, error.status);
    }

    throw error;
  }

  await logAuditEvent({
    eventType: "settings.employee.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "employee",
    entityId: id,
    payload: body,
  });

  return okJson({ employee });
}

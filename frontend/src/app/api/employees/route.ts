import { NextRequest } from "next/server";
import {
  EmployeeCreateDomainError,
  createEmployee,
  listEmployees,
} from "@/server/repositories/employee-repository";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";

export async function GET() {
  const auth = await requireApiPermission("settings.employees");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await listEmployees({ currentEmployeeId: auth.context.employee.id }));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission("settings.employees");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        phone?: string;
        pin?: string;
        roleId?: string;
        fullName?: string;
        skillLevel?: string;
        workPercent?: number;
        shiftMinimum?: number;
        addMinimumToWorkPercent?: boolean;
        canBeAssignedExecutor?: boolean;
      }
    | null;

  if (!body?.phone?.trim() || !body?.pin?.trim() || !body?.roleId?.trim() || !body?.fullName?.trim()) {
    return badRequest("ФИО, телефон, PIN и роль обязательны.");
  }

  try {
    return okJson({
      employee: await createEmployee({
        fullName: body.fullName.trim(),
        phone: body.phone.trim(),
        pin: body.pin.trim(),
        roleId: body.roleId.trim(),
        branchId: auth.context.currentBranch.id,
        skillLevel: body.skillLevel,
        workPercent: body.workPercent,
        shiftMinimum: body.shiftMinimum,
        addMinimumToWorkPercent: body.addMinimumToWorkPercent,
        canBeAssignedExecutor: body.canBeAssignedExecutor,
      }),
    });
  } catch (error) {
    if (error instanceof EmployeeCreateDomainError) {
      return badRequest(error.message, error.status);
    }

    throw error;
  }
}

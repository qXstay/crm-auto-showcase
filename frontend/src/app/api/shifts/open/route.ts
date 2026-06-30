import { NextRequest } from "next/server";
import { badRequest, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { openShiftForBranch } from "@/server/repositories/shift-write-repository";

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission("shift.open");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as {
    employeeIds?: string[];
    employees?: Array<{ id: string; shiftMinimum?: number }>;
  } | null;

  const inputEmployees: Array<{ id: string; shiftMinimum?: number }> = [];

  if (Array.isArray(body?.employees)) {
    for (const entry of body!.employees) {
      if (typeof entry.id === "string") {
        inputEmployees.push({
          id: entry.id,
          shiftMinimum: typeof entry.shiftMinimum === "number" ? entry.shiftMinimum : undefined,
        });
      }
    }
  } else if (Array.isArray(body?.employeeIds)) {
    for (const id of body!.employeeIds) {
      if (typeof id === "string") {
        inputEmployees.push({ id });
      }
    }
  }

  try {
    return okJson(
      await openShiftForBranch({
        branchId: auth.context.currentBranch.id,
        actorEmployeeId: auth.context.employee.id,
        employees: inputEmployees,
      }),
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Не удалось открыть смену.");
  }
}

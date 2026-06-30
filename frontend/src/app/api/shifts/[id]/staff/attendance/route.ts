import { NextRequest } from "next/server";
import { badRequest, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import {
  markShiftStaffAttendanceForBranch,
  type ShiftStaffAttendanceAction,
} from "@/server/repositories/shift-write-repository";

function isAttendanceAction(value: unknown): value is ShiftStaffAttendanceAction {
  return value === "arrived" || value === "left";
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("shift.open");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    employeeId?: unknown;
    shiftStaffId?: unknown;
    action?: unknown;
  } | null;

  if (!isAttendanceAction(body?.action)) {
    return badRequest("Некорректное действие отметки.");
  }

  try {
    return okJson(
      await markShiftStaffAttendanceForBranch({
        branchId: auth.context.currentBranch.id,
        shiftId: id,
        actorEmployeeId: auth.context.employee.id,
        employeeId: typeof body?.employeeId === "string" ? body.employeeId : null,
        shiftStaffId: typeof body?.shiftStaffId === "string" ? body.shiftStaffId : null,
        action: body.action,
      }),
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Не удалось сохранить отметку.");
  }
}

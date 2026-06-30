import { okJson, badRequest } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { closeShiftForBranch } from "@/server/repositories/shift-write-repository";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("shift.close");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    return okJson(
      await closeShiftForBranch({
        branchId: auth.context.currentBranch.id,
        shiftId: id,
        actorEmployeeId: auth.context.employee.id,
      }),
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Не удалось закрыть смену.");
  }
}

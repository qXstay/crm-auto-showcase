import { NextRequest } from "next/server";
import { badRequest, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { addShiftExpenseForBranch } from "@/server/repositories/shift-write-repository";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("shift.open");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const body = (await request.json().catch(() => null)) as
    | { amount?: unknown; description?: unknown }
    | null;

  try {
    return okJson(
      await addShiftExpenseForBranch({
        branchId: auth.context.currentBranch.id,
        shiftId: id,
        actorEmployeeId: auth.context.employee.id,
        amount: typeof body?.amount === "number" ? body.amount : Number.NaN,
        description: typeof body?.description === "string" ? body.description : "",
      }),
    );
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Не удалось добавить расход.");
  }
}

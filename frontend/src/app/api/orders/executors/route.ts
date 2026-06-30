import { okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { listShiftAssignableEmployees } from "@/server/repositories/shift-write-repository";

export async function GET() {
  const auth = await requireApiPermission("order.create");

  if (!auth.ok) {
    return auth.response;
  }

  const employees = await listShiftAssignableEmployees(auth.context.currentBranch.id);

  return okJson({
    executors: employees.map((employee) => ({
      id: employee.id,
      label: employee.label,
    })),
  });
}

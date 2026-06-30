import { okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { listShiftActivity } from "@/server/repositories/shift-read-repository";

export async function GET() {
  const auth = await requireApiPermission("shift.view");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await listShiftActivity(auth.context.currentBranch.id));
}

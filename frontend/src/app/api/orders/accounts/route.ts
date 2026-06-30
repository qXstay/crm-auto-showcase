import { okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { getAccountsForBranch } from "@/server/repositories/branch-settings-repository";

export async function GET() {
  const auth = await requireApiPermission("order.create");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await getAccountsForBranch(auth.context.currentBranch.id));
}

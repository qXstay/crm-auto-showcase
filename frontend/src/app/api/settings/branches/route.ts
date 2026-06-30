import { listAllBranches } from "@/server/repositories/branch-repository";
import { requireApiPermission } from "@/server/api/guards";
import { okJson } from "@/server/api/responses";

export async function GET() {
  const auth = await requireApiPermission("settings.branch");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson({
    branches: await listAllBranches(),
  });
}

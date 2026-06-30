import { listBranchesByEmployee } from "@/server/repositories/branch-repository";
import { requireApiAuthContext } from "@/server/api/guards";
import { okJson } from "@/server/api/responses";

export async function GET() {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  return okJson({
    branches: await listBranchesByEmployee(auth.context.employee.id),
  });
}

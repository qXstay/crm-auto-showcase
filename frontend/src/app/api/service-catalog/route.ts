import { requireApiPermission } from "@/server/api/guards";
import { okJson } from "@/server/api/responses";
import { listServiceCatalog } from "@/server/repositories/service-catalog-repository";

export async function GET() {
  const auth = await requireApiPermission("order.create");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await listServiceCatalog());
}

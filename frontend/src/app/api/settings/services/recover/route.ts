import { requireApiPermission } from "@/server/api/guards";
import { okJson } from "@/server/api/responses";
import { recoverServiceCatalogFromSeed } from "@/server/repositories/service-catalog-repository";

export async function POST() {
  const auth = await requireApiPermission("settings.services");

  if (!auth.ok) {
    return auth.response;
  }

  const recovery = await recoverServiceCatalogFromSeed();

  return okJson({
    ok: true,
    ...recovery,
  });
}

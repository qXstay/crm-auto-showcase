import { listPermissionGroups } from "@/server/repositories/role-repository";
import { requireApiPermission } from "@/server/api/guards";
import { okJson } from "@/server/api/responses";

export async function GET() {
  const auth = await requireApiPermission("settings.roles");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson({
    groups: await listPermissionGroups(),
  });
}

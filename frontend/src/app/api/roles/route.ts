import { NextRequest } from "next/server";
import { createRole, listRoles } from "@/server/repositories/role-repository";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";

export async function GET() {
  const auth = await requireApiPermission("settings.roles");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await listRoles());
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission("settings.roles");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | { name?: string; permissionIds?: string[] }
    | null;

  if (!body?.name?.trim() || !Array.isArray(body.permissionIds) || body.permissionIds.length === 0) {
    return badRequest("Название и хотя бы одно право обязательны.");
  }

  return okJson({
    role: await createRole({
      name: body.name.trim(),
      permissionIds: body.permissionIds,
    }),
  });
}

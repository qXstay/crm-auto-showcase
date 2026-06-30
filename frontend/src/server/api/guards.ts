import { getServerAuthContext, hasServerPermission } from "@/server/auth/context";
import { forbidden, unauthorized } from "@/server/api/responses";

export async function requireApiAuthContext() {
  const context = await getServerAuthContext();

  if (!context) {
    return { ok: false as const, response: unauthorized() };
  }

  return { ok: true as const, context };
}

export async function requireApiPermission(permissionId: string | null) {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth;
  }

  if (!hasServerPermission(auth.context, permissionId)) {
    return { ok: false as const, response: forbidden() };
  }

  return auth;
}

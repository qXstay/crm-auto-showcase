import { clearSessionCookie } from "@/server/auth/session";
import { signOutCurrentSession } from "@/server/repositories/auth-repository";
import { okJson } from "@/server/api/responses";

export async function POST() {
  await signOutCurrentSession().catch(() => null);
  await clearSessionCookie();

  return okJson({ ok: true });
}

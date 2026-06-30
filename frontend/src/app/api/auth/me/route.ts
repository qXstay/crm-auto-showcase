import { getServerAuthContext } from "@/server/auth/context";
import { okJson } from "@/server/api/responses";

export async function GET() {
  const context = await getServerAuthContext();

  return okJson({ context });
}

import { requireApiAuthContext } from "@/server/api/guards";
import { getBranchProfile } from "@/server/repositories/branch-repository";
import { okJson } from "@/server/api/responses";

export async function GET() {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  return okJson({
    branch: auth.context.currentBranch,
    profile: await getBranchProfile(auth.context.currentBranch.id),
  });
}

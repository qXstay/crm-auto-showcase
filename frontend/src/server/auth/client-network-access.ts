import type { DemoAuthContext } from "@/features/auth/types";
import { prisma } from "@/server/db/prisma";

export async function canReadNetworkClients(context: DemoAuthContext) {
  const activeBranches = await prisma.branch.findMany({
    where: { isActive: true },
    select: { id: true },
  });

  if (activeBranches.length === 0) {
    return false;
  }

  const availableBranchIds = new Set(context.availableBranches.map((branch) => branch.id));

  return activeBranches.every((branch) => availableBranchIds.has(branch.id));
}

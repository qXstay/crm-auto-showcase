import { prisma } from "@/server/db/prisma";
import type { DemoClientSourcesStore } from "@/features/settings-client-sources/types";
import { normalizeClientSourceName } from "@/features/settings-client-sources/defaults";
import { buildClientBranchScopeWhere } from "@/server/repositories/client-branch-scope";

export async function getClientSourceUsageCounts(
  store: DemoClientSourcesStore,
  branchId: string,
): Promise<Record<string, number>> {
  const clients = await prisma.client.findMany({
    where: buildClientBranchScopeWhere(branchId),
    select: {
      source: true,
    },
  });

  const usageBySource = new Map<string, number>();

  for (const client of clients) {
    const normalized = normalizeClientSourceName(client.source ?? "");

    if (!normalized) {
      continue;
    }

    usageBySource.set(normalized, (usageBySource.get(normalized) ?? 0) + 1);
  }

  return Object.fromEntries(
    store.sources.map((source) => [
      source.id,
      usageBySource.get(normalizeClientSourceName(source.name)) ?? 0,
    ]),
  );
}

import { NextRequest } from "next/server";
import { badRequest, forbidden, okJson } from "@/server/api/responses";
import { requireApiAuthContext } from "@/server/api/guards";
import { hasServerPermission } from "@/server/auth/context";
import {
  getClientSourceSettingsForBranch,
  updateClientSourceSettingsForBranch,
} from "@/server/repositories/branch-settings-repository";
import { getClientSourceUsageCounts } from "@/server/repositories/client-source-read-repository";
import { normalizeClientSourcesStore } from "@/features/settings-client-sources/defaults";
import { logAuditEvent } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  if (
    !hasServerPermission(auth.context, "settings.clients") &&
    !hasServerPermission(auth.context, "client.view")
  ) {
    return forbidden();
  }

  const branchId = auth.context.currentBranch.id;
  const settings = await getClientSourceSettingsForBranch(branchId);
  const usageCounts = await getClientSourceUsageCounts(settings, branchId);

  return okJson({
    settings,
    usageCounts,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  if (!hasServerPermission(auth.context, "settings.clients")) {
    return forbidden();
  }

  const body = (await request.json().catch(() => null)) as
    | {
        sources?: unknown;
      }
    | null;

  if (!body || !Array.isArray(body.sources)) {
    return badRequest("Некорректные источники клиентов.");
  }

  const branchId = auth.context.currentBranch.id;
  const settings = await updateClientSourceSettingsForBranch(
    branchId,
    normalizeClientSourcesStore({
      sources: body.sources,
    }),
  );
  const usageCounts = await getClientSourceUsageCounts(settings, branchId);

  await logAuditEvent({
    eventType: "settings.clients.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "client_source_settings",
    entityId: auth.context.currentBranch.id,
    payload: settings,
  });

  return okJson({
    settings,
    usageCounts,
  });
}

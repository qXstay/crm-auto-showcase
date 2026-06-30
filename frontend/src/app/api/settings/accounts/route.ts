import { NextRequest } from "next/server";
import {
  createAccountForBranch,
  getAccountsForBranch,
} from "@/server/repositories/branch-settings-repository";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import { logAuditEvent } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiPermission("settings.accounts");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await getAccountsForBranch(auth.context.currentBranch.id));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission("settings.accounts");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as { name?: string } | null;

  if (!body?.name?.trim()) {
    return badRequest("Название счета обязательно.");
  }

  const account = await createAccountForBranch(auth.context.currentBranch.id, body.name.trim());

  await logAuditEvent({
    eventType: "settings.account.create",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "payment_account",
    entityId: account.id,
    payload: account,
  });

  return okJson({ account });
}

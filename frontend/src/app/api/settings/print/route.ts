import { NextRequest } from "next/server";
import {
  getPrintSettingsForBranch,
  updatePrintSettingsForBranch,
} from "@/server/repositories/branch-settings-repository";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import { logAuditEvent } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiPermission("settings.main");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson({
    settings: await getPrintSettingsForBranch(auth.context.currentBranch.id),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiPermission("settings.main");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | { receiptTitle?: string; footerNote?: string; showPhone?: boolean; showAddress?: boolean }
    | null;

  if (!body?.receiptTitle?.trim()) {
    return badRequest("Название для печати обязательно.");
  }

  const settings = await updatePrintSettingsForBranch(auth.context.currentBranch.id, {
    receiptTitle: body.receiptTitle.trim(),
    footerNote: body.footerNote?.trim() ?? "",
    showPhone: body.showPhone ?? true,
    showAddress: body.showAddress ?? true,
  });

  await logAuditEvent({
    eventType: "settings.print.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "branch_print_settings",
    entityId: auth.context.currentBranch.id,
    payload: settings,
  });

  return okJson({ settings });
}

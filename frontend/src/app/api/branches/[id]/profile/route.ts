import { NextRequest } from "next/server";
import { requireApiAuthContext, requireApiPermission } from "@/server/api/guards";
import { badRequest, forbidden, notFound, okJson } from "@/server/api/responses";
import {
  getBranchProfile,
  updateBranchProfile,
} from "@/server/repositories/branch-repository";
import { logAuditEvent } from "@/server/services/audit";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  if (id !== auth.context.currentBranch.id) {
    return forbidden();
  }

  const profile = await getBranchProfile(id);

  if (!profile) {
    return notFound("Профиль филиала не найден.");
  }

  return okJson({ profile });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("settings.main");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  if (id !== auth.context.currentBranch.id) {
    return forbidden();
  }

  const body = (await request.json().catch(() => null)) as
    | {
        legalName?: string;
        displayName?: string;
        address?: string;
        phone?: string;
        timezoneLabel?: string;
        workStart?: string;
        workEnd?: string;
      }
    | null;

  if (
    !body?.legalName?.trim() ||
    !body.displayName?.trim() ||
    !body.address?.trim() ||
    !body.timezoneLabel?.trim() ||
    !body.workStart?.trim() ||
    !body.workEnd?.trim()
  ) {
    return badRequest("Заполните обязательные поля профиля филиала.");
  }

  const profile = await updateBranchProfile(id, {
    legalName: body.legalName.trim(),
    displayName: body.displayName.trim(),
    address: body.address.trim(),
    phone: body.phone?.trim() ?? "",
    timezoneLabel: body.timezoneLabel.trim(),
    workStart: body.workStart.trim(),
    workEnd: body.workEnd.trim(),
  });

  await logAuditEvent({
    eventType: "settings.branch_profile.update",
    actorUserId: null,
    actorEmployeeId: auth.context.employee.id,
    branchId: id,
    entityType: "branch_profile",
    entityId: id,
    payload: profile,
  });

  return okJson({ profile });
}

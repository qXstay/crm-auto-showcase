import { NextRequest } from "next/server";
import {
  getBookingSettingsForBranch,
  updateBookingSettingsForBranch,
} from "@/server/repositories/branch-settings-repository";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import { logAuditEvent } from "@/server/services/audit";

export async function GET() {
  const auth = await requireApiPermission("settings.booking");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson({
    settings: await getBookingSettingsForBranch(auth.context.currentBranch.id),
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireApiPermission("settings.booking");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | {
        publicSlug?: string;
        posts?: Array<{ id: string; name: string }>;
        onlineEnabled?: boolean;
        slotWindowMinutes?: number;
        allowPostChoice?: boolean;
        allowMultipleWindows?: boolean;
        metricsId?: string;
        telegramChatId?: string;
      }
    | null;

  if (!body || typeof body.publicSlug !== "string" || !Array.isArray(body.posts)) {
    return badRequest("Некорректные настройки записи.");
  }

  const settings = await updateBookingSettingsForBranch(auth.context.currentBranch.id, {
    publicSlug: body.publicSlug.trim(),
    posts: body.posts,
    onlineEnabled: body.onlineEnabled ?? true,
    slotWindowMinutes: body.slotWindowMinutes ?? 15,
    allowPostChoice: body.allowPostChoice ?? true,
    allowMultipleWindows: body.allowMultipleWindows ?? false,
    metricsId: body.metricsId ?? "0",
    telegramChatId: body.telegramChatId ?? "0",
  });

  await logAuditEvent({
    eventType: "settings.booking.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "booking_settings",
    entityId: auth.context.currentBranch.id,
    payload: settings,
  });

  return okJson({ settings });
}

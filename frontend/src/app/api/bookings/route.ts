import { NextRequest } from "next/server";
import { badRequest, okJson } from "@/server/api/responses";
import { requireApiAuthContext, requireApiPermission } from "@/server/api/guards";
import { hasServerPermission } from "@/server/auth/context";
import { listBookingsForBranch } from "@/server/repositories/booking-read-repository";
import { createBookingGroupForBranch } from "@/server/repositories/booking-write-repository";
import { logAuditEvent } from "@/server/services/audit";
import type { BookingDraftSegment } from "@/features/booking/types";

export async function GET() {
  const auth = await requireApiPermission("booking.view");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(await listBookingsForBranch(auth.context.currentBranch.id));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiAuthContext();

  if (!auth.ok) {
    return auth.response;
  }

  if (!hasServerPermission(auth.context, "booking.create")) {
    return badRequest("Недостаточно прав", 403);
  }

  const body = (await request.json().catch(() => null)) as
    | {
        date?: unknown;
        clientId?: unknown;
        note?: unknown;
        segments?: unknown;
      }
    | null;

  if (
    !body ||
    typeof body.date !== "string" ||
    !Array.isArray(body.segments) ||
    body.segments.length === 0
  ) {
    return badRequest("Некорректные данные записи.");
  }

  const segments = body.segments
    .map((segment) => {
      if (!segment || typeof segment !== "object") {
        return null;
      }

      const candidate = segment as Partial<BookingDraftSegment>;
      if (
        typeof candidate.id !== "string" ||
        typeof candidate.postId !== "string" ||
        typeof candidate.postName !== "string" ||
        typeof candidate.start !== "string" ||
        typeof candidate.end !== "string"
      ) {
        return null;
      }

      return {
        id: candidate.id,
        postId: candidate.postId,
        postName: candidate.postName,
        start: candidate.start,
        end: candidate.end,
      } satisfies BookingDraftSegment;
    })
    .filter((segment): segment is BookingDraftSegment => Boolean(segment));

  if (segments.length === 0) {
    return badRequest("Некорректные данные записи.");
  }

  const entries = await createBookingGroupForBranch(auth.context.currentBranch.id, {
    date: body.date,
    clientId:
      typeof body.clientId === "string" || body.clientId === null
        ? (body.clientId as string | null)
        : null,
    note: typeof body.note === "string" ? body.note : "",
    segments,
    createdByEmployeeId: auth.context.employee.id,
  });

  await logAuditEvent({
    eventType: "booking.create",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "booking",
    entityId: entries[0]?.groupId ?? `booking-${Date.now()}`,
    payload: {
      date: body.date,
      clientId: typeof body.clientId === "string" ? body.clientId : null,
      note: typeof body.note === "string" ? body.note : "",
      segments,
    },
  });

  return okJson({ entries });
}

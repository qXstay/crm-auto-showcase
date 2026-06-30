import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { mapBookingEntry } from "@/server/repositories/booking-read-repository";
import { buildClientBranchScopeWhere } from "@/server/repositories/client-branch-scope";
import type { BookingDraftSegment, BookingEntry } from "@/features/booking/types";

function normalizeOptionalString(value: string | null | undefined) {
  if (value === null) {
    return null;
  }

  if (value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildDisplayCarLabel(input: {
  brand: string;
  model: string;
  plateNumber: string;
}) {
  const parts = [input.brand, input.model, input.plateNumber].map((value) => value.trim()).filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Не указан";
}

async function resolveBookingClientSnapshot(branchId: string, clientId: string | null | undefined) {
  const normalizedClientId = normalizeOptionalString(clientId) ?? null;

  if (!normalizedClientId) {
    return {
      clientId: null,
      vehicleId: null,
      anonymous: true,
      clientNameSnapshot: "Анонимный клиент",
      phoneSnapshot: "",
      carSnapshot: "Не указан",
      clientSnapshotJson: null,
      vehicleSnapshotJson: null,
      contactSnapshotJson: null,
    };
  }

  const client = await prisma.client.findFirst({
    where: {
      id: normalizedClientId,
      ...buildClientBranchScopeWhere(branchId),
    },
    include: {
      vehicles: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!client) {
    return {
      clientId: null,
      vehicleId: null,
      anonymous: true,
      clientNameSnapshot: "Анонимный клиент",
      phoneSnapshot: "",
      carSnapshot: "Не указан",
      clientSnapshotJson: null,
      vehicleSnapshotJson: null,
      contactSnapshotJson: null,
    };
  }

  const vehicle = client.vehicles[0] ?? null;
  const carSnapshot = vehicle
    ? buildDisplayCarLabel({
        brand: vehicle.brand,
        model: vehicle.model,
        plateNumber: vehicle.plateNumber,
      })
    : "Не указан";

  return {
    clientId: client.id,
    vehicleId: vehicle?.id ?? null,
    anonymous: false,
    clientNameSnapshot: client.fullName,
    phoneSnapshot: client.phone,
    carSnapshot,
    clientSnapshotJson: {
      clientId: client.id,
      name: client.fullName,
      phone: client.phone,
    },
    vehicleSnapshotJson: vehicle
      ? {
          vehicleId: vehicle.id,
          label: carSnapshot === "Не указан" ? "" : carSnapshot,
          plateNumber: vehicle.plateNumber,
        }
      : null,
    contactSnapshotJson: {
      phone: client.phone,
    },
  };
}

function resolveManualBookingSnapshot(input: {
  clientName?: string;
  clientPhone?: string;
}) {
  const clientNameSnapshot = input.clientName?.trim() ?? "";
  const phoneSnapshot = input.clientPhone?.trim() ?? "";

  if (!clientNameSnapshot && !phoneSnapshot) {
    return null;
  }

  return {
    clientId: null,
    vehicleId: null,
    anonymous: false,
    clientNameSnapshot: clientNameSnapshot || "Клиент",
    phoneSnapshot,
    carSnapshot: "Не указан",
    clientSnapshotJson: {
      clientId: null,
      name: clientNameSnapshot || "Клиент",
      phone: phoneSnapshot,
    },
    vehicleSnapshotJson: null,
    contactSnapshotJson: {
      phone: phoneSnapshot,
    },
  };
}

async function resolveBookingPostIds(branchId: string) {
  const settings = await prisma.bookingSettings.findUnique({
    where: { branchId },
    select: { postsJson: true },
  });

  if (!settings || !Array.isArray(settings.postsJson)) {
    return [];
  }

  return settings.postsJson
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const candidate = item as { id?: unknown };
      return typeof candidate.id === "string" && candidate.id.trim().length > 0
        ? candidate.id.trim()
        : null;
    })
    .filter((value): value is string => Boolean(value));
}

function normalizeDraftSegments(
  segments: BookingDraftSegment[],
  allowedPostIds: string[],
): BookingDraftSegment[] {
  const fallbackPostId = allowedPostIds[0] ?? null;
  const validPostIds = new Set(allowedPostIds);

  return segments
    .map((segment) => ({
      ...segment,
      postId:
        validPostIds.has(segment.postId) || !fallbackPostId ? segment.postId : fallbackPostId,
      start: segment.start.trim(),
      end: segment.end.trim(),
    }))
    .sort((left, right) => left.start.localeCompare(right.start));
}

export async function createBookingGroupForBranch(
  branchId: string,
  input: {
    clientId?: string | null;
    clientName?: string;
    clientPhone?: string;
    note?: string;
    segments: BookingDraftSegment[];
    date: string;
    createdByEmployeeId: string | null;
    serviceLabel?: string;
  },
): Promise<BookingEntry[]> {
  const allowedPostIds = await resolveBookingPostIds(branchId);
  const segments = normalizeDraftSegments(input.segments, allowedPostIds);
  const note = input.note?.trim() ?? "";
  const clientSnapshot =
    resolveManualBookingSnapshot({
      clientName: input.clientName,
      clientPhone: input.clientPhone,
    }) ?? (await resolveBookingClientSnapshot(branchId, input.clientId));
  const groupId = `booking-${randomUUID()}`;
  const serviceLabel = input.serviceLabel?.trim() || "Новая запись";

  const records = await prisma.$transaction(
    segments.map((segment, index) =>
      prisma.booking.create({
        data: {
          id: `${groupId}-${index + 1}`,
          groupId,
          branchId,
          clientId: clientSnapshot.clientId,
          vehicleId: clientSnapshot.vehicleId,
          anonymous: clientSnapshot.anonymous,
          clientNameSnapshot: clientSnapshot.clientNameSnapshot,
          phoneSnapshot: clientSnapshot.phoneSnapshot,
          carSnapshot: clientSnapshot.carSnapshot,
          dateKey: input.date,
          startTime: segment.start,
          endTime: segment.end,
          postId: segment.postId,
          serviceLabel,
          comment: note || null,
          createdByEmployeeId: input.createdByEmployeeId,
          clientSnapshotJson: clientSnapshot.clientSnapshotJson ?? undefined,
          vehicleSnapshotJson: clientSnapshot.vehicleSnapshotJson ?? undefined,
          contactSnapshotJson: clientSnapshot.contactSnapshotJson ?? undefined,
        },
      }),
    ),
  );

  return records
    .map(mapBookingEntry)
    .sort((left, right) => left.startTime.localeCompare(right.startTime));
}

export async function listBookingGroupCreatorsForBranch(branchId: string, groupId: string) {
  return prisma.booking.findMany({
    where: {
      branchId,
      groupId,
    },
    select: {
      id: true,
      createdByEmployeeId: true,
    },
    orderBy: { startTime: "asc" },
  });
}

export async function deleteBookingGroupForBranch(branchId: string, groupId: string) {
  const records = await prisma.booking.findMany({
    where: {
      branchId,
      groupId,
    },
    select: {
      id: true,
    },
  });

  if (records.length === 0) {
    return null;
  }

  await prisma.booking.deleteMany({
    where: {
      branchId,
      groupId,
    },
  });

  return {
    groupId,
    deletedIds: records.map((record) => record.id),
  };
}

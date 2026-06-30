import { prisma } from "@/server/db/prisma";
import type { BookingEntry } from "@/features/booking/types";

export function mapBookingEntry(record: {
  id: string;
  groupId: string;
  branchId: string;
  clientId: string | null;
  anonymous: boolean;
  clientNameSnapshot: string;
  phoneSnapshot: string;
  carSnapshot: string;
  dateKey: string;
  startTime: string;
  endTime: string;
  postId: string;
  serviceLabel: string;
  comment: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdByEmployeeId: string | null;
}): BookingEntry {
  return {
    id: record.id,
    groupId: record.groupId,
    branchId: record.branchId,
    clientId: record.clientId,
    anonymous: record.anonymous,
    client: record.clientNameSnapshot,
    phone: record.phoneSnapshot,
    car: record.carSnapshot,
    date: record.dateKey,
    startTime: record.startTime,
    endTime: record.endTime,
    postId: record.postId,
    service: record.serviceLabel,
    comment: record.comment ?? "",
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    createdByEmployeeId: record.createdByEmployeeId,
  };
}

export async function listBookingsForBranch(branchId: string) {
  const entries = await prisma.booking.findMany({
    where: { branchId },
    orderBy: [{ dateKey: "asc" }, { startTime: "asc" }],
  });

  return {
    entries: entries.map(mapBookingEntry),
  };
}

export async function listDayBookingsForBranch(branchId: string, dateKey?: string | null) {
  const entries = await prisma.booking.findMany({
    where: {
      branchId,
      ...(dateKey ? { dateKey } : {}),
    },
    orderBy: [{ dateKey: "asc" }, { startTime: "asc" }],
  });

  return {
    entries: entries.map(mapBookingEntry),
  };
}

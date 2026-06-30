"use client";

import { apiRequest } from "@/lib/api/client";
import type { BookingDraftSegment, BookingEntry } from "@/features/booking/types";

type CreateBookingInput = {
  date: string;
  clientId?: string | null;
  note?: string;
  segments: BookingDraftSegment[];
};

export async function fetchBookingsViaApi() {
  return apiRequest<{ entries: BookingEntry[] }>("/api/bookings");
}

export async function createBookingViaApi(input: CreateBookingInput) {
  return apiRequest<{ entries: BookingEntry[] }>("/api/bookings", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function deleteBookingGroupViaApi(groupId: string) {
  return apiRequest<{ groupId: string; deletedIds: string[] }>(`/api/bookings/${groupId}`, {
    method: "DELETE",
  });
}

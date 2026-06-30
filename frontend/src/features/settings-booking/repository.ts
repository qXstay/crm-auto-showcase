"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoBookingSettingsStore } from "@/features/settings-booking/types";

export type BookingSettingsApiShape = DemoBookingSettingsStore & {
  onlineEnabled: boolean;
  slotWindowMinutes: number;
  allowPostChoice: boolean;
  allowMultipleWindows: boolean;
  metricsId: string;
  telegramChatId: string;
};

export async function fetchBookingSettingsViaApi() {
  return apiRequest<{ settings: BookingSettingsApiShape }>("/api/settings/booking");
}

export async function saveBookingSettingsViaApi(settings: BookingSettingsApiShape) {
  return apiRequest<{ settings: BookingSettingsApiShape }>("/api/settings/booking", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

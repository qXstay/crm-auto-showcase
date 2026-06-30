"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoStorageSettingsStore } from "@/features/settings-storage/types";

export async function fetchStorageSettingsViaApi() {
  return apiRequest<{ settings: DemoStorageSettingsStore }>("/api/settings/storage");
}

export async function saveStorageSettingsViaApi(settings: DemoStorageSettingsStore) {
  return apiRequest<{ settings: DemoStorageSettingsStore }>("/api/settings/storage", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

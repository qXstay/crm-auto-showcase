"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoClientSourcesStore } from "@/features/settings-client-sources/types";

export async function fetchClientSourceSettingsViaApi() {
  return apiRequest<{
    settings: DemoClientSourcesStore;
    usageCounts: Record<string, number>;
  }>("/api/settings/client-sources");
}

export async function saveClientSourceSettingsViaApi(settings: DemoClientSourcesStore) {
  return apiRequest<{
    settings: DemoClientSourcesStore;
    usageCounts: Record<string, number>;
  }>("/api/settings/client-sources", {
    method: "PATCH",
    body: JSON.stringify(settings),
  });
}

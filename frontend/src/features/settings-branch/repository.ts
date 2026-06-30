"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoBranchProfile, DemoBranchPrintSettings, DemoBranchSummary } from "@/features/branches/types";

export async function fetchCurrentBranchBundle() {
  return apiRequest<{ branch: DemoBranchSummary; profile: DemoBranchProfile | null }>(
    "/api/branches/current",
  );
}

export async function fetchBranchProfile(branchId: string) {
  return apiRequest<{ profile: DemoBranchProfile }>(`/api/branches/${branchId}/profile`);
}

export async function saveBranchProfile(
  branchId: string,
  input: Omit<DemoBranchProfile, "branchId">,
) {
  return apiRequest<{ profile: DemoBranchProfile }>(`/api/branches/${branchId}/profile`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function fetchPrintSettings() {
  return apiRequest<{ settings: DemoBranchPrintSettings }>("/api/settings/print");
}

export async function savePrintSettings(
  input: Omit<DemoBranchPrintSettings, "branchId">,
) {
  return apiRequest<{ settings: DemoBranchPrintSettings }>("/api/settings/print", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

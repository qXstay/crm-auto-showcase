"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoShiftState } from "@/features/shifts/types";

export async function fetchCurrentShiftForOrderFlow() {
  return apiRequest<{ currentShift: DemoShiftState["currentShift"] }>("/api/shifts/current");
}

export async function openShiftViaApi(employees: Array<{ id: string; shiftMinimum?: number }>) {
  return apiRequest<{ currentShift: DemoShiftState["currentShift"] }>("/api/shifts/open", {
    method: "POST",
    body: JSON.stringify({ employees }),
  });
}

export async function closeShiftViaApi(shiftId: string) {
  return apiRequest<{ currentShift: DemoShiftState["currentShift"] }>(`/api/shifts/${shiftId}/close`, {
    method: "POST",
  });
}

export async function updateShiftStaffViaApi(
  shiftId: string,
  employees: Array<{ id: string; shiftMinimum?: number }>,
) {
  return apiRequest<{ currentShift: DemoShiftState["currentShift"] }>(`/api/shifts/${shiftId}/staff`, {
    method: "PATCH",
    body: JSON.stringify({ employees }),
  });
}

export async function addShiftExpenseViaApi(
  shiftId: string,
  input: { amount: number; description: string },
) {
  return apiRequest<{ currentShift: DemoShiftState["currentShift"] }>(`/api/shifts/${shiftId}/expenses`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

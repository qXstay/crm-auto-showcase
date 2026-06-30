"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoEmployeeRecord, DemoEmployeesStore } from "@/features/settings-employees/types";

export async function fetchEmployeesStore() {
  return apiRequest<DemoEmployeesStore>("/api/employees");
}

export async function fetchEmployee(employeeId: string) {
  return apiRequest<{ employee: DemoEmployeeRecord }>(`/api/employees/${employeeId}`);
}

export async function createEmployeeViaApi(input: {
  fullName: string;
  phone: string;
  pin: string;
  roleId: string;
  skillLevel?: string;
  workPercent?: number;
  shiftMinimum?: number;
  addMinimumToWorkPercent?: boolean;
  canBeAssignedExecutor?: boolean;
}) {
  return apiRequest<{ employee: DemoEmployeeRecord }>("/api/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateEmployeeViaApi(
  employeeId: string,
  input: Partial<DemoEmployeeRecord> & { pin?: string | null },
) {
  return apiRequest<{ employee: DemoEmployeeRecord }>(`/api/employees/${employeeId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteEmployeeViaApi(employeeId: string) {
  return apiRequest<{ deleted: true }>(`/api/employees/${employeeId}`, {
    method: "DELETE",
  });
}

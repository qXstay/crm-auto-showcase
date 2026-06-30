"use client";

import { apiRequest } from "@/lib/api/client";
import type {
  DemoRolePermissionGroup,
  DemoRoleRecord,
  DemoRolesStore,
} from "@/features/settings-roles/types";

export async function fetchRolesStore() {
  return apiRequest<DemoRolesStore>("/api/roles");
}

export async function fetchPermissionGroups() {
  return apiRequest<{ groups: DemoRolePermissionGroup[] }>("/api/permissions");
}

export async function createRoleViaApi(input: Pick<DemoRoleRecord, "name" | "permissionIds">) {
  return apiRequest<{ role: DemoRoleRecord }>("/api/roles", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRoleViaApi(
  roleId: string,
  input: Pick<DemoRoleRecord, "name" | "permissionIds">,
) {
  return apiRequest<{ role: DemoRoleRecord }>(`/api/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteRoleViaApi(roleId: string) {
  return apiRequest<{ ok: true }>(`/api/roles/${roleId}`, {
    method: "DELETE",
  });
}

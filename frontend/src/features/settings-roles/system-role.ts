import type { DemoRoleRecord } from "@/features/settings-roles/types";

export const DAILY_EMPLOYEE_ROLE_ID = "developer";
export const DAILY_EMPLOYEE_ROLE_NAME = "Сотрудник";

export const DAILY_EMPLOYEE_PERMISSION_IDS = [
  "booking.view",
  "booking.create",
  "shift.view",
  "shift.open",
  "shift.close",
  "order.view",
  "order.create",
  "storage.view",
  "storage.edit_own",
  "client.view",
  "client.create",
  "client.edit",
] as const;

export function normalizeSystemRole(
  role: Pick<DemoRoleRecord, "id" | "name" | "permissionIds">,
): DemoRoleRecord {
  if (role.id !== DAILY_EMPLOYEE_ROLE_ID) {
    return {
      id: role.id,
      name: role.name,
      permissionIds: [...role.permissionIds],
    };
  }

  return {
    id: role.id,
    name: DAILY_EMPLOYEE_ROLE_NAME,
    permissionIds: Array.from(
      new Set([...role.permissionIds, ...DAILY_EMPLOYEE_PERMISSION_IDS]),
    ),
  };
}

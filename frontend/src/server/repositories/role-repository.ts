import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import type {
  DemoRolePermissionGroup,
  DemoRoleRecord,
  DemoRolesStore,
} from "@/features/settings-roles/types";
import { normalizeSystemRole } from "@/features/settings-roles/system-role";

const ROLE_MANAGEMENT_PERMISSION_ID = "settings.roles";
const PROTECTED_ADMIN_ROLE_KEYS = new Set(["owner", "admin"]);

const PERMISSION_GROUP_LABELS: Record<string, string> = {
  analytics: "Аналитика",
  booking: "Запись",
  shift: "Смена",
  order: "Заказы",
  storage: "Склад",
  client: "Клиенты",
  finance: "Финансы",
  report: "Отчёты",
  settings: "Настройки",
};

function getPermissionGroupLabel(groupKey: string) {
  return (
    PERMISSION_GROUP_LABELS[groupKey] ??
    groupKey.charAt(0).toUpperCase() + groupKey.slice(1)
  );
}

export class RoleMutationDomainError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "RoleMutationDomainError";
    this.status = status;
  }
}

type RoleGuardRecord = {
  id: string;
  name: string;
  systemKey: string | null;
  isSystem: boolean;
};

function isProtectedAdminRole(role: RoleGuardRecord) {
  const key = role.systemKey ?? role.id;
  return PROTECTED_ADMIN_ROLE_KEYS.has(key);
}

function isProtectedSystemRole(role: RoleGuardRecord) {
  return role.isSystem || Boolean(role.systemKey) || isProtectedAdminRole(role);
}

export function assertRoleUpdateIsSafe(input: {
  role: RoleGuardRecord;
  actorRoleId?: string | null;
  nextPermissionIds: string[];
}) {
  const nextPermissions = new Set(input.nextPermissionIds);
  const keepsRoleManagement = nextPermissions.has(ROLE_MANAGEMENT_PERMISSION_ID);

  if (input.actorRoleId === input.role.id && !keepsRoleManagement) {
    throw new RoleMutationDomainError(
      "Нельзя убрать право «Настройки ролей» у своей текущей роли: вы потеряете доступ к управлению ролями.",
    );
  }

  if (isProtectedAdminRole(input.role) && !keepsRoleManagement) {
    throw new RoleMutationDomainError(
      "Нельзя убрать право «Настройки ролей» у защищённой роли владельца/администратора.",
    );
  }
}

export function assertRoleDeleteIsSafe(input: {
  role: RoleGuardRecord;
  actorRoleId?: string | null;
  assignedEmployeeCount: number;
}) {
  if (input.actorRoleId === input.role.id) {
    throw new RoleMutationDomainError(
      "Нельзя удалить свою текущую роль: вы потеряете доступ к управлению ролями.",
    );
  }

  if (isProtectedSystemRole(input.role)) {
    throw new RoleMutationDomainError(
      "Системные роли владельца и сотрудников нельзя удалять через настройки ролей.",
    );
  }

  if (input.assignedEmployeeCount > 0) {
    throw new RoleMutationDomainError(
      "Нельзя удалить роль, пока к ней привязаны сотрудники.",
    );
  }
}

export async function listRoles(): Promise<DemoRolesStore> {
  const roles = await prisma.role.findMany({
    include: { rolePermissions: true },
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
  });

  return {
    roles: roles.map((role) =>
      normalizeSystemRole({
        id: role.id,
        name: role.name,
        permissionIds: role.rolePermissions.map((permission) => permission.permissionId),
      }),
    ),
  };
}

export async function createRole(input: Pick<DemoRoleRecord, "name" | "permissionIds">) {
  const role = await prisma.role.create({
    data: {
      id: `role-${randomUUID()}`,
      name: input.name.trim(),
      isSystem: false,
    },
  });

  await prisma.rolePermission.createMany({
    data: input.permissionIds.map((permissionId) => ({
      roleId: role.id,
      permissionId,
    })),
    skipDuplicates: true,
  });

  return {
    id: role.id,
    name: role.name,
    permissionIds: [...input.permissionIds],
  } satisfies DemoRoleRecord;
}

export async function updateRole(
  roleId: string,
  input: Pick<DemoRoleRecord, "name" | "permissionIds">,
  context: { actorRoleId?: string | null } = {},
) {
  return prisma.$transaction(async (tx) => {
    const existingRole = await tx.role.findUnique({
      where: { id: roleId },
      select: { id: true, name: true, systemKey: true, isSystem: true },
    });

    if (!existingRole) {
      throw new RoleMutationDomainError("Роль не найдена.", 404);
    }

    assertRoleUpdateIsSafe({
      role: existingRole,
      actorRoleId: context.actorRoleId,
      nextPermissionIds: input.permissionIds,
    });

    const role = await tx.role.update({
      where: { id: roleId },
      data: { name: input.name.trim() },
    });

    await tx.rolePermission.deleteMany({ where: { roleId } });
    await tx.rolePermission.createMany({
      data: input.permissionIds.map((permissionId) => ({
        roleId,
        permissionId,
      })),
      skipDuplicates: true,
    });

    return normalizeSystemRole({
      id: role.id,
      name: role.name,
      permissionIds: [...input.permissionIds],
    });
  });
}

export async function deleteRole(
  roleId: string,
  context: { actorRoleId?: string | null } = {},
) {
  await prisma.$transaction(async (tx) => {
    const existingRole = await tx.role.findUnique({
      where: { id: roleId },
      select: {
        id: true,
        name: true,
        systemKey: true,
        isSystem: true,
        _count: { select: { employees: true } },
      },
    });

    if (!existingRole) {
      throw new RoleMutationDomainError("Роль не найдена.", 404);
    }

    assertRoleDeleteIsSafe({
      role: existingRole,
      actorRoleId: context.actorRoleId,
      assignedEmployeeCount: existingRole._count.employees,
    });

    await tx.role.delete({ where: { id: roleId } });
  });
}

export async function listPermissionGroups(): Promise<DemoRolePermissionGroup[]> {
  const permissions = await prisma.permission.findMany({
    orderBy: [{ groupKey: "asc" }, { label: "asc" }],
  });

  return permissions.reduce<DemoRolePermissionGroup[]>((groups, permission) => {
    const existingGroup = groups.find((group) => group.id === permission.groupKey);

    if (existingGroup) {
      existingGroup.permissions.push({
        id: permission.id,
        label: permission.label,
      });
      return groups;
    }

    groups.push({
      id: permission.groupKey,
      label: getPermissionGroupLabel(permission.groupKey),
      permissions: [{ id: permission.id, label: permission.label }],
    });

    return groups;
  }, []);
}

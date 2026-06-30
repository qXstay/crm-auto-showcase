import { expect, test } from "@playwright/test";

import {
  RoleMutationDomainError,
  assertRoleDeleteIsSafe,
  assertRoleUpdateIsSafe,
} from "../../src/server/repositories/role-repository";

const ownerRole = {
  id: "owner",
  name: "Владелец",
  systemKey: "owner",
  isSystem: true,
};

const customRole = {
  id: "role-custom",
  name: "Старший администратор",
  systemKey: null,
  isSystem: false,
};

test("roles API guard rejects self-lockout permission removal", () => {
  expect(() =>
    assertRoleUpdateIsSafe({
      role: customRole,
      actorRoleId: customRole.id,
      nextPermissionIds: ["settings.services", "order.view"],
    }),
  ).toThrow(RoleMutationDomainError);
});

test("roles API guard rejects protected owner role without role-management permission", () => {
  expect(() =>
    assertRoleUpdateIsSafe({
      role: ownerRole,
      actorRoleId: "role-other",
      nextPermissionIds: ["settings.services", "order.view"],
    }),
  ).toThrow("защищённой роли владельца/администратора");
});

test("roles API guard allows safe role edit when role-management permission remains", () => {
  expect(() =>
    assertRoleUpdateIsSafe({
      role: ownerRole,
      actorRoleId: ownerRole.id,
      nextPermissionIds: ["settings.roles", "settings.services", "order.view"],
    }),
  ).not.toThrow();
});

test("roles API guard rejects protected role delete and assigned-role delete", () => {
  expect(() =>
    assertRoleDeleteIsSafe({
      role: ownerRole,
      actorRoleId: "role-other",
      assignedEmployeeCount: 0,
    }),
  ).toThrow("Системные роли");

  expect(() =>
    assertRoleDeleteIsSafe({
      role: customRole,
      actorRoleId: "role-other",
      assignedEmployeeCount: 2,
    }),
  ).toThrow("привязаны сотрудники");
});

test("roles API guard allows deleting an unused non-system role", () => {
  expect(() =>
    assertRoleDeleteIsSafe({
      role: customRole,
      actorRoleId: "role-other",
      assignedEmployeeCount: 0,
    }),
  ).not.toThrow();
});

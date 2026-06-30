import type {
  DemoRolePermissionGroup,
  DemoRoleRecord,
  DemoRolesStore,
} from "@/features/settings-roles/types";
import {
  DAILY_EMPLOYEE_PERMISSION_IDS,
  DAILY_EMPLOYEE_ROLE_ID,
  DAILY_EMPLOYEE_ROLE_NAME,
  normalizeSystemRole,
} from "@/features/settings-roles/system-role";

const ROLES_STORAGE_KEY = "pegas-demo-settings-roles";

export const ROLE_PERMISSION_GROUPS: DemoRolePermissionGroup[] = [
  {
    id: "analytics",
    label: "Аналитика",
    permissions: [{ id: "analytics.view", label: "Просмотр аналитики" }],
  },
  {
    id: "booking",
    label: "Запись",
    permissions: [
      { id: "booking.view", label: "Просмотр записей" },
      { id: "booking.create", label: "Создание записей" },
      { id: "booking.edit_own", label: "Редактирование своих записей" },
      { id: "booking.edit_all", label: "Редактирование всех записей" },
      { id: "booking.delete_own", label: "Удаление своих записей" },
      { id: "booking.delete_all", label: "Удаление всех записей" },
    ],
  },
  {
    id: "shift",
    label: "Смена",
    permissions: [
      { id: "shift.view", label: "Просмотр смен" },
      { id: "shift.open", label: "Открытие смены" },
      { id: "shift.close", label: "Закрытие смены" },
    ],
  },
  {
    id: "order",
    label: "Заказы",
    permissions: [
      { id: "order.view", label: "Просмотр заказов" },
      { id: "order.create", label: "Создание заказов" },
      { id: "order.edit_own", label: "Редактирование своих заказов" },
      { id: "order.edit_all", label: "Редактирование всех заказов" },
      { id: "order.delete_own", label: "Удаление своих заказов" },
      { id: "order.delete_all", label: "Удаление всех заказов" },
    ],
  },
  {
    id: "storage",
    label: "Склад",
    permissions: [
      { id: "storage.view", label: "Просмотр склада" },
      { id: "storage.create", label: "Создание записей" },
      { id: "storage.edit_own", label: "Редактирование своих записей" },
      { id: "storage.edit_all", label: "Редактирование всех записей" },
    ],
  },
  {
    id: "client",
    label: "Клиенты",
    permissions: [
      { id: "client.view", label: "Просмотр клиентов" },
      { id: "client.create", label: "Создание клиентов" },
      { id: "client.edit", label: "Редактирование клиентов" },
      { id: "client.delete", label: "Удаление клиентов" },
    ],
  },
  {
    id: "finance",
    label: "Финансы",
    permissions: [
      { id: "finance.view", label: "Просмотр финансов" },
      { id: "finance.create", label: "Создание финансов" },
      { id: "finance.delete", label: "Удаление финансов" },
    ],
  },
  {
    id: "report",
    label: "Отчёты",
    permissions: [{ id: "report.view", label: "Просмотр отчетов" }],
  },
  {
    id: "settings",
    label: "Настройки",
    permissions: [
      { id: "settings.main", label: "Общие настройки" },
      { id: "settings.booking", label: "Настройки бронирования" },
      { id: "settings.employees", label: "Настройки сотрудников" },
      { id: "settings.roles", label: "Настройки ролей" },
      { id: "settings.services", label: "Настройки услуг" },
      { id: "settings.clients", label: "Настройки клиентов" },
      { id: "settings.storage", label: "Настройки склада" },
      { id: "settings.accounts", label: "Настройки счетов" },
    ],
  },
];

const DEFAULT_DEVELOPER_PERMISSIONS = [...DAILY_EMPLOYEE_PERMISSION_IDS];

const DEFAULT_OWNER_PERMISSIONS = ROLE_PERMISSION_GROUPS.flatMap((group) =>
  group.permissions.map((permission) => permission.id),
);

const INITIAL_ROLES: DemoRoleRecord[] = [
  {
    id: DAILY_EMPLOYEE_ROLE_ID,
    name: DAILY_EMPLOYEE_ROLE_NAME,
    permissionIds: DEFAULT_DEVELOPER_PERMISSIONS,
  },
  {
    id: "owner",
    name: "Владелец",
    permissionIds: DEFAULT_OWNER_PERMISSIONS,
  },
];

function cloneRole(role: DemoRoleRecord): DemoRoleRecord {
  return normalizeSystemRole(role);
}

function createInitialStore(): DemoRolesStore {
  return {
    roles: INITIAL_ROLES.map(cloneRole),
  };
}

export function getInitialDemoRolesStore(): DemoRolesStore {
  return createInitialStore();
}

function normalizeStore(value: unknown): DemoRolesStore {
  if (!value || typeof value !== "object" || !Array.isArray((value as DemoRolesStore).roles)) {
    return createInitialStore();
  }

  const roles = (value as DemoRolesStore).roles.filter(
    (role): role is DemoRoleRecord =>
      Boolean(role) &&
      typeof role.id === "string" &&
      typeof role.name === "string" &&
      Array.isArray(role.permissionIds),
  );

  return {
    roles: roles.length > 0 ? roles.map(cloneRole) : createInitialStore().roles,
  };
}

export function loadDemoRolesStore(): DemoRolesStore {
  if (typeof window === "undefined") {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(ROLES_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return createInitialStore();
  }
}

export function saveDemoRolesStore(store: DemoRolesStore) {
  window.localStorage.setItem(
    ROLES_STORAGE_KEY,
    JSON.stringify({
      roles: store.roles.map(cloneRole),
    } satisfies DemoRolesStore),
  );
}

export function getRoleSelectOptions(store: DemoRolesStore) {
  return store.roles.map((role) => ({
    value: role.id,
    label: role.name,
  }));
}

export function getRoleNameById(store: DemoRolesStore, roleId: string) {
  return store.roles.find((role) => role.id === roleId)?.name ?? roleId;
}

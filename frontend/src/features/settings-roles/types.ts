export type DemoRolePermission = {
  id: string;
  label: string;
};

export type DemoRolePermissionGroup = {
  id: string;
  label: string;
  permissions: DemoRolePermission[];
};

export type DemoRoleRecord = {
  id: string;
  name: string;
  permissionIds: string[];
};

export type DemoRolesStore = {
  roles: DemoRoleRecord[];
};

"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { SettingsSectionsTabs } from "@/features/services-admin/components/settings-sections-tabs";
import {
  getInitialDemoRolesStore,
  ROLE_PERMISSION_GROUPS,
} from "@/features/settings-roles/storage";
import type { DemoRoleRecord, DemoRolesStore } from "@/features/settings-roles/types";
import {
  getInitialDemoEmployeesStore,
} from "@/features/settings-employees/storage";
import type { DemoEmployeesStore } from "@/features/settings-employees/types";
import {
  createRoleViaApi,
  deleteRoleViaApi,
  fetchPermissionGroups,
  fetchRolesStore,
  updateRoleViaApi,
} from "@/features/settings-roles/repository";
import { fetchEmployeesStore } from "@/features/settings-employees/repository";

type RoleModalState = {
  open: boolean;
  mode: "create" | "edit";
  roleId: string | null;
  name: string;
  permissionIds: string[];
  touched: boolean;
};

const CLOSED_MODAL: RoleModalState = {
  open: false,
  mode: "create",
  roleId: null,
  name: "",
  permissionIds: [],
  touched: false,
};

function formatUsersCount(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} пользователь`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${value} пользователя`;
  }

  return `${value} пользователей`;
}

function getRoleUsersCount(employeesStore: DemoEmployeesStore, roleId: string) {
  return employeesStore.employees.filter((employee) => employee.role === roleId).length;
}

export default function RolesSettingsPage() {
  const [rolesStore, setRolesStore] = useState<DemoRolesStore>(() =>
    getInitialDemoRolesStore(),
  );
  const [employeesStore, setEmployeesStore] = useState<DemoEmployeesStore>(() =>
    getInitialDemoEmployeesStore(),
  );
  const [permissionGroups, setPermissionGroups] =
    useState(ROLE_PERMISSION_GROUPS);
  const [modal, setModal] = useState<RoleModalState>(CLOSED_MODAL);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([fetchRolesStore(), fetchEmployeesStore(), fetchPermissionGroups()])
      .then(([nextRolesStore, nextEmployeesStore, groupsPayload]) => {
        setRolesStore(nextRolesStore);
        setEmployeesStore(nextEmployeesStore);
        setPermissionGroups(groupsPayload.groups);
      })
      .catch(() => undefined);
  }, []);

  const totalSelectedPermissions = modal.permissionIds.length;
  const normalizedRoleName = modal.name.trim();
  const canSaveRole = normalizedRoleName.length > 0 && totalSelectedPermissions > 0;

  const rolesWithCounts = useMemo(
    () =>
      rolesStore.roles.map((role) => ({
        ...role,
        usersCount: getRoleUsersCount(employeesStore, role.id),
      })),
    [employeesStore, rolesStore],
  );

  async function reloadStores() {
    const [nextRolesStore, nextEmployeesStore] = await Promise.all([
      fetchRolesStore(),
      fetchEmployeesStore(),
    ]);
    setRolesStore(nextRolesStore);
    setEmployeesStore(nextEmployeesStore);
  }

  function openCreateModal() {
    setNotice(null);
    setModal({
      open: true,
      mode: "create",
      roleId: null,
      name: "",
      permissionIds: [],
      touched: false,
    });
  }

  function openEditModal(role: DemoRoleRecord) {
    setNotice(null);
    setModal({
      open: true,
      mode: "edit",
      roleId: role.id,
      name: role.name,
      permissionIds: [...role.permissionIds],
      touched: false,
    });
  }

  function closeModal() {
    setModal(CLOSED_MODAL);
  }

  function togglePermission(permissionId: string) {
    setModal((current) => ({
      ...current,
      touched: true,
      permissionIds: current.permissionIds.includes(permissionId)
        ? current.permissionIds.filter((item) => item !== permissionId)
        : [...current.permissionIds, permissionId],
    }));
  }

  function toggleGroupPermissions(groupId: string, checked: boolean) {
    const group = permissionGroups.find((item) => item.id === groupId);

    if (!group) {
      return;
    }

    const groupPermissionIds = group.permissions.map((permission) => permission.id);

    setModal((current) => ({
      ...current,
      touched: true,
      permissionIds: checked
        ? Array.from(new Set([...current.permissionIds, ...groupPermissionIds]))
        : current.permissionIds.filter((item) => !groupPermissionIds.includes(item)),
    }));
  }

  async function saveRole() {
    if (!canSaveRole) {
      setModal((current) => ({ ...current, touched: true }));
      return;
    }

    if (modal.mode === "edit" && modal.roleId) {
      await updateRoleViaApi(modal.roleId, {
        name: normalizedRoleName,
        permissionIds: [...modal.permissionIds],
      });
    } else {
      await createRoleViaApi({
        name: normalizedRoleName,
        permissionIds: [...modal.permissionIds],
      });
    }

    await reloadStores();
    closeModal();
  }

  async function deleteRole(roleId: string, usersCount: number) {
    if (usersCount > 0) {
      setNotice("Нельзя удалить роль, пока к ней привязаны сотрудники.");
      return;
    }

    await deleteRoleViaApi(roleId);
    await reloadStores();
    setNotice(null);
  }

  return (
    <>
      <section className="max-w-[1220px] space-y-4">
        <div className="max-w-[1120px] bg-white">
          <SettingsSectionsTabs activeSection="Права доступа" />
        </div>

        <div className="max-w-[1120px] px-4 pt-2">
          <div className="space-y-1">
            {rolesWithCounts.map((role) => (
              <div
                key={role.id}
                className="flex min-h-11 items-center justify-between gap-4 border-b border-[color:var(--border)] py-2 text-[15px]"
              >
                <div className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[16px] text-[color:var(--foreground)]">
                    {role.name}
                  </span>
                  <span className="text-[13px] text-[color:var(--muted)]">
                    {formatUsersCount(role.usersCount)}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[color:var(--muted)]">
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center"
                    aria-label={`Редактировать роль ${role.name}`}
                    onClick={() => openEditModal(role)}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 w-8 items-center justify-center"
                    aria-label={`Удалить роль ${role.name}`}
                    onClick={() => deleteRole(role.id, role.usersCount)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {notice ? (
            <div className="mt-3 text-[13px] text-[#9a5b16]">{notice}</div>
          ) : null}

          <div className="mt-4">
            <button
              type="button"
              className="inline-flex h-9 items-center rounded-[4px] border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white"
              onClick={openCreateModal}
            >
              Добавить роль
            </button>
          </div>
        </div>
      </section>

      {modal.open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="w-full max-w-[620px] border border-[color:var(--border)] bg-white p-4 shadow-[0_12px_40px_rgba(15,23,42,0.14)]">
            <div className="flex items-center justify-between gap-4">
              <div className="text-[20px] font-medium text-[color:var(--foreground)]">
                {modal.mode === "edit"
                  ? "Редактирование группы пользователей"
                  : "Добавление группы пользователей"}
              </div>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center text-[color:var(--muted)]"
                onClick={closeModal}
                aria-label="Закрыть"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <label className="space-y-1.5">
                <span className="block text-[14px] font-medium">Название группы *</span>
                <input
                  value={modal.name}
                  onChange={(event) =>
                    setModal((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] outline-none"
                />
              </label>

              <div className="space-y-1.5">
                <div className="text-[14px] font-medium">
                  Права для пользователей группы *
                </div>
                <div className="text-[12px] text-[color:var(--muted)]">
                  Необходимо выбрать хотя бы одно право доступа
                </div>
              </div>

              <div className="h-[292px] overflow-y-auto border border-[color:var(--border)] px-3 py-3">
                <div className="space-y-4">
                  {permissionGroups.map((group) => {
                    const selectedInGroup = group.permissions.filter((permission) =>
                      modal.permissionIds.includes(permission.id),
                    ).length;
                    const allChecked =
                      selectedInGroup === group.permissions.length &&
                      group.permissions.length > 0;
                    const partiallyChecked =
                      selectedInGroup > 0 && selectedInGroup < group.permissions.length;

                    return (
                      <div key={group.id} className="space-y-2">
                        <label className="flex items-center gap-2 text-[14px] font-medium">
                          <input
                            type="checkbox"
                            checked={allChecked}
                            ref={(input) => {
                              if (input) {
                                input.indeterminate = partiallyChecked;
                              }
                            }}
                            onChange={(event) =>
                              toggleGroupPermissions(group.id, event.target.checked)
                            }
                            className="h-4 w-4 rounded-[3px] border border-[color:var(--border)] accent-[color:var(--primary)]"
                          />
                          <span>{group.label}</span>
                        </label>
                        <div className="space-y-1.5 pl-5">
                          {group.permissions.map((permission) => (
                            <label
                              key={permission.id}
                              className="flex items-center gap-2 text-[14px] text-[color:var(--foreground)]"
                            >
                              <input
                                type="checkbox"
                                checked={modal.permissionIds.includes(permission.id)}
                                onChange={() => togglePermission(permission.id)}
                                className="h-4 w-4 rounded-[3px] border border-[color:var(--border)] accent-[color:var(--primary)]"
                              />
                              <span>{permission.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {modal.touched && !canSaveRole ? (
                <div className="text-[12px] text-[#b45309]">
                  Укажите название группы и выберите хотя бы одно право доступа.
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="inline-flex h-10 items-center border border-[color:var(--border)] bg-white px-5 text-[14px]"
                onClick={closeModal}
              >
                Отмена
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                onClick={saveRole}
                disabled={!canSaveRole}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

import { redirect } from "next/navigation";
import type { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import {
  hashSessionToken,
  readSessionTokenFromCookies,
} from "@/server/auth/session";
import type { DemoAuthContext, DemoAuthSession } from "@/features/auth/types";
import { applyCanonicalBranchSummary } from "@/features/branches/canonical";
import {
  formatEmployeeDisplayName,
  formatEmployeeShortName,
} from "@/features/settings-employees/storage";
import type { DemoEmployeeRecord } from "@/features/settings-employees/types";
import { resolveStage1EmployeeSkillLevel } from "@/features/settings-employees/skill-level";
import type { DemoRoleRecord } from "@/features/settings-roles/types";
import { normalizeSystemRole } from "@/features/settings-roles/system-role";
import type { DemoBranchSummary } from "@/features/branches/types";

type ServerSessionRecord = Prisma.SessionGetPayload<{
  include: {
    user: true;
    currentBranch: true;
    employee: {
      include: {
        role: {
          include: {
            rolePermissions: true;
          };
        };
        branchAccesses: {
          include: {
            branch: true;
          };
        };
      };
    };
  };
}>;

function mapEmployee(record: ServerSessionRecord["employee"]): DemoEmployeeRecord {
  return {
    id: record.id,
    phone: record.phone,
    pin: "",
    lastName: record.lastName,
    firstName: record.firstName,
    middleName: record.middleName,
    role: record.roleId,
    hiredAt: record.hiredAt?.toISOString() ?? "",
    firedAt: record.firedAt?.toISOString() ?? null,
    lastActivityAt: record.lastActivityAt?.toISOString() ?? null,
    skillLevel: resolveStage1EmployeeSkillLevel(
      record.skillLevel,
      Number(record.workPercent),
    ),
    workPercent: Number(record.workPercent),
    shiftMinimum: Number(record.shiftMinimum),
    addMinimumToWorkPercent: record.addMinimumToWorkPercent,
    canBeAssignedExecutor: record.canBeAssignedExecutor,
  };
}

function mapRole(record: ServerSessionRecord["employee"]["role"]): DemoRoleRecord {
  return normalizeSystemRole({
    id: record.id,
    name: record.name,
    permissionIds: record.rolePermissions.map((item) => item.permissionId),
  });
}

function mapBranch(record: ServerSessionRecord["currentBranch"]): DemoBranchSummary {
  return applyCanonicalBranchSummary({
    id: record.id,
    code: record.code,
    name: record.name,
    displayName: record.displayName,
    address: record.address,
    phone: record.phone ?? null,
  });
}

export async function getServerSessionRecord() {
  const token = await readSessionTokenFromCookies();

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    include: {
      user: true,
      currentBranch: true,
      employee: {
        include: {
          role: {
            include: {
              rolePermissions: true,
            },
          },
          branchAccesses: {
            include: {
              branch: true,
            },
          },
        },
      },
    },
  });

  if (!session || session.expiresAt.getTime() < Date.now()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    }
    return null;
  }

  if (!session.user.isActive || session.employee.firedAt) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const currentBranchAccess = session.employee.branchAccesses.find(
    (access) =>
      access.branchId === session.currentBranchId &&
      access.canSwitchInto &&
      access.branch.isActive,
  );

  if (!session.currentBranch.isActive || !currentBranchAccess) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }

  const now = Date.now();
  if (now - session.lastSeenAt.getTime() > 60_000) {
    await prisma.session
      .update({
        where: { id: session.id },
        data: { lastSeenAt: new Date(now) },
      })
      .catch(() => undefined);
  }

  return session;
}

export async function getServerAuthContext(): Promise<DemoAuthContext | null> {
  const record = await getServerSessionRecord();

  if (!record) {
    return null;
  }

  const employee = mapEmployee(record.employee);
  const role = mapRole(record.employee.role);
  const accessibleBranches = record.employee.branchAccesses
    .filter((access) => access.canSwitchInto && access.branch.isActive)
    .map((access) => ({
      ...mapBranch(access.branch),
      isDefault: access.isDefault,
    }));
  const session: DemoAuthSession = {
    currentEmployeeId: record.employeeId,
    signedInAt: record.createdAt.toISOString(),
    phoneSnapshot: record.employee.phone,
    roleIdSnapshot: record.roleIdSnapshot,
    currentBranchId: record.currentBranchId,
  };

  return {
    session,
    employee,
    role,
    permissionIds: role.permissionIds,
    employeeLabel: formatEmployeeShortName(employee),
    employeeDisplayLabel: formatEmployeeDisplayName(employee),
    roleLabel: role.name,
    currentBranch: mapBranch(record.currentBranch),
    availableBranches: accessibleBranches.map(({ ...branch }) => branch),
  };
}

export async function requireServerAuthContext() {
  const context = await getServerAuthContext();

  if (!context) {
    redirect("/login");
  }

  return context;
}

export function hasServerPermission(context: DemoAuthContext | null, permissionId: string | null) {
  if (!permissionId) {
    return true;
  }

  return Boolean(context?.permissionIds.includes(permissionId));
}

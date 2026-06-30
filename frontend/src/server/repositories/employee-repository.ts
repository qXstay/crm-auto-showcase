import { randomUUID } from "node:crypto";
import { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import { hashPasswordOrPin } from "@/server/auth/password";
import type {
  DemoEmployeeHardDeleteState,
  DemoEmployeeRecord,
  DemoEmployeesStore,
} from "@/features/settings-employees/types";
import { isEmployeeSkillLevel, resolveStage1EmployeeSkillLevel } from "@/features/settings-employees/skill-level";

export class EmployeeUpdateDomainError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "EmployeeUpdateDomainError";
    this.status = status;
  }
}

export class EmployeeCreateDomainError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "EmployeeCreateDomainError";
    this.status = status;
  }
}

export class EmployeeDeleteDomainError extends Error {
  status: number;

  constructor(message: string, status = 409) {
    super(message);
    this.name = "EmployeeDeleteDomainError";
    this.status = status;
  }
}

const HARD_DELETE_SUGGESTION =
  "Используйте «Уволить сотрудника», чтобы скрыть его из рабочего списка без повреждения истории.";

function normalizeEmployeePhoneDigits(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))
    ? digits.slice(1)
    : digits.length > 10
      ? digits.slice(-10)
      : digits;
}

function formatEmployeePhoneFromDigits(normalized: string) {
  const first = normalized.slice(0, 3);
  const second = normalized.slice(3, 6);
  const third = normalized.slice(6, 8);
  const fourth = normalized.slice(8, 10);

  return `+7 ${first}${second ? ` ${second}` : ""}${third ? `-${third}` : ""}${fourth ? `-${fourth}` : ""}`.trim();
}

function normalizeEmployeePhone(value: string) {
  const normalized = normalizeEmployeePhoneDigits(value);

  return formatEmployeePhoneFromDigits(normalized);
}

function isValidEmployeePhoneDigits(value: string) {
  return /^9\d{9}$/.test(value);
}

async function findConflictingUser(
  tx: Prisma.TransactionClient,
  input: { phone: string; login: string; excludeUserId?: string | null },
) {
  return tx.user.findFirst({
    where: {
      OR: [{ phone: input.phone }, { login: input.login }],
      ...(input.excludeUserId ? { NOT: { id: input.excludeUserId } } : {}),
    },
    select: { id: true },
  });
}

function parseEmployeeFullName(value: string) {
  const parts = value
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { firstName: "", lastName: "", middleName: "" };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
      middleName: "",
    };
  }

  return {
    lastName: parts[0],
    firstName: parts[1],
    middleName: parts.slice(2).join(" "),
  };
}

type EmployeeMapRecord = {
  id: string;
  userId?: string | null;
  phone: string;
  firstName: string;
  lastName: string;
  middleName: string;
  roleId: string;
  hiredAt: Date | null;
  firedAt: Date | null;
  lastActivityAt: Date | null;
  skillLevel?: string | null;
  workPercent: { toString(): string };
  shiftMinimum: { toString(): string };
  addMinimumToWorkPercent: boolean;
  canBeAssignedExecutor: boolean;
  role?: {
    rolePermissions?: Array<{ permissionId: string }>;
  };
  user?: {
    id: string;
    isActive: boolean;
    _count?: {
      sessions: number;
      auditEvents: number;
    };
  } | null;
  branchAccesses?: Array<{
    branchId: string;
    isDefault: boolean;
    canSwitchInto: boolean;
    canOperate: boolean;
  }>;
  _count?: {
    sessions: number;
    auditEvents: number;
    openedShifts: number;
    shiftStaff: number;
    executedOrders: number;
    createdBookings: number;
  };
};

type EmployeeHardDeleteContext = {
  currentEmployeeId?: string | null;
  activeSettingsEmployeesCount?: number;
};

function hasSettingsEmployeesPermission(record: EmployeeMapRecord) {
  return Boolean(
    record.role?.rolePermissions?.some(
      (permission) => permission.permissionId === "settings.employees",
    ),
  );
}

function isActiveSettingsEmployee(record: EmployeeMapRecord) {
  return (
    !record.firedAt &&
    record.user?.isActive === true &&
    hasSettingsEmployeesPermission(record)
  );
}

function buildHardDeleteState(
  record: EmployeeMapRecord,
  context: EmployeeHardDeleteContext = {},
): DemoEmployeeHardDeleteState | undefined {
  if (!record._count) {
    return undefined;
  }

  let reason: string | null = null;

  if (context.currentEmployeeId && record.id === context.currentEmployeeId) {
    reason = "Нельзя физически удалить текущего вошедшего пользователя.";
  }

  if (!reason && isActiveSettingsEmployee(record) && (context.activeSettingsEmployeesCount ?? 0) <= 1) {
    reason = "Нельзя удалить последнего активного сотрудника с доступом к настройкам сотрудников.";
  }

  const linkedAreas = [
    record._count.sessions > 0 || (record.user?._count?.sessions ?? 0) > 0
      ? "есть сессии входа"
      : null,
    record._count.auditEvents > 0 || (record.user?._count?.auditEvents ?? 0) > 0
      ? "есть записи аудита"
      : null,
    record._count.openedShifts > 0 || record._count.shiftStaff > 0
      ? "есть связи со сменами"
      : null,
    record._count.executedOrders > 0 ? "есть назначенные заказы" : null,
    record._count.createdBookings > 0 ? "есть созданные записи" : null,
    record.lastActivityAt ? "есть история активности" : null,
  ].filter((item): item is string => Boolean(item));

  if (!reason && linkedAreas.length > 0) {
    reason = `Физическое удаление недоступно: ${linkedAreas.join(", ")}.`;
  }

  return {
    canDelete: !reason,
    reason,
    suggestion: reason ? HARD_DELETE_SUGGESTION : null,
  };
}

function mapEmployee(record: {
  id: string;
  phone: string;
  firstName: string;
  lastName: string;
  middleName: string;
  roleId: string;
  hiredAt: Date | null;
  firedAt: Date | null;
  lastActivityAt: Date | null;
  skillLevel?: string | null;
  workPercent: { toString(): string };
  shiftMinimum: { toString(): string };
  addMinimumToWorkPercent: boolean;
  canBeAssignedExecutor: boolean;
  branchAccesses?: Array<{
    branchId: string;
    isDefault: boolean;
    canSwitchInto: boolean;
    canOperate: boolean;
  }>;
} & Partial<EmployeeMapRecord>, context: EmployeeHardDeleteContext = {}): DemoEmployeeRecord {
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
      Number(record.workPercent.toString()),
    ),
    workPercent: Number(record.workPercent.toString()),
    shiftMinimum: Number(record.shiftMinimum.toString()),
    addMinimumToWorkPercent: record.addMinimumToWorkPercent,
    canBeAssignedExecutor: record.canBeAssignedExecutor,
    branchAccesses: record.branchAccesses?.map((access) => ({
      branchId: access.branchId,
      isDefault: access.isDefault,
      canSwitchInto: access.canSwitchInto,
    })),
    hardDelete: buildHardDeleteState(record as EmployeeMapRecord, context),
  };
}

async function countActiveSettingsEmployees(tx: Prisma.TransactionClient | typeof prisma) {
  return tx.employee.count({
    where: {
      firedAt: null,
      user: { isActive: true },
      role: {
        rolePermissions: {
          some: { permissionId: "settings.employees" },
        },
      },
    },
  });
}

const EMPLOYEE_DETAIL_INCLUDE = {
  branchAccesses: true,
  role: {
    include: {
      rolePermissions: true,
    },
  },
  user: {
    include: {
      _count: {
        select: {
          sessions: true,
          auditEvents: true,
        },
      },
    },
  },
  _count: {
    select: {
      sessions: true,
      auditEvents: true,
      openedShifts: true,
      shiftStaff: true,
      executedOrders: true,
      createdBookings: true,
    },
  },
} satisfies Prisma.EmployeeInclude;

export async function listEmployees(
  context: Pick<EmployeeHardDeleteContext, "currentEmployeeId"> = {},
): Promise<DemoEmployeesStore> {
  const [employees, activeSettingsEmployeesCount] = await Promise.all([
    prisma.employee.findMany({
      include: EMPLOYEE_DETAIL_INCLUDE,
      orderBy: [{ firedAt: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
    }),
    countActiveSettingsEmployees(prisma),
  ]);

  return {
    employees: employees.map((employee) =>
      mapEmployee(employee, {
        ...context,
        activeSettingsEmployeesCount,
      }),
    ),
  };
}

export async function getEmployeeById(
  employeeId: string,
  context: Pick<EmployeeHardDeleteContext, "currentEmployeeId"> = {},
) {
  const [employee, activeSettingsEmployeesCount] = await Promise.all([
    prisma.employee.findUnique({
      where: { id: employeeId },
      include: EMPLOYEE_DETAIL_INCLUDE,
    }),
    countActiveSettingsEmployees(prisma),
  ]);

  return employee
    ? mapEmployee(employee, {
        ...context,
        activeSettingsEmployeesCount,
      })
    : null;
}

export async function createEmployee(input: {
  phone: string;
  pin: string;
  roleId: string;
  branchId: string;
  fullName: string;
  skillLevel?: string;
  workPercent?: number;
  shiftMinimum?: number;
  addMinimumToWorkPercent?: boolean;
  canBeAssignedExecutor?: boolean;
}) {
  const id = `employee-${Date.now()}`;
  const userId = randomUUID();
  const pinHash = await hashPasswordOrPin(input.pin);
  const normalizedPhoneDigits = normalizeEmployeePhoneDigits(input.phone);
  const phone = normalizeEmployeePhone(input.phone);
  const login = normalizedPhoneDigits;
  const fullName = parseEmployeeFullName(input.fullName);

  if (!isValidEmployeePhoneDigits(normalizedPhoneDigits)) {
    throw new EmployeeCreateDomainError(
      "Укажите корректный рабочий телефон: 10 цифр после +7, начиная с 9.",
    );
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const defaultBranch = await tx.branch.findFirst({
        where: {
          id: input.branchId,
          isActive: true,
        },
        select: { id: true },
      });

      if (!defaultBranch) {
        throw new EmployeeCreateDomainError(
          "Не удалось определить рабочий филиал для нового сотрудника.",
          400,
        );
      }

      const conflictingUser = await findConflictingUser(tx, {
        phone,
        login,
      });

      if (conflictingUser) {
        throw new EmployeeCreateDomainError("Сотрудник с таким телефоном уже существует.", 409);
      }

      await tx.user.create({
        data: {
          id: userId,
          phone,
          login,
          pinHash,
        },
      });

      const employee = await tx.employee.create({
        data: {
          id,
          userId,
          phone,
          firstName: fullName.firstName,
          lastName: fullName.lastName,
          middleName: fullName.middleName,
          roleId: input.roleId,
          hiredAt: new Date(),
          skillLevel: input.skillLevel ?? "level_1",
          workPercent: input.workPercent ?? 35,
          shiftMinimum: input.shiftMinimum ?? 0,
          addMinimumToWorkPercent: input.addMinimumToWorkPercent ?? false,
          canBeAssignedExecutor: input.canBeAssignedExecutor ?? true,
        },
      });

      await tx.employeeBranchAccess.create({
        data: {
          employeeId: employee.id,
          branchId: defaultBranch.id,
          isDefault: true,
          canOperate: true,
          canSwitchInto: true,
        },
      });

      return mapEmployee(employee);
    });
  } catch (error) {
    if (error instanceof EmployeeCreateDomainError) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new EmployeeCreateDomainError("Сотрудник с таким телефоном уже существует.", 409);
      }
    }

    throw error;
  }
}

export async function updateEmployee(
  employeeId: string,
  input: Partial<DemoEmployeeRecord> & { pin?: string | null },
) {
  const nextPin = input.pin?.trim() ?? "";
  const nextPinHash = nextPin ? await hashPasswordOrPin(nextPin) : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const currentEmployee = await tx.employee.findUnique({
        where: { id: employeeId },
        include: { user: true },
      });

      if (!currentEmployee) {
        throw new EmployeeUpdateDomainError("Сотрудник не найден.", 404);
      }

      const hasLinkedUser = Boolean(currentEmployee.user);
      const phoneWasProvided = input.phone !== undefined;
      const trimmedPhone = input.phone?.trim() ?? "";
      const normalizedPhoneDigits = phoneWasProvided
        ? normalizeEmployeePhoneDigits(trimmedPhone)
        : normalizeEmployeePhoneDigits(currentEmployee.phone);
      const normalizedPhone =
        phoneWasProvided && trimmedPhone ? formatEmployeePhoneFromDigits(normalizedPhoneDigits) : null;

      if (phoneWasProvided && trimmedPhone && !isValidEmployeePhoneDigits(normalizedPhoneDigits)) {
        throw new EmployeeUpdateDomainError(
          "Укажите корректный рабочий телефон: 10 цифр после +7, начиная с 9.",
        );
      }

      const shouldNormalizeLegacyUser = !hasLinkedUser && nextPin.length > 0;

      if (shouldNormalizeLegacyUser) {
        if (!normalizedPhone || !isValidEmployeePhoneDigits(normalizedPhoneDigits)) {
          throw new EmployeeUpdateDomainError(
            "Чтобы сохранить PIN для входа, укажите корректный рабочий телефон сотрудника.",
          );
        }

        const conflictingUser = await findConflictingUser(tx, {
          phone: normalizedPhone,
          login: normalizedPhoneDigits,
        });

        if (conflictingUser) {
          throw new EmployeeUpdateDomainError("Сотрудник с таким телефоном уже существует.", 409);
        }
      } else if (hasLinkedUser && phoneWasProvided && normalizedPhone) {
        const conflictingUser = await findConflictingUser(tx, {
          phone: normalizedPhone,
          login: normalizedPhoneDigits,
          excludeUserId: currentEmployee.user!.id,
        });

        if (conflictingUser) {
          throw new EmployeeUpdateDomainError("Сотрудник с таким телефоном уже существует.", 409);
        }
      }

      const employeeData = {
        phone: phoneWasProvided && normalizedPhone ? normalizedPhone : undefined,
        lastName: input.lastName?.trim(),
        firstName: input.firstName?.trim(),
        middleName: input.middleName?.trim(),
        roleId: input.role || undefined,
        firedAt:
          input.firedAt === undefined
            ? undefined
            : input.firedAt
              ? new Date(input.firedAt)
              : null,
        skillLevel:
          input.skillLevel === undefined
            ? undefined
            : isEmployeeSkillLevel(input.skillLevel)
              ? input.skillLevel
              : null,
        workPercent:
          input.workPercent === undefined ? undefined : Number(input.workPercent),
        shiftMinimum:
          input.shiftMinimum === undefined ? undefined : Number(input.shiftMinimum),
        addMinimumToWorkPercent:
          input.addMinimumToWorkPercent === undefined
            ? undefined
            : input.addMinimumToWorkPercent,
        canBeAssignedExecutor:
          input.canBeAssignedExecutor === undefined
            ? undefined
            : input.canBeAssignedExecutor,
      };

      if (shouldNormalizeLegacyUser) {
        const userId = randomUUID();

        await tx.user.create({
          data: {
            id: userId,
            phone: normalizedPhone!,
            login: normalizedPhoneDigits,
            pinHash: nextPinHash!,
          },
        });

        const employee = await tx.employee.update({
          where: { id: employeeId },
          data: {
            ...employeeData,
            userId,
          },
        });

        return mapEmployee(employee);
      }

      const employee = await tx.employee.update({
        where: { id: employeeId },
        data: employeeData,
        include: {
          branchAccesses: true,
        },
      });

      if (input.branchAccesses && input.branchAccesses.length > 0) {
        // Sync branch access records
        await tx.employeeBranchAccess.deleteMany({
          where: { employeeId },
        });

        await tx.employeeBranchAccess.createMany({
          data: input.branchAccesses.map((access) => ({
            employeeId,
            branchId: access.branchId,
            isDefault: access.isDefault,
            canOperate: true,
            canSwitchInto: access.canSwitchInto,
          })),
        });
      }

      if (hasLinkedUser) {
        const userData: {
          phone?: string;
          login?: string;
          pinHash?: string;
        } = {};

        if (phoneWasProvided && normalizedPhone) {
          userData.phone = normalizedPhone;
          userData.login = normalizedPhoneDigits;
        }

        if (nextPinHash) {
          userData.pinHash = nextPinHash;
        }

        if (Object.keys(userData).length > 0) {
          await tx.user.update({
            where: { id: currentEmployee.user!.id },
            data: userData,
          });
        }
      }

      return mapEmployee(employee);
    });
  } catch (error) {
    if (error instanceof EmployeeUpdateDomainError) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        throw new EmployeeUpdateDomainError("Сотрудник с таким телефоном уже существует.", 409);
      }

      if (error.code === "P2025") {
        throw new EmployeeUpdateDomainError("Сотрудник не найден.", 404);
      }
    }

    throw error;
  }
}

export async function deleteEmployeeIfSafe(
  employeeId: string,
  context: Pick<EmployeeHardDeleteContext, "currentEmployeeId"> = {},
) {
  try {
    return await prisma.$transaction(async (tx) => {
      const [employee, activeSettingsEmployeesCount] = await Promise.all([
        tx.employee.findUnique({
          where: { id: employeeId },
          include: EMPLOYEE_DETAIL_INCLUDE,
        }),
        countActiveSettingsEmployees(tx),
      ]);

      if (!employee) {
        throw new EmployeeDeleteDomainError("Сотрудник не найден.", 404);
      }

      const hardDelete = buildHardDeleteState(employee, {
        ...context,
        activeSettingsEmployeesCount,
      });

      if (!hardDelete?.canDelete) {
        throw new EmployeeDeleteDomainError(
          [hardDelete?.reason, hardDelete?.suggestion].filter(Boolean).join(" "),
          409,
        );
      }

      const userId = employee.userId;

      await tx.employeeBranchAccess.deleteMany({
        where: { employeeId },
      });

      await tx.employee.delete({
        where: { id: employeeId },
      });

      if (userId) {
        await tx.user.delete({
          where: { id: userId },
        });
      }

      return {
        employeeId,
        userId,
      };
    });
  } catch (error) {
    if (error instanceof EmployeeDeleteDomainError) {
      throw error;
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        throw new EmployeeDeleteDomainError("Сотрудник не найден.", 404);
      }

      if (error.code === "P2003") {
        throw new EmployeeDeleteDomainError(
          `Физическое удаление недоступно: есть связанные данные. ${HARD_DELETE_SUGGESTION}`,
          409,
        );
      }
    }

    throw error;
  }
}

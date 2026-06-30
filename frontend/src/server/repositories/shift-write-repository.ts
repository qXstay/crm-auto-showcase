import { randomUUID } from "node:crypto";
import { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import { resolveStage1EmployeeSkillLevel } from "@/features/settings-employees/skill-level";
import { logAuditEvent } from "@/server/services/audit";
import { getShiftCurrentState } from "@/server/repositories/shift-read-repository";
import {
  decimalToNumber,
  formatPaymentDisplay,
  formatPrice,
  formatShiftLabel,
  parseJsonValue,
} from "@/server/repositories/operational-utils";
import type { DemoShiftExpenseItem, DemoShiftStaffOption } from "@/features/shifts/types";

type ShiftEmployeeAccessRecord = Prisma.EmployeeBranchAccessGetPayload<{
  include: {
    employee: true;
  };
}>;

export type ShiftStaffAttendanceAction = "arrived" | "left";

const STAGE22_D9A_CALCULATION_SOURCE = "stage2.2-d9a-payout-materialization";
const MAX_SHIFT_STAFF_MEMBERS = 5;

function toDecimal(value: number | null | undefined) {
  return value === null || value === undefined ? null : new Prisma.Decimal(value);
}

function toJsonValue(value: Prisma.InputJsonValue | null | undefined) {
  return value === null || value === undefined ? Prisma.JsonNull : value;
}

function isWriteConflictError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

async function runShiftWriteTransaction<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
) {
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await prisma.$transaction(
        async (tx) => callback(tx),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (!isWriteConflictError(error) || attempt === maxAttempts) {
        throw error;
      }
    }
  }

  throw new Error("Не удалось завершить запись смены.");
}

function formatShiftEmployeeLabel(employee: {
  firstName: string;
  lastName: string;
  phone: string;
}) {
  const lastName = employee.lastName.trim();
  const firstName = employee.firstName.trim();

  if (lastName && firstName) {
    const lastLetter = lastName.replace(".", "").trim().charAt(0);

    if (lastLetter) {
      return `${firstName} ${lastLetter.toUpperCase()}.`;
    }
  }

  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  return fullName || employee.phone || "Сотрудник";
}

function formatStaffLabel(records: ShiftEmployeeAccessRecord[]) {
  return records.length > 0
    ? records.map((record) => formatShiftEmployeeLabel(record.employee)).join(", ")
    : "—";
}

function buildShiftStaffSnapshotData(
  record: ShiftEmployeeAccessRecord,
  override: { shiftMinimum?: number } | undefined,
) {
  const shiftMinimum =
    override?.shiftMinimum !== undefined
      ? override.shiftMinimum
      : decimalToNumber(record.employee.shiftMinimum) ?? 0;

  return {
    employeeId: record.employeeId,
    employeeNameSnapshot: formatShiftEmployeeLabel(record.employee),
    workPercentSnapshot: toDecimal(decimalToNumber(record.employee.workPercent) ?? 0),
    shiftMinimumSnapshot: toDecimal(shiftMinimum),
    skillLevelSnapshot: resolveStage1EmployeeSkillLevel(
      record.employee.skillLevel,
      decimalToNumber(record.employee.workPercent) ?? 0,
    ),
  };
}

async function resolveShiftEmployees(
  tx: Prisma.TransactionClient,
  branchId: string,
  employeeIds: string[],
) {
  const uniqueIds = [...new Set(employeeIds.filter(Boolean))];

  if (uniqueIds.length === 0) {
    throw new Error("Выберите хотя бы одного сотрудника смены.");
  }

  if (uniqueIds.length > MAX_SHIFT_STAFF_MEMBERS) {
    throw new Error(`В смену можно назначить не более ${MAX_SHIFT_STAFF_MEMBERS} сотрудников.`);
  }

  const records = await tx.employeeBranchAccess.findMany({
    where: {
      branchId,
      canOperate: true,
      employeeId: { in: uniqueIds },
      employee: {
        canBeAssignedExecutor: true,
        firedAt: null,
      },
    },
    include: {
      employee: true,
    },
  });

  const byId = new Map(records.map((record) => [record.employeeId, record]));
  const ordered = uniqueIds
    .map((employeeId) => byId.get(employeeId))
    .filter((record): record is ShiftEmployeeAccessRecord => Boolean(record));

  if (ordered.length === 0) {
    throw new Error("Не удалось определить сотрудников для смены.");
  }

  return ordered;
}

function buildSummaryFromOrders(input: {
  orders: Array<{
    status: string;
    totalAmount: Prisma.Decimal;
    salaryAccrualTotal: Prisma.Decimal | null;
    paymentSnapshotJson: Prisma.JsonValue | null;
    payments?: Array<{ amount: Prisma.Decimal }>;
  }>;
  expensesItems: DemoShiftExpenseItem[];
}) {
  const paidOrders = input.orders.filter((order) => {
    const payment = parseJsonValue<{ paymentStatus?: string | null }>(
      order.paymentSnapshotJson,
      {},
    );

    return (order.payments?.length ?? 0) > 0 || payment.paymentStatus === "Оплачен";
  });
  const expensesTotal = input.expensesItems.reduce((total, item) => total + item.amount, 0);
  const accountBreakdownMap = new Map<string, { accountId: string; accountName: string; amount: number; isArchived: boolean }>();

  let revenueTotal = 0;
  let cashTotal = 0;
  let cashlessTotal = 0;
  let salaryFundTotal: number | null = 0;

  for (const order of paidOrders) {
    const paymentRowsTotal = (order.payments ?? []).reduce(
      (total, payment) => total + (decimalToNumber(payment.amount) ?? 0),
      0,
    );
    const salaryAmount = decimalToNumber(order.salaryAccrualTotal);
    const payment = parseJsonValue<{
      paymentMethod?: string | null;
      accountId?: string | null;
      accountNameSnapshot?: string | null;
      paymentLabel?: string | null;
      paidAmount?: number | null;
    }>(order.paymentSnapshotJson, {});
    const amount =
      paymentRowsTotal > 0
        ? paymentRowsTotal
        : typeof payment.paidAmount === "number" && payment.paidAmount > 0
          ? payment.paidAmount
          : decimalToNumber(order.totalAmount) ?? 0;
    const paymentMethod = payment.paymentMethod ?? null;
    const accountId = payment.accountId ?? paymentMethod ?? "unknown";
    const accountName =
      payment.accountNameSnapshot ?? formatPaymentDisplay(payment) ?? "Не указан";

    revenueTotal += amount;
    if (salaryFundTotal !== null) {
      salaryFundTotal = salaryAmount === null ? null : salaryFundTotal + salaryAmount;
    }

    if (paymentMethod === "cash") {
      cashTotal += amount;
    } else {
      cashlessTotal += amount;
    }

    const existing = accountBreakdownMap.get(accountId);

    if (existing) {
      existing.amount += amount;
      continue;
    }

    accountBreakdownMap.set(accountId, {
      accountId,
      accountName,
      amount,
      isArchived: false,
    });
  }

  return {
    ordersCount: paidOrders.length,
    revenueTotal,
    cashTotal,
    cashlessTotal,
    expensesTotal,
    salaryFundTotal,
    accountBreakdown: [...accountBreakdownMap.values()],
  };
}

function toMoneyCents(value: Prisma.Decimal | null | undefined) {
  const numberValue = decimalToNumber(value);

  return numberValue === null ? null : Math.round(numberValue * 100);
}

async function assertD9PayrollPayoutConsistencyForShift(
  tx: Prisma.TransactionClient,
  shiftId: string,
) {
  const accruals = await tx.orderPayrollAccrual.findMany({
    where: {
      shiftId,
      status: "supported",
    },
    select: {
      id: true,
      salaryFundAmount: true,
      calculationSnapshotJson: true,
      payouts: {
        select: {
          amount: true,
        },
      },
    },
  });

  for (const accrual of accruals) {
    const snapshot = parseJsonValue<{ source?: string | null }>(
      accrual.calculationSnapshotJson,
      {},
    );

    if (snapshot.source !== STAGE22_D9A_CALCULATION_SOURCE) {
      continue;
    }

    const expectedCents = toMoneyCents(accrual.salaryFundAmount);

    if (expectedCents === null || expectedCents <= 0) {
      continue;
    }

    if (accrual.payouts.length === 0) {
      throw new Error(
        "Нельзя закрыть смену: по одной из Stage 2.2 выплат нет материализованных строк исполнителей.",
      );
    }

    const actualCents = accrual.payouts.reduce(
      (sum, payout) => sum + (toMoneyCents(payout.amount) ?? 0),
      0,
    );

    if (actualCents !== expectedCents) {
      throw new Error(
        "Нельзя закрыть смену: сумма материализованных выплат Stage 2.2 не совпадает с фондом начисления.",
      );
    }
  }
}

async function getOpenShiftRecord(
  tx: Prisma.TransactionClient,
  branchId: string,
  shiftId: string,
) {
  const shift = await tx.shift.findFirst({
    where: {
      id: shiftId,
      branchId,
      status: "open",
    },
    include: {
      staff: {
        include: {
          employee: true,
        },
      },
      orders: {
        include: {
          payments: true,
        },
      },
    },
  });

  if (!shift) {
    throw new Error("Активная смена не найдена.");
  }

  return shift;
}

export async function syncShiftStaffRowsForShift(
  tx: Prisma.TransactionClient,
  input: {
    branchId: string;
    shift: {
      id: string;
      staff: Array<{
        id: string;
        employeeId: string | null;
      }>;
    };
    employees: Array<{ id: string; shiftMinimum?: number }>;
  },
) {
  const originalStaffRows = [...input.shift.staff];
  const staffRecords = await resolveShiftEmployees(
    tx,
    input.branchId,
    input.employees.map((employee) => employee.id),
  );
  const staffLabel = formatStaffLabel(staffRecords);
  const existingRowsByEmployeeId = new Map<
    string,
    Array<{ id: string; employeeId: string | null }>
  >();

  originalStaffRows.forEach((member) => {
    if (!member.employeeId) {
      return;
    }

    const rows = existingRowsByEmployeeId.get(member.employeeId) ?? [];
    rows.push(member);
    existingRowsByEmployeeId.set(member.employeeId, rows);
  });

  const preservedRowIds = new Set<string>();

  await tx.shift.update({
    where: { id: input.shift.id },
    data: {
      staffLabelSnapshot: staffLabel,
    },
  });

  for (const record of staffRecords) {
    const override = input.employees.find((employee) => employee.id === record.employeeId);
    const snapshotData = buildShiftStaffSnapshotData(record, override);
    const existingRows = existingRowsByEmployeeId.get(record.employeeId) ?? [];
    const existing = existingRows.shift();

    if (existing) {
      preservedRowIds.add(existing.id);
      await tx.shiftStaff.update({
        where: { id: existing.id },
        data: snapshotData,
      });
      continue;
    }

    await tx.shiftStaff.create({
      data: {
        id: `shift-staff-${randomUUID()}`,
        shiftId: input.shift.id,
        ...snapshotData,
      },
    });
  }

  const removedStaffIds = originalStaffRows
    .filter((member) => !preservedRowIds.has(member.id))
    .map((member) => member.id);

  if (removedStaffIds.length > 0) {
    await tx.shiftStaff.deleteMany({
      where: {
        id: { in: removedStaffIds },
      },
    });
  }

  return {
    staffLabel,
  };
}

export async function markShiftStaffAttendanceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    branchId: string;
    shiftId: string;
    employeeId?: string | null;
    shiftStaffId?: string | null;
    action: ShiftStaffAttendanceAction;
    markedAt?: Date;
  },
) {
  if (!input.employeeId && !input.shiftStaffId) {
    throw new Error("Передайте сотрудника смены для отметки.");
  }

  const shift = await tx.shift.findFirst({
    where: {
      id: input.shiftId,
      branchId: input.branchId,
    },
    select: {
      id: true,
      status: true,
      staff: {
        select: {
          id: true,
          employeeId: true,
          employeeNameSnapshot: true,
          arrivedAt: true,
          leftAt: true,
        },
      },
    },
  });

  if (!shift) {
    throw new Error("Смена не найдена.");
  }

  if (shift.status !== "open") {
    throw new Error("Отметки доступны только в открытой смене.");
  }

  const staffMember = input.shiftStaffId
    ? shift.staff.find((member) => member.id === input.shiftStaffId)
    : shift.staff.find((member) => member.employeeId === input.employeeId);

  if (!staffMember) {
    throw new Error("Сотрудник не найден в составе смены.");
  }

  const markedAt = input.markedAt ?? new Date();

  if (input.action === "arrived") {
    if (staffMember.arrivedAt && staffMember.leftAt) {
      throw new Error("Сотрудник уже был отмечен как ушедший в этой смене. Повторный приход пока не поддерживается.");
    }

    if (staffMember.arrivedAt) {
      throw new Error("Приход уже отмечен.");
    }

    await tx.shiftStaff.update({
      where: { id: staffMember.id },
      data: { arrivedAt: markedAt },
    });

    return {
      shiftId: shift.id,
      shiftStaffId: staffMember.id,
      employeeId: staffMember.employeeId,
      employeeName: staffMember.employeeNameSnapshot,
      action: input.action,
      markedAt: markedAt.toISOString(),
    };
  }

  if (!staffMember.arrivedAt) {
    throw new Error("Нельзя отметить уход до прихода.");
  }

  if (staffMember.leftAt) {
    throw new Error("Уход уже отмечен.");
  }

  await tx.shiftStaff.update({
    where: { id: staffMember.id },
    data: { leftAt: markedAt },
  });

  return {
    shiftId: shift.id,
    shiftStaffId: staffMember.id,
    employeeId: staffMember.employeeId,
    employeeName: staffMember.employeeNameSnapshot,
    action: input.action,
    markedAt: markedAt.toISOString(),
  };
}

export async function listShiftAssignableEmployees(branchId: string): Promise<DemoShiftStaffOption[]> {
  const records = await prisma.employeeBranchAccess.findMany({
    where: {
      branchId,
      canOperate: true,
      employee: {
        canBeAssignedExecutor: true,
        firedAt: null,
      },
    },
    include: {
      employee: true,
    },
    orderBy: [
      { isDefault: "desc" },
      { employee: { lastName: "asc" } },
      { employee: { firstName: "asc" } },
    ],
  });

  return records.map((record) => ({
    id: record.employeeId,
    label: formatShiftEmployeeLabel(record.employee),
    skillLevel: resolveStage1EmployeeSkillLevel(
      record.employee.skillLevel,
      decimalToNumber(record.employee.workPercent) ?? 0,
    ),
    workPercent: decimalToNumber(record.employee.workPercent) ?? 0,
    shiftMinimum: decimalToNumber(record.employee.shiftMinimum) ?? 0,
  }));
}

export async function openShiftForBranch(input: {
  branchId: string;
  actorEmployeeId: string;
  actorUserId?: string | null;
  employees: Array<{ id: string; shiftMinimum?: number }>;
}) {
  const result = await runShiftWriteTransaction(async (tx) => {
    const existingOpenShift = await tx.shift.findFirst({
      where: { branchId: input.branchId, status: "open" },
      select: { id: true },
      orderBy: { openedAt: "desc" },
    });

    if (existingOpenShift) {
      return {
        shiftId: existingOpenShift.id,
        created: false,
        number: null,
        openedAt: null,
        staffLabel: null,
      };
    }

    const staffRecords = await resolveShiftEmployees(
      tx,
      input.branchId,
      input.employees.map((e) => e.id),
    );
    const maxShift = await tx.shift.findFirst({
      where: { branchId: input.branchId },
      orderBy: { number: "desc" },
      select: { number: true },
    });
    const now = new Date();
    const nextNumber = (maxShift?.number ?? 0) + 1;
    const shiftId = `shift-${randomUUID()}`;
    const staffLabel = formatStaffLabel(staffRecords);

    await tx.shift.create({
      data: {
        id: shiftId,
        branchId: input.branchId,
        number: nextNumber,
        status: "open",
        openedAt: now,
        openedByEmployeeId: input.actorEmployeeId,
        staffLabelSnapshot: staffLabel,
        expensesItemsJson: [],
        accountBreakdownSnapshotJson: [],
      },
    });

    await tx.shiftStaff.createMany({
      data: staffRecords.map((record) => {
        const override = input.employees.find((e) => e.id === record.employeeId);
        const shiftMinimum =
          override?.shiftMinimum !== undefined
            ? override.shiftMinimum
            : decimalToNumber(record.employee.shiftMinimum) ?? 0;

        return {
          id: `shift-staff-${randomUUID()}`,
          shiftId,
          employeeId: record.employeeId,
          employeeNameSnapshot: formatShiftEmployeeLabel(record.employee),
          workPercentSnapshot: toDecimal(decimalToNumber(record.employee.workPercent) ?? 0),
          shiftMinimumSnapshot: toDecimal(shiftMinimum),
          skillLevelSnapshot: resolveStage1EmployeeSkillLevel(
            record.employee.skillLevel,
            decimalToNumber(record.employee.workPercent) ?? 0,
          ),
        };
      }),
    });

    return {
      shiftId,
      created: true,
      number: nextNumber,
      openedAt: now.toISOString(),
      staffLabel,
    };
  });

  if (result.created && result.number && result.openedAt) {
    await logAuditEvent({
      eventType: "shift.opened",
      actorEmployeeId: input.actorEmployeeId,
      actorUserId: input.actorUserId ?? null,
      branchId: input.branchId,
      entityType: "shift",
      entityId: result.shiftId,
      payload: {
        actionLabel: "Открыта смена",
        actionDetails: `Смена ${formatShiftLabel(result.number, result.openedAt)}${result.staffLabel ? ` · ${result.staffLabel}` : ""}`,
        dateTime: result.openedAt,
      },
    });
  }

  return {
    currentShift: await getShiftCurrentState(input.branchId),
  };
}

export async function updateShiftStaffForBranch(input: {
  branchId: string;
  shiftId: string;
  actorEmployeeId: string;
  actorUserId?: string | null;
  employees: Array<{ id: string; shiftMinimum?: number }>;
}) {
  const result = await runShiftWriteTransaction(async (tx) => {
    const shift = await getOpenShiftRecord(tx, input.branchId, input.shiftId);
    const updatedAt = new Date().toISOString();

    const staffSync = await syncShiftStaffRowsForShift(tx, {
      branchId: input.branchId,
      shift,
      employees: input.employees,
    });

    return {
      shiftId: shift.id,
      updatedAt,
      staffLabel: staffSync.staffLabel,
    };
  });

  await logAuditEvent({
    eventType: "shift.staff_updated",
    actorEmployeeId: input.actorEmployeeId,
    actorUserId: input.actorUserId ?? null,
    branchId: input.branchId,
    entityType: "shift",
    entityId: result.shiftId,
    payload: {
      actionLabel: "Изменён состав смены",
      actionDetails: result.staffLabel,
      dateTime: result.updatedAt,
    },
  });

  return {
    currentShift: await getShiftCurrentState(input.branchId),
  };
}

export async function markShiftStaffAttendanceForBranch(input: {
  branchId: string;
  shiftId: string;
  actorEmployeeId: string;
  actorUserId?: string | null;
  employeeId?: string | null;
  shiftStaffId?: string | null;
  action: ShiftStaffAttendanceAction;
}) {
  const result = await runShiftWriteTransaction((tx) =>
    markShiftStaffAttendanceInTransaction(tx, {
      branchId: input.branchId,
      shiftId: input.shiftId,
      employeeId: input.employeeId ?? null,
      shiftStaffId: input.shiftStaffId ?? null,
      action: input.action,
    }),
  );

  const isArrived = result.action === "arrived";

  await logAuditEvent({
    eventType: isArrived ? "shift.staff_arrived" : "shift.staff_left",
    actorEmployeeId: input.actorEmployeeId,
    actorUserId: input.actorUserId ?? null,
    branchId: input.branchId,
    entityType: "shift",
    entityId: result.shiftId,
    payload: {
      actionLabel: isArrived ? "Сотрудник пришёл" : "Сотрудник ушёл",
      actionDetails: result.employeeName,
      dateTime: result.markedAt,
      employeeId: result.employeeId,
      shiftStaffId: result.shiftStaffId,
    },
  });

  return {
    currentShift: await getShiftCurrentState(input.branchId),
  };
}

export async function addShiftExpenseForBranch(input: {
  branchId: string;
  shiftId: string;
  actorEmployeeId: string;
  actorUserId?: string | null;
  amount: number;
  description: string;
}) {
  const normalizedAmount = Math.round(input.amount * 100) / 100;
  const normalizedDescription = input.description.trim();

  if (!(normalizedAmount > 0) || !Number.isFinite(normalizedAmount)) {
    throw new Error("Укажите корректную сумму расхода.");
  }

  if (!normalizedDescription) {
    throw new Error("Укажите описание расхода.");
  }

  const result = await runShiftWriteTransaction(async (tx) => {
    const shift = await getOpenShiftRecord(tx, input.branchId, input.shiftId);
    const createdAt = new Date().toISOString();
    const expenses = parseJsonValue<DemoShiftExpenseItem[]>(shift.expensesItemsJson, []);
    const expenseItem: DemoShiftExpenseItem = {
      id: `expense-${randomUUID()}`,
      amount: normalizedAmount,
      description: normalizedDescription,
      createdAt,
    };

    await tx.shift.update({
      where: { id: shift.id },
      data: {
        expensesItemsJson: toJsonValue([expenseItem, ...expenses] as Prisma.InputJsonValue),
      },
    });

    return {
      shiftId: shift.id,
      createdAt,
      expenseItem,
    };
  });

  await logAuditEvent({
    eventType: "shift.expense_added",
    actorEmployeeId: input.actorEmployeeId,
    actorUserId: input.actorUserId ?? null,
    branchId: input.branchId,
    entityType: "shift",
    entityId: result.shiftId,
    payload: {
      actionLabel: "Добавлен расход",
      actionDetails: `${formatPrice(result.expenseItem.amount)} · ${result.expenseItem.description}`,
      dateTime: result.createdAt,
    },
  });

  return {
    currentShift: await getShiftCurrentState(input.branchId),
  };
}

export async function closeShiftForBranch(input: {
  branchId: string;
  shiftId: string;
  actorEmployeeId: string;
  actorUserId?: string | null;
}) {
  const result = await runShiftWriteTransaction(async (tx) => {
    const shift = await getOpenShiftRecord(tx, input.branchId, input.shiftId);
    const closedAt = new Date();
    const expensesItems = parseJsonValue<DemoShiftExpenseItem[]>(shift.expensesItemsJson, []);
    const summary = buildSummaryFromOrders({
      orders: shift.orders,
      expensesItems,
    });

    await assertD9PayrollPayoutConsistencyForShift(tx, shift.id);

    await tx.shift.update({
      where: { id: shift.id },
      data: {
        status: "closed",
        closedAt,
        ordersCountSnapshot: summary.ordersCount,
        revenueTotalSnapshot: toDecimal(summary.revenueTotal),
        cashTotalSnapshot: toDecimal(summary.cashTotal),
        cashlessTotalSnapshot: toDecimal(summary.cashlessTotal),
        expensesTotalSnapshot: toDecimal(summary.expensesTotal),
        salaryFundTotalSnapshot: toDecimal(summary.salaryFundTotal),
        accountBreakdownSnapshotJson: toJsonValue(summary.accountBreakdown as Prisma.InputJsonValue),
      },
    });

    return {
      shiftId: shift.id,
      number: shift.number,
      closedAt: closedAt.toISOString(),
      ordersCount: summary.ordersCount,
      revenueTotal: summary.revenueTotal,
    };
  });

  await logAuditEvent({
    eventType: "shift.closed",
    actorEmployeeId: input.actorEmployeeId,
    actorUserId: input.actorUserId ?? null,
    branchId: input.branchId,
    entityType: "shift",
    entityId: result.shiftId,
    payload: {
      actionLabel: "Закрыта смена",
      actionDetails: `Смена ${formatShiftLabel(result.number, result.closedAt)} · ${result.ordersCount} заказов · выручка ${formatPrice(result.revenueTotal)}`,
      dateTime: result.closedAt,
    },
  });

  return {
    currentShift: await getShiftCurrentState(input.branchId),
  };
}

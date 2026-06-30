import { expect, test } from "@playwright/test";
import { Prisma } from "@prisma/client";

import {
  markShiftStaffAttendanceInTransaction,
  syncShiftStaffRowsForShift,
} from "../../src/server/repositories/shift-write-repository";
import { calculateStage22Payroll } from "../../src/features/payroll/stage22-calculator";
import { buildShiftExecutorEntries } from "../../src/features/orders/utils";
import type { DemoShiftState } from "../../src/features/shifts/types";

type StaffRow = {
  id: string;
  shiftId: string;
  employeeId: string | null;
  employeeNameSnapshot: string;
  workPercentSnapshot: Prisma.Decimal | null;
  shiftMinimumSnapshot: Prisma.Decimal | null;
  skillLevelSnapshot: string | null;
  arrivedAt: Date | null;
  leftAt: Date | null;
};

function employeeAccess(employeeId: string, firstName: string, lastName: string, skillLevel = "level_1") {
  return {
    branchId: "branch-1",
    employeeId,
    canOperate: true,
    employee: {
      id: employeeId,
      firstName,
      lastName,
      phone: `700000000${employeeId.slice(-1)}`,
      workPercent: new Prisma.Decimal(100),
      shiftMinimum: new Prisma.Decimal(0),
      skillLevel,
      canBeAssignedExecutor: true,
      firedAt: null,
    },
  };
}

function staffRow(input: {
  id: string;
  employeeId: string;
  employeeNameSnapshot: string;
  arrivedAt?: Date | null;
  leftAt?: Date | null;
}): StaffRow {
  return {
    id: input.id,
    shiftId: "shift-1",
    employeeId: input.employeeId,
    employeeNameSnapshot: input.employeeNameSnapshot,
    workPercentSnapshot: new Prisma.Decimal(100),
    shiftMinimumSnapshot: new Prisma.Decimal(0),
    skillLevelSnapshot: "level_1",
    arrivedAt: input.arrivedAt ?? null,
    leftAt: input.leftAt ?? null,
  };
}

function currentShiftForExecutorEntries(
  staff: NonNullable<DemoShiftState["currentShift"]>["staff"],
): DemoShiftState["currentShift"] {
  return {
    id: "shift-1",
    number: 1,
    openedAt: "2026-05-12T08:00:00.000Z",
    isOpen: true,
    expenses: 0,
    expensesItems: [],
    staff,
    staffLabel: staff.map((member) => member.employeeNameSnapshot).join(", "),
    revenue: 0,
    salaryAccrualTotal: null,
    cashRevenue: 0,
    cashlessRevenue: 0,
    paidOrdersCount: 0,
    completedUnpaidCount: 0,
    completedUnpaidTotal: 0,
    ordersCount: 0,
    orders: [],
    accountBreakdown: [],
    salaryBreakdown: {
      status: "supported",
      mode: "shift_share",
      members: [],
    },
  };
}

function createFakeShiftTransaction(input?: {
  status?: string;
  staff?: StaffRow[];
  employees?: ReturnType<typeof employeeAccess>[];
}) {
  let createdCounter = 0;
  const shift = {
    id: "shift-1",
    branchId: "branch-1",
    status: input?.status ?? "open",
    staffLabelSnapshot: "—",
    staff: input?.staff ?? [
      staffRow({
        id: "shift-staff-1",
        employeeId: "employee-1",
        employeeNameSnapshot: "Иван И.",
      }),
    ],
  };
  const employees = input?.employees ?? [
    employeeAccess("employee-1", "Иван", "Иванов"),
    employeeAccess("employee-2", "Петр", "Петров", "level_2"),
    employeeAccess("employee-3", "Анна", "Сидорова", "level_3"),
  ];
  const moneyWrites = {
    accruals: 0,
    payouts: 0,
  };

  const tx = {
    employeeBranchAccess: {
      findMany: async ({ where }: { where: { employeeId?: { in?: string[] } } }) => {
        const requestedIds = where.employeeId?.in ?? [];
        return employees.filter((record) => requestedIds.includes(record.employeeId));
      },
    },
    shift: {
      findFirst: async ({ where }: { where: { id: string; branchId: string } }) => {
        if (where.id !== shift.id || where.branchId !== shift.branchId) {
          return null;
        }

        return {
          id: shift.id,
          status: shift.status,
          staff: shift.staff.map((member) => ({
            id: member.id,
            employeeId: member.employeeId,
            employeeNameSnapshot: member.employeeNameSnapshot,
            arrivedAt: member.arrivedAt,
            leftAt: member.leftAt,
          })),
        };
      },
      update: async ({ data }: { data: { staffLabelSnapshot?: string } }) => {
        shift.staffLabelSnapshot = data.staffLabelSnapshot ?? shift.staffLabelSnapshot;
        return shift;
      },
    },
    shiftStaff: {
      update: async ({ where, data }: { where: { id: string }; data: Partial<StaffRow> }) => {
        const row = shift.staff.find((member) => member.id === where.id);

        if (!row) {
          throw new Error(`Missing staff row ${where.id}`);
        }

        Object.assign(row, data);
        return row;
      },
      create: async ({ data }: { data: StaffRow }) => {
        createdCounter += 1;
        const nextRow = {
          ...data,
          id: data.id ?? `shift-staff-created-${createdCounter}`,
          arrivedAt: data.arrivedAt ?? null,
          leftAt: data.leftAt ?? null,
        };
        shift.staff.push(nextRow);
        return nextRow;
      },
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        const deleteIds = new Set(where.id.in);
        const before = shift.staff.length;
        shift.staff = shift.staff.filter((member) => !deleteIds.has(member.id));
        return { count: before - shift.staff.length };
      },
    },
    orderPayrollAccrual: {
      create: async () => {
        moneyWrites.accruals += 1;
        throw new Error("Attendance path must not write OrderPayrollAccrual.");
      },
    },
    orderPayrollPayout: {
      createMany: async () => {
        moneyWrites.payouts += 1;
        throw new Error("Attendance path must not write OrderPayrollPayout.");
      },
    },
  };

  return {
    shift,
    moneyWrites,
    tx: tx as unknown as Prisma.TransactionClient,
  };
}

test("executor entries mark arrived and left staff as left", () => {
  const entries = buildShiftExecutorEntries(currentShiftForExecutorEntries([
    {
      employeeId: "employee-left",
      employeeNameSnapshot: "Иван И.",
      arrivedAt: "2026-05-12T08:00:00.000Z",
      leftAt: "2026-05-12T16:30:00.000Z",
    },
  ]));

  expect(entries).toHaveLength(1);
  expect(entries[0]).toEqual(expect.objectContaining({
    id: "employee-left",
    arrivedAt: "2026-05-12T08:00:00.000Z",
    leftAt: "2026-05-12T16:30:00.000Z",
    isLeft: true,
  }));
});

test("executor entries keep arrived-only and unmarked staff as not left", () => {
  const entries = buildShiftExecutorEntries(currentShiftForExecutorEntries([
    {
      employeeId: "employee-arrived",
      employeeNameSnapshot: "Петр П.",
      arrivedAt: "2026-05-12T08:30:00.000Z",
      leftAt: null,
    },
    {
      employeeId: "employee-unmarked",
      employeeNameSnapshot: "Анна С.",
    },
  ]));

  expect(entries).toEqual([
    expect.objectContaining({
      id: "employee-arrived",
      isLeft: false,
    }),
    expect.objectContaining({
      id: "employee-unmarked",
      arrivedAt: null,
      leftAt: null,
      isLeft: false,
    }),
  ]);
});

test("executor entries sort left staff last without filtering them out", () => {
  const entries = buildShiftExecutorEntries(currentShiftForExecutorEntries([
    {
      employeeId: "employee-left-first",
      employeeNameSnapshot: "Иван И.",
      arrivedAt: "2026-05-12T08:00:00.000Z",
      leftAt: "2026-05-12T16:30:00.000Z",
    },
    {
      employeeId: "employee-present",
      employeeNameSnapshot: "Петр П.",
      arrivedAt: "2026-05-12T08:30:00.000Z",
      leftAt: null,
    },
    {
      employeeId: "employee-unmarked",
      employeeNameSnapshot: "Анна С.",
    },
  ]));

  expect(entries.map((entry) => entry.id)).toEqual([
    "employee-present",
    "employee-unmarked",
    "employee-left-first",
  ]);
  expect(entries.find((entry) => entry.id === "employee-left-first")?.isLeft).toBe(true);
  expect(entries).toHaveLength(3);
});

test("mark arrived writes server timestamp to the staff row", async () => {
  const fake = createFakeShiftTransaction();
  const markedAt = new Date("2026-05-12T08:00:00.000Z");

  const result = await markShiftStaffAttendanceInTransaction(fake.tx, {
    branchId: "branch-1",
    shiftId: "shift-1",
    employeeId: "employee-1",
    action: "arrived",
    markedAt,
  });

  expect(result).toEqual(expect.objectContaining({
    shiftStaffId: "shift-staff-1",
    employeeId: "employee-1",
    action: "arrived",
    markedAt: markedAt.toISOString(),
  }));
  expect(fake.shift.staff[0].arrivedAt?.toISOString()).toBe(markedAt.toISOString());
  expect(fake.shift.staff[0].leftAt).toBeNull();
});

test("mark left writes timestamp after arrival", async () => {
  const fake = createFakeShiftTransaction({
    staff: [
      staffRow({
        id: "shift-staff-1",
        employeeId: "employee-1",
        employeeNameSnapshot: "Иван И.",
        arrivedAt: new Date("2026-05-12T08:00:00.000Z"),
      }),
    ],
  });
  const markedAt = new Date("2026-05-12T16:30:00.000Z");

  await markShiftStaffAttendanceInTransaction(fake.tx, {
    branchId: "branch-1",
    shiftId: "shift-1",
    shiftStaffId: "shift-staff-1",
    action: "left",
    markedAt,
  });

  expect(fake.shift.staff[0].arrivedAt?.toISOString()).toBe("2026-05-12T08:00:00.000Z");
  expect(fake.shift.staff[0].leftAt?.toISOString()).toBe(markedAt.toISOString());
});

test("left before arrived is rejected", async () => {
  const fake = createFakeShiftTransaction();

  await expect(markShiftStaffAttendanceInTransaction(fake.tx, {
    branchId: "branch-1",
    shiftId: "shift-1",
    employeeId: "employee-1",
    action: "left",
  })).rejects.toThrow("Нельзя отметить уход до прихода.");
});

test("repeated arrived and left marks are rejected", async () => {
  const fake = createFakeShiftTransaction({
    staff: [
      staffRow({
        id: "shift-staff-1",
        employeeId: "employee-1",
        employeeNameSnapshot: "Иван И.",
        arrivedAt: new Date("2026-05-12T08:00:00.000Z"),
        leftAt: new Date("2026-05-12T16:30:00.000Z"),
      }),
    ],
  });

  await expect(markShiftStaffAttendanceInTransaction(fake.tx, {
    branchId: "branch-1",
    shiftId: "shift-1",
    employeeId: "employee-1",
    action: "arrived",
  })).rejects.toThrow("Сотрудник уже был отмечен как ушедший в этой смене. Повторный приход пока не поддерживается.");

  await expect(markShiftStaffAttendanceInTransaction(fake.tx, {
    branchId: "branch-1",
    shiftId: "shift-1",
    employeeId: "employee-1",
    action: "left",
  })).rejects.toThrow("Уход уже отмечен.");
});

test("closed shift attendance write is rejected", async () => {
  const fake = createFakeShiftTransaction({ status: "closed" });

  await expect(markShiftStaffAttendanceInTransaction(fake.tx, {
    branchId: "branch-1",
    shiftId: "shift-1",
    employeeId: "employee-1",
    action: "arrived",
  })).rejects.toThrow("Отметки доступны только в открытой смене.");
});

test("staff edit preserves unchanged row id and attendance while deleting removed member", async () => {
  const arrivedAt = new Date("2026-05-12T08:00:00.000Z");
  const leftAt = new Date("2026-05-12T16:30:00.000Z");
  const fake = createFakeShiftTransaction({
    staff: [
      staffRow({
        id: "shift-staff-keep",
        employeeId: "employee-1",
        employeeNameSnapshot: "Иван И.",
        arrivedAt,
        leftAt,
      }),
      staffRow({
        id: "shift-staff-remove",
        employeeId: "employee-2",
        employeeNameSnapshot: "Петр П.",
        arrivedAt: new Date("2026-05-12T09:00:00.000Z"),
      }),
    ],
  });

  await syncShiftStaffRowsForShift(fake.tx, {
    branchId: "branch-1",
    shift: fake.shift,
    employees: [{ id: "employee-1" }, { id: "employee-3" }],
  });

  const kept = fake.shift.staff.find((member) => member.employeeId === "employee-1");
  const added = fake.shift.staff.find((member) => member.employeeId === "employee-3");

  expect(kept).toEqual(expect.objectContaining({
    id: "shift-staff-keep",
    arrivedAt,
    leftAt,
  }));
  expect(fake.shift.staff.some((member) => member.id === "shift-staff-remove")).toBe(false);
  expect(added).toEqual(expect.objectContaining({
    employeeId: "employee-3",
    arrivedAt: null,
    leftAt: null,
  }));
  expect(added?.id).not.toBe("shift-staff-remove");
  expect(fake.shift.staffLabelSnapshot).toBe("Иван И., Анна С.");
});

test("shift staff sync allows five members", async () => {
  const employees = [
    employeeAccess("employee-1", "Иван", "Иванов"),
    employeeAccess("employee-2", "Петр", "Петров", "level_2"),
    employeeAccess("employee-3", "Анна", "Сидорова", "level_3"),
    employeeAccess("employee-4", "Олег", "Орлов"),
    employeeAccess("employee-5", "Мария", "Миронова", "level_2"),
  ];
  const fake = createFakeShiftTransaction({ employees });

  await syncShiftStaffRowsForShift(fake.tx, {
    branchId: "branch-1",
    shift: fake.shift,
    employees: employees.map((record) => ({ id: record.employeeId })),
  });

  expect(fake.shift.staff).toHaveLength(5);
  expect(fake.shift.staff.map((member) => member.employeeId)).toEqual([
    "employee-1",
    "employee-2",
    "employee-3",
    "employee-4",
    "employee-5",
  ]);
  expect(fake.shift.staffLabelSnapshot).toBe("Иван И., Петр П., Анна С., Олег О., Мария М.");
});

test("shift staff sync still rejects six members", async () => {
  const employees = [
    employeeAccess("employee-1", "Иван", "Иванов"),
    employeeAccess("employee-2", "Петр", "Петров", "level_2"),
    employeeAccess("employee-3", "Анна", "Сидорова", "level_3"),
    employeeAccess("employee-4", "Олег", "Орлов"),
    employeeAccess("employee-5", "Мария", "Миронова", "level_2"),
    employeeAccess("employee-6", "Сергей", "Соколов", "level_3"),
  ];
  const fake = createFakeShiftTransaction({ employees });

  await expect(syncShiftStaffRowsForShift(fake.tx, {
    branchId: "branch-1",
    shift: fake.shift,
    employees: employees.map((record) => ({ id: record.employeeId })),
  })).rejects.toThrow("В смену можно назначить не более 5 сотрудников.");
});

test("removed and later re-added member starts with null timestamps", async () => {
  const fake = createFakeShiftTransaction({
    staff: [
      staffRow({
        id: "shift-staff-1",
        employeeId: "employee-1",
        employeeNameSnapshot: "Иван И.",
      }),
      staffRow({
        id: "shift-staff-2",
        employeeId: "employee-2",
        employeeNameSnapshot: "Петр П.",
        arrivedAt: new Date("2026-05-12T09:00:00.000Z"),
        leftAt: new Date("2026-05-12T17:00:00.000Z"),
      }),
    ],
  });

  await syncShiftStaffRowsForShift(fake.tx, {
    branchId: "branch-1",
    shift: fake.shift,
    employees: [{ id: "employee-1" }],
  });

  await syncShiftStaffRowsForShift(fake.tx, {
    branchId: "branch-1",
    shift: fake.shift,
    employees: [{ id: "employee-1" }, { id: "employee-2" }],
  });

  const readded = fake.shift.staff.find((member) => member.employeeId === "employee-2");

  expect(readded).toBeTruthy();
  expect(readded?.id).not.toBe("shift-staff-2");
  expect(readded?.arrivedAt).toBeNull();
  expect(readded?.leftAt).toBeNull();
});

test("attendance writes do not touch payroll tables or change formula output", async () => {
  const fake = createFakeShiftTransaction();

  await markShiftStaffAttendanceInTransaction(fake.tx, {
    branchId: "branch-1",
    shiftId: "shift-1",
    employeeId: "employee-1",
    action: "arrived",
    markedAt: new Date("2026-05-12T08:00:00.000Z"),
  });

  const withoutAttendance = calculateStage22Payroll({
    lines: [{ id: "line-1", amount: 1000, rule: { type: "matrix" } }],
    executors: [{
      employeeId: "employee-1",
      orderExecutorId: "order-executor-1",
      skillLevel: "level_1",
      isInShift: true,
    }],
    paidTotal: 1000,
  });
  const withAttendance = calculateStage22Payroll({
    lines: [{ id: "line-1", amount: 1000, rule: { type: "matrix" } }],
    executors: [{
      employeeId: "employee-1",
      orderExecutorId: "order-executor-1",
      skillLevel: "level_1",
      isInShift: true,
      arrivedAt: "2026-05-12T08:00:00.000Z",
      leftAt: "2026-05-12T16:30:00.000Z",
    }],
    paidTotal: 1000,
  });

  expect(fake.moneyWrites).toEqual({ accruals: 0, payouts: 0 });
  expect(withoutAttendance.status).toBe("supported");
  expect(withAttendance.status).toBe("supported");

  if (withoutAttendance.status !== "supported" || withAttendance.status !== "supported") {
    throw new Error("Expected supported payroll results.");
  }

  expect(withAttendance.totalAmount).toBe(withoutAttendance.totalAmount);
  expect(withAttendance.executors[0].amount).toBe(withoutAttendance.executors[0].amount);
  expect(withAttendance.warnings).toEqual([
    expect.objectContaining({ code: "attendance_timestamps_ignored" }),
  ]);
});

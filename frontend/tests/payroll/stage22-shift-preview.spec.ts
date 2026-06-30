import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import { buildShift22Preview } from "../../src/server/repositories/shift-read-repository";

type ShiftInput = Parameters<typeof buildShift22Preview>[0];
type ShiftOrderInput = Parameters<typeof buildShift22Preview>[1][number];

const percentOfWorkRule = {
  ruleType: "percent_of_work",
  percent: 50,
  fixedAmount: 0,
  perUnitAmount: 0,
  usesCostPrice: false,
  reducedEmployeePercentEnabled: false,
  reducedEmployeePercentValue: 0,
};

const shift = {
  staff: [
    {
      employeeId: "emp-1",
      arrivedAt: null,
      leftAt: null,
    },
  ],
} as ShiftInput;

function orderLine(salaryRuleSnapshotJson: unknown) {
  return {
    id: `line-${randomUUID()}`,
    sortOrder: 0,
    serviceNameSnapshot: "Работа",
    unitPrice: 1000,
    quantity: 1,
    costPriceSnapshot: null,
    salaryRuleSnapshotJson,
  };
}

function paidOrder(
  overrides: Partial<{
    id: string;
    number: number;
    salaryAccrualTotal: number | null;
    salaryRuleSnapshotJson: unknown;
    executors: ShiftOrderInput["executors"];
  }> = {},
) {
  const orderId = overrides.id ?? `order-${randomUUID()}`;
  const salaryRuleSnapshotJson = Object.hasOwn(overrides, "salaryRuleSnapshotJson")
    ? overrides.salaryRuleSnapshotJson
    : percentOfWorkRule;

  return {
    id: orderId,
    number: overrides.number ?? 1,
    subtotal: 1000,
    discount: 0,
    totalAmount: 1000,
    salaryAccrualTotal: overrides.salaryAccrualTotal ?? null,
    payments: [{ amount: 1000 }],
    lines: [orderLine(salaryRuleSnapshotJson)],
    executors: overrides.executors ?? [
      {
        id: `order-executor-${orderId}`,
        employeeId: "emp-1",
        sortOrder: 0,
        skillLevelSnapshot: "level_1",
        workPercentSnapshot: 100,
        employeeNameSnapshot: "Мастер",
      },
    ],
    executorSnapshotJson: {},
    executorEmployeeId: null,
  } as ShiftOrderInput;
}

test("shift salary preview skips unsupported paid orders and keeps supported details", () => {
  const preview = buildShift22Preview(shift, [
    paidOrder({ id: "order-supported", number: 101 }),
    paidOrder({
      id: "order-unsupported",
      number: 102,
      salaryAccrualTotal: 350,
      salaryRuleSnapshotJson: null,
    }),
  ]);

  expect(preview.status).toBe("supported");
  if (preview.status !== "supported") {
    throw new Error(`Unexpected preview status: ${preview.status}`);
  }

  expect(preview.totalAmount).toBe(500);
  expect(preview.orderCount).toBe(1);
  expect(preview.skippedUnsupportedOrderCount).toBe(1);
  expect(preview.skippedUnsupportedOrders).toEqual([
    {
      orderId: "order-unsupported",
      orderNumber: "102",
      reasonCategory: "old_data_transition",
      reasonCategoryLabel: "Сохранённый расчёт",
      reasonLabel: "старый заказ без снимка зарплаты для новой формулы. Исторические суммы не пересчитывались.",
    },
  ]);
  expect(preview.members).toHaveLength(1);
  expect(preview.members[0]).toEqual(
    expect.objectContaining({
      employeeId: "emp-1",
      employeeName: "Мастер",
      totalAmount: 500,
      orderCount: 1,
      orders: [{ orderId: "order-supported", orderNumber: "101", amount: 500 }],
    }),
  );
});

test("shift salary preview reports unavailable detail when all paid orders are unsupported", () => {
  const preview = buildShift22Preview(shift, [
    paidOrder({
      id: "order-unsupported",
      number: 102,
      salaryRuleSnapshotJson: null,
    }),
  ]);

  expect(preview).toEqual({
    status: "unsupported",
    skippedUnsupportedOrderCount: 1,
    skippedUnsupportedOrders: [
      {
        orderId: "order-unsupported",
        orderNumber: "102",
        reasonCategory: "missing_rule",
        reasonCategoryLabel: "Нет правила",
        reasonLabel: "у услуги нет правила зарплаты для новой формулы.",
      },
    ],
    notDueOrderCount: 0,
  });
});

test("shift salary preview classifies missing 4+ settings as config", () => {
  const preview = buildShift22Preview(shift, [
    paidOrder({
      id: "order-four-plus",
      number: 103,
      salaryRuleSnapshotJson: {
        stage22PayrollRule: { type: "matrix" },
      },
      executors: ["emp-1", "emp-2", "emp-3", "emp-4"].map((employeeId, index) => ({
        id: `order-executor-${employeeId}`,
        employeeId,
        sortOrder: index,
        skillLevelSnapshot: index === 3 ? "level_3" : "level_1",
        workPercentSnapshot: 100,
        employeeNameSnapshot: `Мастер ${index + 1}`,
      })),
    }),
  ]);

  expect(preview).toEqual({
    status: "unsupported",
    skippedUnsupportedOrderCount: 1,
    skippedUnsupportedOrders: [
      {
        orderId: "order-four-plus",
        orderNumber: "103",
        reasonCategory: "missing_config",
        reasonCategoryLabel: "Нужна настройка",
        reasonLabel: "не задан процент фонда для правила 4+.",
        requiresFourPlusFundPercentSetup: true,
      },
    ],
    notDueOrderCount: 0,
  });
});

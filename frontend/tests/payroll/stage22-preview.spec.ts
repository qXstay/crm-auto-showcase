import { expect, test } from "@playwright/test";

import {
  buildStage22PayrollPreview,
  type Stage22PayrollPreviewOrderInput,
} from "../../src/features/payroll/stage22-preview";
import { resolveServicesAdminPrice } from "../../src/features/pricing/resolver";
import { STAGE22_XLSX_MATRIX_RULES } from "../../src/features/payroll/stage22-calculator";
import type { PricingContext } from "../../src/features/pricing/types";
import type { ServicesAdminService } from "../../src/features/services-admin/types";

const percentOfWorkRule = {
  ruleType: "percent_of_work",
  percent: 50,
  fixedAmount: 0,
  perUnitAmount: 0,
  usesCostPrice: false,
  reducedEmployeePercentEnabled: false,
  reducedEmployeePercentValue: 0,
};

const profitRule = {
  ruleType: "percent_of_profit",
  percent: 40,
  fixedAmount: 0,
  perUnitAmount: 0,
  usesCostPrice: true,
  reducedEmployeePercentEnabled: false,
  reducedEmployeePercentValue: 0,
};

const matrixRule = {
  ruleType: "matrix",
  stage22PayrollRule: {
    type: "matrix",
  },
};

const matrixRuleWithFourPlusSettings = {
  ruleType: "matrix",
  stage22PayrollRule: {
    type: "matrix",
    fourPlusFundPercent: 40,
    fourPlusWeights: {
      level_1: 3,
      level_2: 2,
      level_3: 1,
    },
  },
};

const pricingContext: PricingContext = {
  vehicleType: "passenger",
  radius: "R16",
  lowProfile: false,
  runflat: false,
};

function serviceForSnapshot(overrides: Partial<ServicesAdminService> = {}): ServicesAdminService {
  return {
    id: "service-under-test",
    categoryId: "main",
    name: "Renamed display label",
    serviceType: "base",
    pricingMode: "service",
    priceType: "fixed",
    fixedPrice: 1000,
    priceFrom: 0,
    matrixPrices: {} as ServicesAdminService["matrixPrices"],
    modifierMatrixPrices: {},
    modifierEnabled: { low_profile: false, runflat: false },
    modifierExplicitlyCleared: { low_profile: false, runflat: false },
    displayPriceLabel: "",
    priceBands: [],
    salaryRuleType: "percent_of_work",
    salaryPercent: 50,
    salaryFixedAmount: 0,
    salaryPerUnitAmount: 0,
    usesCostPrice: false,
    costPrice: 0,
    reducedEmployeePercentEnabled: false,
    reducedEmployeePercentValue: 0,
    ...overrides,
  };
}

function baseOrder(overrides: Partial<Stage22PayrollPreviewOrderInput> = {}): Stage22PayrollPreviewOrderInput {
  return {
    id: "order-1",
    subtotal: 1000,
    discount: 0,
    total: 1000,
    legacyAccrualTotal: null,
    lines: [
      {
        id: "line-1",
        label: "Work",
        unitPrice: 1000,
        quantity: 1,
        costPriceSnapshot: null,
        salaryRuleSnapshotJson: percentOfWorkRule,
      },
    ],
    payments: [{ amount: 1000 }],
    executors: [
      {
        employeeId: "emp-1",
        orderExecutorId: "oe-1",
        employeeNameSnapshot: "Executor 1",
        skillLevelSnapshot: "level_1",
        workPercentSnapshot: 100,
      },
    ],
    ...overrides,
  };
}

function fourExecutorOrder(
  salaryRuleSnapshotJson: unknown,
  overrides: Partial<Stage22PayrollPreviewOrderInput> = {},
): Stage22PayrollPreviewOrderInput {
  return baseOrder({
    lines: [
      {
        id: "line-matrix-four-plus",
        label: "Matrix",
        unitPrice: 10000,
        quantity: 1,
        costPriceSnapshot: null,
        salaryRuleSnapshotJson,
      },
    ],
    subtotal: 10000,
    total: 10000,
    payments: [{ amount: 10000 }],
    executors: [
      { employeeId: "emp-1", orderExecutorId: "oe-1", skillLevelSnapshot: "level_1" },
      { employeeId: "emp-2", orderExecutorId: "oe-2", skillLevelSnapshot: "level_1" },
      { employeeId: "emp-3", orderExecutorId: "oe-3", skillLevelSnapshot: "level_2" },
      { employeeId: "emp-4", orderExecutorId: "oe-4", skillLevelSnapshot: "level_3" },
    ],
    ...overrides,
  });
}

test("main category percent_of_work salary snapshot gets Stage 2.2 matrix marker", () => {
  const resolved = resolveServicesAdminPrice(serviceForSnapshot(), pricingContext);

  expect(resolved.salaryRuleSnapshot).toEqual({
    ...percentOfWorkRule,
    stage22PayrollRule: { type: "matrix" },
  });
});

test("non-main percent_of_work salary snapshot does not get matrix marker", () => {
  const resolved = resolveServicesAdminPrice(
    serviceForSnapshot({
      categoryId: "repair",
      name: "Шиномонтаж renamed outside main category",
    }),
    pricingContext,
  );

  expect(resolved.salaryRuleSnapshot).toEqual(percentOfWorkRule);
  expect((resolved.salaryRuleSnapshot as Record<string, unknown>).stage22PayrollRule).toBeUndefined();
});

test("Stage 2.2 matrix marker is independent of service display name", () => {
  const resolved = resolveServicesAdminPrice(
    serviceForSnapshot({
      categoryId: "main",
      name: "Arbitrary owner-edited label",
    }),
    pricingContext,
  );

  expect(resolved.salaryRuleSnapshot).toEqual({
    ...percentOfWorkRule,
    stage22PayrollRule: { type: "matrix" },
  });
});

test("profit service pricing exposes cost price only when card has a positive cost", () => {
  const withCost = resolveServicesAdminPrice(
    serviceForSnapshot({
      salaryRuleType: "percent_of_profit",
      salaryPercent: 40,
      usesCostPrice: true,
      costPrice: 8000,
    }),
    pricingContext,
  );
  const missingCost = resolveServicesAdminPrice(
    serviceForSnapshot({
      salaryRuleType: "percent_of_profit",
      salaryPercent: 40,
      usesCostPrice: true,
      costPrice: 0,
    }),
    pricingContext,
  );

  expect(withCost.costPrice).toBe(8000);
  expect(missingCost.costPrice).toBeNull();
});

test("unpaid order returns not_due", () => {
  const preview = buildStage22PayrollPreview(baseOrder({ payments: [] }));

  expect(preview.result.status).toBe("not_due");
  expect(preview.result.reason).toBe("unpaid");
  expect(preview.comparison).toBe("not_due");
  expect(preview.paidTotal).toBe(0);
});

test("paid order with percent_of_work single executor maps and calculates", () => {
  const preview = buildStage22PayrollPreview(baseOrder());

  expect(preview.input).toEqual(
    expect.objectContaining({
      orderId: "order-1",
      paidTotal: 1000,
      alreadyAccruedPaidBase: 0,
    }),
  );
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(500);
  expect(preview.result.executors[0]).toEqual(
    expect.objectContaining({
      employeeId: "emp-1",
      orderExecutorId: "oe-1",
      name: "Executor 1",
      skillLevel: "level_1",
      amount: 500,
    }),
  );
});

test("salaryRuleSnapshotJson string maps and calculates", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-string-rule",
          label: "Work",
          unitPrice: 1000,
          quantity: 1,
          costPriceSnapshot: null,
          salaryRuleSnapshotJson: JSON.stringify(percentOfWorkRule),
        },
      ],
    }),
  );

  expect(preview.input.lines[0].rule).toEqual({ type: "percent_of_work", percent: 50 });
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(500);
});

test("reduced percent snapshot maps and calculates level 1 plus reduced-level exception", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-conditioner",
          label: "Кондиционер",
          unitPrice: 10000,
          quantity: 1,
          costPriceSnapshot: null,
          salaryRuleSnapshotJson: {
            ...percentOfWorkRule,
            percent: 35,
            reducedEmployeePercentEnabled: true,
            reducedEmployeePercentValue: 5,
          },
        },
      ],
      subtotal: 10000,
      total: 10000,
      payments: [{ amount: 10000 }],
      executors: [
        {
          employeeId: "emp-1",
          orderExecutorId: "oe-1",
          employeeNameSnapshot: "Ильнар",
          skillLevelSnapshot: "level_1",
          workPercentSnapshot: 100,
        },
        {
          employeeId: "emp-2",
          orderExecutorId: "oe-2",
          employeeNameSnapshot: "Максим",
          skillLevelSnapshot: "level_2",
          workPercentSnapshot: 100,
        },
      ],
    }),
  );

  expect(preview.input.lines[0].rule).toEqual({
    type: "percent_of_work",
    percent: 35,
    reducedEmployeePercent: 5,
  });
  expect(preview.result.status).toBe("supported");
  expect(preview.result.executors.map((executor) => executor.amount)).toEqual([3000, 500]);
});

test("marked percent_of_work snapshot uses matrix distribution for two executors", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-marked-percent",
          label: "Owner renamed matrix service",
          unitPrice: 1000,
          quantity: 1,
          costPriceSnapshot: null,
          salaryRuleSnapshotJson: {
            ...percentOfWorkRule,
            stage22PayrollRule: { type: "matrix" },
          },
        },
      ],
      executors: [
        {
          employeeId: "emp-1",
          orderExecutorId: "oe-1",
          employeeNameSnapshot: "Executor 1",
          skillLevelSnapshot: "level_1",
          workPercentSnapshot: 100,
        },
        {
          employeeId: "emp-2",
          orderExecutorId: "oe-2",
          employeeNameSnapshot: "Executor 2",
          skillLevelSnapshot: "level_2",
          workPercentSnapshot: 100,
        },
      ],
    }),
  );

  expect(preview.input.lines[0].rule).toEqual({ type: "matrix" });
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(350);
  expect(preview.result.lines[0]).toEqual(
    expect.objectContaining({
      ruleType: "matrix",
      dueAmount: 350,
      distributionRule: "matrix:level_1+level_2",
    }),
  );
  expect(preview.result.executors).toEqual([
    expect.objectContaining({ employeeId: "emp-1", amount: 200 }),
    expect.objectContaining({ employeeId: "emp-2", amount: 150 }),
  ]);
});

test("old matrix marker remains backward-compatible for supported 1/2/3 rows", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-old-marker",
          label: "Old marker",
          unitPrice: 1000,
          quantity: 1,
          costPriceSnapshot: null,
          salaryRuleSnapshotJson: matrixRule,
        },
      ],
      executors: [
        {
          employeeId: "emp-1",
          orderExecutorId: "oe-1",
          employeeNameSnapshot: "Executor 1",
          skillLevelSnapshot: "level_1",
          workPercentSnapshot: 100,
        },
        {
          employeeId: "emp-2",
          orderExecutorId: "oe-2",
          employeeNameSnapshot: "Executor 2",
          skillLevelSnapshot: "level_2",
          workPercentSnapshot: 100,
        },
        {
          employeeId: "emp-3",
          orderExecutorId: "oe-3",
          employeeNameSnapshot: "Executor 3",
          skillLevelSnapshot: "level_3",
          workPercentSnapshot: 100,
        },
      ],
    }),
  );

  expect(preview.input.lines[0].rule).toEqual({ type: "matrix" });
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(400);
  expect(preview.result.lines[0]).toEqual(
    expect.objectContaining({
      distributionRule: "matrix:level_1+level_2+level_3",
    }),
  );
  expect(preview.result.executors.map((executor) => executor.amount)).toEqual([200, 130, 70]);
});

test("snapshotted fourPlusFundPercent makes 4+ matrix preview calculated", () => {
  const preview = buildStage22PayrollPreview(
    fourExecutorOrder(matrixRuleWithFourPlusSettings),
  );

  expect(preview.input.lines[0].rule).toEqual({
    type: "matrix",
    fourPlusFundPercent: 40,
  });
  expect(preview.input.fourPlusWeights).toEqual({
    level_1: 3,
    level_2: 2,
    level_3: 1,
  });
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(4000);
  expect(preview.result.executors.map((executor) => executor.amount)).toEqual([
    1333.33,
    1333.33,
    888.89,
    444.45,
  ]);
});

test("snapshotted 1-3 matrix settings are respected by preview", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      subtotal: 10000,
      total: 10000,
      payments: [{ amount: 10000 }],
      executors: [
        { employeeId: "emp-1", orderExecutorId: "oe-1", skillLevelSnapshot: "level_1" },
        { employeeId: "emp-2", orderExecutorId: "oe-2", skillLevelSnapshot: "level_2" },
      ],
      lines: [
        {
          id: "line-matrix-custom",
          label: "Шиномонтаж",
          unitPrice: 10000,
          quantity: 1,
          salaryRuleSnapshotJson: {
            ruleType: "matrix",
            stage22PayrollRule: {
              type: "matrix",
              matrixRules: STAGE22_XLSX_MATRIX_RULES.map((rule) =>
                rule.key === "level_1+level_2"
                  ? { ...rule, sharesBasisPoints: [1800, 1700] }
                  : rule,
              ),
            },
          },
        },
      ],
    }),
  );

  expect(preview.input.matrixRules?.find((rule) => rule.key === "level_1+level_2")?.sharesBasisPoints).toEqual([
    1800,
    1700,
  ]);
  expect(preview.result.status).toBe("supported");
  expect(preview.result.executors.map((executor) => executor.amount)).toEqual([1800, 1700]);
});

test("snapshotted fourPlusWeights are respected", () => {
  const preview = buildStage22PayrollPreview(
    fourExecutorOrder(
      {
        ruleType: "matrix",
        stage22PayrollRule: {
          type: "matrix",
          fourPlusFundPercent: 40,
          fourPlusWeights: {
            level_1: 4,
            level_2: 2,
            level_3: 1,
          },
        },
      },
      {
        executors: [
          { employeeId: "emp-1", orderExecutorId: "oe-1", skillLevelSnapshot: "level_1" },
          { employeeId: "emp-2", orderExecutorId: "oe-2", skillLevelSnapshot: "level_2" },
          { employeeId: "emp-3", orderExecutorId: "oe-3", skillLevelSnapshot: "level_3" },
          { employeeId: "emp-4", orderExecutorId: "oe-4", skillLevelSnapshot: "level_3" },
        ],
      },
    ),
  );

  expect(preview.input.fourPlusWeights).toEqual({
    level_1: 4,
    level_2: 2,
    level_3: 1,
  });
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(4000);
  expect(preview.result.executors.map((executor) => executor.amount)).toEqual([
    2000,
    1000,
    500,
    500,
  ]);
});

test("partial payment uses summed payments as paidTotal", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      payments: [{ amount: 250 }, { amount: 300 }],
    }),
  );

  expect(preview.input.paidTotal).toBe(550);
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(275);
});

test("already accrued paid base leaves only later dopayment base", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      subtotal: 10000,
      total: 10000,
      payments: [{ amount: 5000 }, { amount: 5000 }],
      alreadyAccruedPaidBase: 5000,
    }),
  );

  expect(preview.input.paidTotal).toBe(10000);
  expect(preview.input.alreadyAccruedPaidBase).toBe(5000);
  expect(preview.result.status).toBe("supported");
  expect(preview.result.base.remainingPaidBase).toBe(5000);
  expect(preview.result.totalAmount).toBe(2500);
});

test("existing discount is passed through", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      subtotal: 1000,
      discount: 200,
      total: 800,
      payments: [{ amount: 800 }],
    }),
  );

  expect(preview.input.discountTotal).toBe(200);
  expect(preview.result.status).toBe("supported");
  expect(preview.result.base.discountedTotal).toBe(800);
  expect(preview.result.totalAmount).toBe(400);
});

test("missing salary rule is unsupported", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-missing",
          unitPrice: 1000,
          quantity: 1,
          salaryRuleSnapshotJson: null,
        },
      ],
    }),
  );

  expect(preview.result.status).toBe("unsupported");
  expect(preview.result.reason).toBe("missing_salary_rule");
});

test("profit rule missing cost is unsupported", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-profit",
          unitPrice: 12000,
          quantity: 1,
          costPriceSnapshot: null,
          salaryRuleSnapshotJson: profitRule,
        },
      ],
      subtotal: 12000,
      total: 12000,
      payments: [{ amount: 12000 }],
    }),
  );

  expect(preview.result.status).toBe("unsupported");
  expect(preview.result.reason).toBe("missing_profit_cost_price");
});

test("profit rule with zero cost is treated as missing cost", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-profit",
          unitPrice: 12000,
          quantity: 1,
          costPriceSnapshot: 0,
          salaryRuleSnapshotJson: profitRule,
        },
      ],
      subtotal: 12000,
      total: 12000,
      payments: [{ amount: 12000 }],
    }),
  );

  expect(preview.result.status).toBe("unsupported");
  expect(preview.result.reason).toBe("missing_profit_cost_price");
});

test("profit rule treats costPriceSnapshot as unit cost and quantity builds total cost", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-profit-quantity",
          unitPrice: 1000,
          quantity: 4,
          costPriceSnapshot: 600,
          salaryRuleSnapshotJson: profitRule,
        },
      ],
      subtotal: 4000,
      total: 4000,
      payments: [{ amount: 4000 }],
    }),
  );

  expect(preview.input.lines[0]).toEqual(
    expect.objectContaining({
      amount: 4000,
      quantity: 4,
      costPrice: 600,
    }),
  );
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(640);
  expect(preview.result.lines[0]).toEqual(
    expect.objectContaining({
      grossAmount: 4000,
      costAmount: 2400,
      baseAmount: 1600,
      dueAmount: 640,
    }),
  );
});

test("legacy executor missing skill is unsupported through calculator result", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      executors: [
        {
          employeeId: "emp-legacy",
          orderExecutorId: null,
          employeeNameSnapshot: "Legacy",
          skillLevelSnapshot: null,
          workPercentSnapshot: 100,
        },
      ],
    }),
  );

  expect(preview.result.status).toBe("unsupported");
  expect(preview.result.reason).toBe("missing_executor_skill_level");
});

test("multi-executor non-matrix rule uses matrix distribution", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      executors: [
        {
          employeeId: "emp-1",
          orderExecutorId: "oe-1",
          employeeNameSnapshot: "Executor 1",
          skillLevelSnapshot: "level_1",
          workPercentSnapshot: 100,
        },
        {
          employeeId: "emp-2",
          orderExecutorId: "oe-2",
          employeeNameSnapshot: "Executor 2",
          skillLevelSnapshot: "level_2",
          workPercentSnapshot: 100,
        },
      ],
    }),
  );

  // After fix: multi-executor non-matrix services should use matrix distribution
  expect(preview.result.status).toBe("supported");
  expect(preview.result.lines).toHaveLength(1);
  expect(preview.result.lines[0].executorPayouts).toHaveLength(2);
  // Fund is 50% of 1000 = 500, distributed by level_1+level_2 matrix [2000, 1500]
  // 500 * (2000/3500) = 285.71, 500 * (1500/3500) = 214.29
  expect(preview.result.totalAmount).toBeCloseTo(500, 0.01);
});

test("matrix marker absent is unsupported without guessed matrix", () => {
  const preview = buildStage22PayrollPreview(
    baseOrder({
      lines: [
        {
          id: "line-matrix-without-marker",
          unitPrice: 1000,
          quantity: 1,
          salaryRuleSnapshotJson: {
            ruleType: "matrix",
            percent: 35,
          },
        },
      ],
    }),
  );

  expect(preview.input.lines[0].rule).toBeNull();
  expect(preview.result.status).toBe("unsupported");
  expect(preview.result.reason).toBe("missing_salary_rule");
});

test("4+ matrix without fourPlusFundPercent is unsupported", () => {
  const preview = buildStage22PayrollPreview(
    fourExecutorOrder(matrixRule),
  );

  expect(preview.result.status).toBe("unsupported");
  expect(preview.result.reason).toBe("missing_four_plus_fund_percent");
});

test("invalid fourPlusFundPercent remains unsupported for 4+ matrix preview", () => {
  const invalidValues = [0, -10, Number.POSITIVE_INFINITY, "40"];

  for (const invalidValue of invalidValues) {
    const preview = buildStage22PayrollPreview(
      fourExecutorOrder({
        ruleType: "matrix",
        stage22PayrollRule: {
          type: "matrix",
          fourPlusFundPercent: invalidValue,
          fourPlusWeights: {
            level_1: 3,
            level_2: 2,
            level_3: 1,
          },
        },
      }),
    );

    expect(preview.input.lines[0].rule).toEqual({ type: "matrix" });
    expect(preview.result.status).toBe("unsupported");
    expect(preview.result.reason).toBe("missing_four_plus_fund_percent");
  }
});

test("malformed fourPlusWeights are ignored safely", () => {
  const preview = buildStage22PayrollPreview(
    fourExecutorOrder({
      ruleType: "matrix",
      stage22PayrollRule: {
        type: "matrix",
        fourPlusFundPercent: 40,
        fourPlusWeights: {
          level_1: 0,
          level_2: 2,
          level_3: 1,
        },
      },
    }),
  );

  expect(preview.input.fourPlusWeights).toBeUndefined();
  expect(preview.result.status).toBe("supported");
  expect(preview.result.totalAmount).toBe(4000);
  expect(preview.result.executors.map((executor) => executor.amount)).toEqual([
    1333.33,
    1333.33,
    888.89,
    444.45,
  ]);
});

test("arrivedAt and leftAt do not affect amount", () => {
  const withoutAttendance = buildStage22PayrollPreview(baseOrder());
  const withAttendance = buildStage22PayrollPreview(
    baseOrder({
      shiftStaff: [
        {
          employeeId: "emp-1",
          arrivedAt: "2026-05-07T08:00:00.000Z",
          leftAt: "2026-05-07T16:00:00.000Z",
        },
      ],
    }),
  );

  expect(withoutAttendance.result.status).toBe("supported");
  expect(withAttendance.result.status).toBe("supported");
  expect(withAttendance.result.totalAmount).toBe(withoutAttendance.result.totalAmount);
  expect(withAttendance.result.executors[0].explanation).toEqual(
    expect.objectContaining({
      arrivedAt: "2026-05-07T08:00:00.000Z",
      leftAt: "2026-05-07T16:00:00.000Z",
    }),
  );
});

test("comparison metadata reports equal and differs", () => {
  const equal = buildStage22PayrollPreview(baseOrder({ legacyAccrualTotal: 500 }));
  const differs = buildStage22PayrollPreview(baseOrder({ legacyAccrualTotal: 450 }));

  expect(equal.legacyAccrualTotal).toBe(500);
  expect(equal.comparison).toBe("equal");
  expect(differs.legacyAccrualTotal).toBe(450);
  expect(differs.comparison).toBe("differs");
});

test("comparison metadata reports stage22_unsupported and not_due", () => {
  const unsupported = buildStage22PayrollPreview(
    baseOrder({
      legacyAccrualTotal: 123,
      lines: [
        {
          id: "line-missing",
          unitPrice: 1000,
          quantity: 1,
          salaryRuleSnapshotJson: null,
        },
      ],
    }),
  );
  const notDue = buildStage22PayrollPreview(baseOrder({ legacyAccrualTotal: 0, payments: [] }));

  expect(unsupported.legacyAccrualTotal).toBe(123);
  expect(unsupported.comparison).toBe("stage22_unsupported");
  expect(notDue.comparison).toBe("not_due");
});

test("comparison metadata reports legacy_missing", () => {
  const preview = buildStage22PayrollPreview(baseOrder({ legacyAccrualTotal: null }));

  expect(preview.result.status).toBe("supported");
  expect(preview.legacyAccrualTotal).toBeNull();
  expect(preview.comparison).toBe("legacy_missing");
});

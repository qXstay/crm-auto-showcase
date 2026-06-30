import { expect, test } from "@playwright/test";

import {
  calculateStage22Payroll,
  STAGE22_XLSX_MATRIX_RULES,
  type Stage22PayrollExecutorInput,
  type Stage22PayrollLineInput,
} from "../../src/features/payroll/stage22-calculator";

const level1: Stage22PayrollExecutorInput = {
  employeeId: "emp-1",
  orderExecutorId: "oe-1",
  name: "Level 1",
  skillLevel: "level_1",
  isInShift: true,
};

const level2: Stage22PayrollExecutorInput = {
  employeeId: "emp-2",
  orderExecutorId: "oe-2",
  name: "Level 2",
  skillLevel: "level_2",
  isInShift: true,
};

const level3: Stage22PayrollExecutorInput = {
  employeeId: "emp-3",
  orderExecutorId: "oe-3",
  name: "Level 3",
  skillLevel: "level_3",
  isInShift: true,
};

function matrixLine(amount: number, fourPlusFundPercent?: number): Stage22PayrollLineInput {
  return {
    id: "line-matrix",
    label: "Tire service",
    amount,
    rule: {
      type: "matrix",
      fourPlusFundPercent,
    },
  };
}

function calculate(input: {
  amount: number;
  paidTotal: number;
  discountTotal?: number;
  alreadyAccruedPaidBase?: number;
  line?: Stage22PayrollLineInput;
  executors?: Stage22PayrollExecutorInput[];
}) {
  return calculateStage22Payroll({
    lines: [input.line ?? matrixLine(input.amount)],
    executors: input.executors ?? [level1],
    paidTotal: input.paidTotal,
    discountTotal: input.discountTotal,
    alreadyAccruedPaidBase: input.alreadyAccruedPaidBase,
  });
}

test("unpaid order returns not_due", () => {
  const result = calculate({ amount: 5000, paidTotal: 0 });

  expect(result.status).toBe("not_due");
  expect(result.reason).toBe("unpaid");
  expect(result.totalAmount).toBe(0);
  expect(result.base.remainingPaidBase).toBe(0);
});

test("fully paid after discount uses paid-after-discount base", () => {
  const result = calculate({ amount: 5320, discountTotal: 320, paidTotal: 5000 });

  expect(result.status).toBe("supported");
  expect(result.base.discountedTotal).toBe(5000);
  expect(result.totalAmount).toBe(1750);
  expect(result.executors).toEqual([
    expect.objectContaining({
      employeeId: "emp-1",
      amount: 1750,
      sharePercent: 35,
    }),
  ]);
});

test("partial payment pays only the paid part", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 5000,
    executors: [level1, level2],
  });

  expect(result.status).toBe("supported");
  expect(result.base.remainingPaidBase).toBe(5000);
  expect(result.totalAmount).toBe(1750);
  expect(result.lines[0]).toEqual(
    expect.objectContaining({
      fullRuleAmount: 3500,
      dueAmount: 1750,
    }),
  );
  expect(result.executors.map((executor) => executor.amount)).toEqual([1000, 750]);
});

test("no remaining paid base returns not_due", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 5000,
    alreadyAccruedPaidBase: 5000,
    executors: [level1, level2],
  });

  expect(result.status).toBe("not_due");
  expect(result.reason).toBe("no_remaining_paid_base");
  expect(result.totalAmount).toBe(0);
});

test("one executor uses the explicit one-person matrix row", () => {
  const result = calculate({ amount: 10000, paidTotal: 10000 });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(3500);
  expect(result.executors[0]).toEqual(
    expect.objectContaining({
      employeeId: "emp-1",
      sharePercent: 35,
      amount: 3500,
    }),
  );
});

test("one-person level 2 and level 3 matrix rows are explicit", () => {
  const level2Result = calculate({ amount: 10000, paidTotal: 10000, executors: [level2] });
  const level3Result = calculate({ amount: 10000, paidTotal: 10000, executors: [level3] });

  expect(level2Result.status).toBe("supported");
  expect(level3Result.status).toBe("supported");
  expect(level2Result.executors[0]).toEqual(
    expect.objectContaining({
      sharePercent: 30,
      amount: 3000,
    }),
  );
  expect(level3Result.executors[0]).toEqual(
    expect.objectContaining({
      sharePercent: 30,
      amount: 3000,
    }),
  );
});

test("two executors use the explicit XLSX matrix row", () => {
  const result = calculate({ amount: 10000, paidTotal: 10000, executors: [level1, level2] });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(3500);
  expect(result.executors.map((executor) => executor.sharePercent)).toEqual([20, 15]);
  expect(result.executors.map((executor) => executor.amount)).toEqual([2000, 1500]);
});

test("one to three executor matrix can use snapshotted settings", () => {
  const customMatrixRules = STAGE22_XLSX_MATRIX_RULES.map((rule) =>
    rule.key === "level_1+level_2"
      ? { ...rule, sharesBasisPoints: [1800, 1700] }
      : rule,
  );
  const result = calculateStage22Payroll({
    lines: [matrixLine(10000)],
    paidTotal: 10000,
    executors: [level1, level2],
    matrixRules: customMatrixRules,
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(3500);
  expect(result.executors.map((executor) => executor.sharePercent)).toEqual([18, 17]);
  expect(result.executors.map((executor) => executor.amount)).toEqual([1800, 1700]);
});

test("two-person 1+3 and 2+3 matrix rows are explicit", () => {
  const oneThree = calculate({ amount: 10000, paidTotal: 10000, executors: [level1, level3] });
  const twoThree = calculate({ amount: 10000, paidTotal: 10000, executors: [level2, level3] });

  expect(oneThree.status).toBe("supported");
  expect(twoThree.status).toBe("supported");
  expect(oneThree.executors.map((executor) => executor.sharePercent)).toEqual([25, 10]);
  expect(oneThree.executors.map((executor) => executor.amount)).toEqual([2500, 1000]);
  expect(twoThree.executors.map((executor) => executor.sharePercent)).toEqual([20, 15]);
  expect(twoThree.executors.map((executor) => executor.amount)).toEqual([2000, 1500]);
});

test("three executors with an explicit XLSX matrix row calculate", () => {
  const result = calculate({ amount: 10000, paidTotal: 10000, executors: [level1, level2, level3] });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(4000);
  expect(result.executors.map((executor) => executor.amount)).toEqual([2000, 1300, 700]);
  expect(result.lines[0].distributionRule).toBe("matrix:level_1+level_2+level_3");
});

test("three executors can use a saved 2+2+3 matrix row when it exists", () => {
  const customMatrixRules = [
    ...STAGE22_XLSX_MATRIX_RULES,
    {
      key: "level_2+level_2+level_3",
      label: "2 + 2 + 3",
      sharesBasisPoints: [1500, 1250, 1250],
    },
  ];
  const result = calculateStage22Payroll({
    lines: [matrixLine(10000)],
    paidTotal: 10000,
    executors: [
      level2,
      { ...level2, employeeId: "emp-22", orderExecutorId: "oe-22" },
      level3,
    ],
    matrixRules: customMatrixRules,
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(4000);
  expect(result.executors.map((executor) => executor.sharePercent)).toEqual([15, 12.5, 12.5]);
  expect(result.executors.map((executor) => executor.amount)).toEqual([1500, 1250, 1250]);
  expect(result.lines[0].distributionRule).toBe("matrix:level_2+level_2+level_3");
});

test("three executors with a missing XLSX matrix row are unsupported", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 10000,
    executors: [
      level2,
      { ...level2, employeeId: "emp-22", orderExecutorId: "oe-22" },
      level3,
    ],
  });

  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_matrix_row");
});

test("4+ executors distribute the configured fund by default level weights", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 10000,
    line: matrixLine(10000, 40),
    executors: [
      level1,
      { ...level1, employeeId: "emp-11", orderExecutorId: "oe-11" },
      level2,
      level3,
    ],
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(4000);
  expect(result.executors.map((executor) => executor.weight)).toEqual([3, 3, 2, 1]);
  expect(result.executors.map((executor) => executor.amount)).toEqual([1333.33, 1333.33, 888.89, 444.45]);
});

test("five executors distribute the configured fund by level weights", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 10000,
    line: matrixLine(10000, 45),
    executors: [
      level1,
      { ...level1, employeeId: "emp-11", orderExecutorId: "oe-11" },
      level2,
      { ...level2, employeeId: "emp-22", orderExecutorId: "oe-22" },
      level3,
    ],
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(4500);
  expect(result.executors.map((executor) => executor.weight)).toEqual([3, 3, 2, 2, 1]);
  expect(result.executors.map((executor) => executor.amount)).toEqual([1227.28, 1227.27, 818.18, 818.18, 409.09]);
});

test("4+ matrix without fourPlusFundPercent is unsupported", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 10000,
    executors: [
      level1,
      { ...level1, employeeId: "emp-11", orderExecutorId: "oe-11" },
      level2,
      level3,
    ],
  });

  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_four_plus_fund_percent");
});

test("equal levels distribute cent remainder deterministically", () => {
  const result = calculate({
    amount: 100.03,
    paidTotal: 100.03,
    line: matrixLine(100.03, 40),
    executors: [
      level1,
      { ...level1, employeeId: "emp-11", orderExecutorId: "oe-11" },
      { ...level1, employeeId: "emp-12", orderExecutorId: "oe-12" },
      { ...level1, employeeId: "emp-13", orderExecutorId: "oe-13" },
    ],
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(40.01);
  expect(result.executors.map((executor) => executor.amount)).toEqual([10.01, 10, 10, 10]);
});

test("profit service with cost calculates from profit", () => {
  const result = calculate({
    amount: 12000,
    paidTotal: 12000,
    line: {
      id: "profit-line",
      amount: 12000,
      quantity: 1,
      costPrice: 8000,
      rule: {
        type: "percent_of_profit",
        percent: 40,
      },
    },
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(1600);
  expect(result.lines[0]).toEqual(
    expect.objectContaining({
      baseAmount: 4000,
      costAmount: 8000,
      dueAmount: 1600,
    }),
  );
});

test("profit service missing cost is unsupported", () => {
  const result = calculate({
    amount: 12000,
    paidTotal: 12000,
    line: {
      id: "profit-line",
      amount: 12000,
      rule: {
        type: "percent_of_profit",
        percent: 40,
      },
    },
  });

  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_profit_cost_price");
});

test("reduced percent exception splits conditioner 35/5 as 30/5 for level 1 plus level 2", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 10000,
    executors: [level1, level2],
    line: {
      id: "conditioner-line",
      amount: 10000,
      rule: {
        type: "percent_of_work",
        percent: 35,
        reducedEmployeePercent: 5,
      },
    },
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(3500);
  expect(result.lines[0].distributionRule).toBe("reduced_percent:30%+5%");
  expect(result.executors.map((executor) => executor.sharePercent)).toEqual([30, 5]);
  expect(result.executors.map((executor) => executor.amount)).toEqual([3000, 500]);
});

test("reduced percent exception splits argon 35/7 as 28/7 for level 1 plus level 3", () => {
  const result = calculate({
    amount: 10000,
    paidTotal: 10000,
    executors: [level1, level3],
    line: {
      id: "argon-line",
      amount: 10000,
      rule: {
        type: "percent_of_work",
        percent: 35,
        reducedEmployeePercent: 7,
      },
    },
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(3500);
  expect(result.lines[0].distributionRule).toBe("reduced_percent:28%+7%");
  expect(result.executors.map((executor) => executor.sharePercent)).toEqual([28, 7]);
  expect(result.executors.map((executor) => executor.amount)).toEqual([2800, 700]);
});

test("reduced percent single executor uses main percent for level 1 and reduced percent for level 2/3", () => {
  const line: Stage22PayrollLineInput = {
    id: "conditioner-line",
    amount: 10000,
    rule: {
      type: "percent_of_work",
      percent: 35,
      reducedEmployeePercent: 5,
    },
  };
  const level1Result = calculate({ amount: 10000, paidTotal: 10000, executors: [level1], line });
  const level2Result = calculate({ amount: 10000, paidTotal: 10000, executors: [level2], line });

  expect(level1Result.status).toBe("supported");
  expect(level2Result.status).toBe("supported");
  expect(level1Result.executors[0]).toEqual(expect.objectContaining({ sharePercent: 35, amount: 3500 }));
  expect(level2Result.executors[0]).toEqual(expect.objectContaining({ sharePercent: 5, amount: 500 }));
});

test("reduced percent unsupported combinations remain explicit unsupported", () => {
  const line: Stage22PayrollLineInput = {
    id: "conditioner-line",
    amount: 10000,
    rule: {
      type: "percent_of_work",
      percent: 35,
      reducedEmployeePercent: 5,
    },
  };
  const noLevel1 = calculate({ amount: 10000, paidTotal: 10000, executors: [level2, level3], line });
  const threeExecutors = calculate({
    amount: 10000,
    paidTotal: 10000,
    executors: [level1, level2, level3],
    line,
  });

  expect(noLevel1.status).toBe("unsupported");
  expect(threeExecutors.status).toBe("unsupported");
  expect(noLevel1.reason).toBe("unsupported_multi_executor_rule");
  expect(threeExecutors.reason).toBe("unsupported_multi_executor_rule");
});

test("missing salary rule is unsupported", () => {
  const result = calculate({
    amount: 1000,
    paidTotal: 1000,
    line: {
      id: "missing-rule-line",
      amount: 1000,
      rule: null,
    },
  });

  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_salary_rule");
});

test("missing executor skill level is unsupported", () => {
  const result = calculate({
    amount: 1000,
    paidTotal: 1000,
    executors: [{ ...level1, skillLevel: null }],
  });

  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_executor_skill_level");
});

test("fixed rule prorates on partial payment", () => {
  const result = calculate({
    amount: 1000,
    paidTotal: 500,
    line: {
      id: "fixed-line",
      amount: 1000,
      quantity: 1,
      rule: {
        type: "fixed",
        amount: 100,
      },
    },
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(50);
  expect(result.lines[0].fullRuleAmount).toBe(100);
});

test("per-unit rule prorates on partial payment", () => {
  const result = calculate({
    amount: 1000,
    paidTotal: 500,
    line: {
      id: "per-unit-line",
      amount: 1000,
      quantity: 100,
      rule: {
        type: "per_unit",
        amount: 2,
      },
    },
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(100);
  expect(result.lines[0].fullRuleAmount).toBe(200);
});

test("multi-executor percent and amount rules are unsupported", () => {
  const percentOfWork = calculate({
    amount: 1000,
    paidTotal: 1000,
    executors: [level1, level2],
    line: {
      id: "percent-work-line",
      amount: 1000,
      rule: {
        type: "percent_of_work",
        percent: 50,
      },
    },
  });
  const fixed = calculate({
    amount: 1000,
    paidTotal: 1000,
    executors: [level1, level2],
    line: {
      id: "fixed-line",
      amount: 1000,
      rule: {
        type: "fixed",
        amount: 100,
      },
    },
  });
  const perUnit = calculate({
    amount: 1000,
    paidTotal: 1000,
    executors: [level1, level2],
    line: {
      id: "per-unit-line",
      amount: 1000,
      quantity: 10,
      rule: {
        type: "per_unit",
        amount: 2,
      },
    },
  });
  const profit = calculate({
    amount: 12000,
    paidTotal: 12000,
    executors: [level1, level2],
    line: {
      id: "profit-line",
      amount: 12000,
      costPrice: 8000,
      rule: {
        type: "percent_of_profit",
        percent: 40,
      },
    },
  });

  for (const result of [percentOfWork, fixed, perUnit, profit]) {
    expect(result.status).toBe("unsupported");
    expect(result.reason).toBe("unsupported_multi_executor_rule");
  }
});

test("duplicate or missing executor input is explicitly unsupported", () => {
  const duplicate = calculate({
    amount: 1000,
    paidTotal: 1000,
    executors: [level1, { ...level1, orderExecutorId: "oe-duplicate" }],
  });
  const missing = calculateStage22Payroll({
    lines: [matrixLine(1000)],
    executors: [{ orderExecutorId: "oe-missing", skillLevel: "level_1" }],
    paidTotal: 1000,
  });

  expect(duplicate.status).toBe("unsupported");
  expect(duplicate.reason).toBe("duplicate_executor_input");
  expect(missing.status).toBe("unsupported");
  expect(missing.reason).toBe("missing_executor_input");
});

test("legacy executor without orderExecutorId calculates with warning", () => {
  const result = calculate({
    amount: 1000,
    paidTotal: 1000,
    executors: [{ ...level1, orderExecutorId: null }],
  });

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(350);
  expect(result.warnings).toEqual([
    expect.objectContaining({
      code: "legacy_executor_without_order_executor_id",
      employeeId: "emp-1",
    }),
  ]);
});

test("executor not in shift warns only and leaves amount unchanged", () => {
  const normal = calculate({ amount: 1000, paidTotal: 1000 });
  const notInShift = calculate({
    amount: 1000,
    paidTotal: 1000,
    executors: [{ ...level1, isInShift: false }],
  });

  expect(normal.status).toBe("supported");
  expect(notInShift.status).toBe("supported");
  expect(notInShift.totalAmount).toBe(normal.totalAmount);
  expect(notInShift.warnings).toEqual([
    expect.objectContaining({
      code: "executor_not_in_shift",
    }),
  ]);
});

test("arrivedAt and leftAt are explainability only and leave amount unchanged", () => {
  const normal = calculate({ amount: 3000, paidTotal: 3000 });
  const withAttendance = calculate({
    amount: 3000,
    paidTotal: 3000,
    executors: [
      {
        ...level1,
        arrivedAt: "2026-05-07T08:00:00.000Z",
        leftAt: "2026-05-07T16:00:00.000Z",
      },
    ],
  });

  expect(normal.status).toBe("supported");
  expect(withAttendance.status).toBe("supported");
  expect(withAttendance.totalAmount).toBe(normal.totalAmount);
  expect(withAttendance.executors[0].explanation).toEqual(
    expect.objectContaining({
      arrivedAt: "2026-05-07T08:00:00.000Z",
      leftAt: "2026-05-07T16:00:00.000Z",
    }),
  );
  expect(withAttendance.warnings).toEqual([
    expect.objectContaining({
      code: "attendance_timestamps_ignored",
    }),
  ]);
});

import { expect, test } from "@playwright/test";
import { calculateStage22Payroll, type Stage22PayrollInput } from "../../src/features/payroll/stage22-calculator";
import type { Stage22PayrollRule, Stage22PayrollExecutorInput } from "../../src/features/payroll/stage22-calculator";

const level1Executor: Stage22PayrollExecutorInput = {
  employeeId: "emp-1",
  orderExecutorId: "oe-1",
  name: "Иван И.",
  skillLevel: "level_1",
  isInShift: true,
};

const level2Executor: Stage22PayrollExecutorInput = {
  employeeId: "emp-2",
  orderExecutorId: "oe-2",
  name: "Максим И.",
  skillLevel: "level_2",
  isInShift: true,
};

const level3Executor: Stage22PayrollExecutorInput = {
  employeeId: "emp-3",
  orderExecutorId: "oe-3",
  name: "Семен С.",
  skillLevel: "level_3",
  isInShift: true,
};

const percentOfWorkRule: Stage22PayrollRule = {
  type: "percent_of_work",
  percent: 50,
  label: "Герметизация бортов",
};

test("multi-executor percent_of_work non-matrix: level_1+level_1 distributes fund evenly", () => {
  const level1Executor2: Stage22PayrollExecutorInput = {
    employeeId: "emp-1b",
    orderExecutorId: "oe-1b",
    name: "Иван И. 2",
    skillLevel: "level_1",
    isInShift: true,
  };

  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Герметизация бортов",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
    ],
    executors: [level1Executor, level1Executor2],
    paidTotal: 600,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(300); // 300 fund total
  expect(result.lines).toHaveLength(1);
  expect(result.lines[0].executorPayouts).toHaveLength(2);
  // level_1+level_1 matrix: [1750, 1750] → 300 × (1750/3500) = 150 each
  expect(result.lines[0].executorPayouts[0].amount).toBeCloseTo(150, 0.01);
  expect(result.lines[0].executorPayouts[1].amount).toBeCloseTo(150, 0.01);
});

test("multi-executor percent_of_work non-matrix: level_1+level_2 uses matrix proportions", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Герметизация бортов",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
    ],
    executors: [level1Executor, level2Executor],
    paidTotal: 600,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(300); // 300 fund total
  // level_1+level_2 matrix: [2000, 1500] → 300 × (2000/3500), 300 × (1500/3500)
  expect(result.lines[0].executorPayouts[0].amount).toBeCloseTo(171.43, 0.01);
  expect(result.lines[0].executorPayouts[1].amount).toBeCloseTo(128.57, 0.01);
  expect(result.lines[0].executorPayouts[0].amountCents + result.lines[0].executorPayouts[1].amountCents).toBe(30000);
});

test("multi-executor percent_of_work non-matrix: level_1+level_3 uses matrix proportions", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Ошиповка",
        amount: 3600,
        quantity: 1,
        costPrice: null,
        rule: { type: "percent_of_work", percent: 40, label: "Ошиповка" },
      },
    ],
    executors: [level1Executor, level3Executor],
    paidTotal: 3600,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(1440); // 1440 fund total
  // level_1+level_3 matrix: [2500, 1000] → 1440 × (2500/3500), 1440 × (1000/3500)
  expect(result.lines[0].executorPayouts[0].amount).toBeCloseTo(1028.57, 0.01);
  expect(result.lines[0].executorPayouts[1].amount).toBeCloseTo(411.43, 0.01);
  expect(result.lines[0].executorPayouts[0].amountCents + result.lines[0].executorPayouts[1].amountCents).toBe(144000);
});

test("multi-executor percent_of_work non-matrix: 3 executors use matrix proportions", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Герметизация",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
    ],
    executors: [level1Executor, level2Executor, level3Executor],
    paidTotal: 600,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(300);
  // level_1+level_2+level_3 matrix: [2000, 1300, 700] → sum = 4000
  expect(result.lines[0].executorPayouts).toHaveLength(3);
  expect(result.lines[0].executorPayouts[0].amount).toBeCloseTo(150, 0.01); // 300 × (2000/4000)
  expect(result.lines[0].executorPayouts[1].amount).toBeCloseTo(97.5, 0.01); // 300 × (1300/4000)
  expect(result.lines[0].executorPayouts[2].amount).toBeCloseTo(52.5, 0.01); // 300 × (700/4000)
});

test("multi-executor per_unit non-matrix: 2 executors use matrix proportions", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Услуга за штуку",
        amount: 500,
        quantity: 4,
        costPrice: null,
        rule: { type: "per_unit", amount: 125, label: "За штуку" },
      },
    ],
    executors: [level1Executor, level2Executor],
    paidTotal: 500,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(500); // Full amount as fund
  // 4 × 125 = 500 total, distributed via matrix
  expect(result.lines[0].executorPayouts[0].amountCents + result.lines[0].executorPayouts[1].amountCents).toBe(50000);
});

test("multi-executor mixed order: matrix + non-matrix services calculate correctly", () => {
  const matrixRule: Stage22PayrollRule = {
    type: "matrix",
    label: "Снятие/Установка",
  };

  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Снятие/Установка",
        amount: 960,
        quantity: 1,
        costPrice: null,
        rule: matrixRule,
      },
      {
        id: "line-2",
        label: "Герметизация",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
    ],
    executors: [level1Executor, level2Executor],
    paidTotal: 1560,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.lines).toHaveLength(2);
  expect(result.lines[0].ruleType).toBe("matrix");
  expect(result.lines[1].ruleType).toBe("percent_of_work");
});

test("multi-executor mixed order: non-matrix line does not block matrix lines", () => {
  const matrixRule: Stage22PayrollRule = {
    type: "matrix",
    label: "Снятие/Установка",
  };

  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Снятие/Установка",
        amount: 960,
        quantity: 1,
        costPrice: null,
        rule: matrixRule,
      },
      {
        id: "line-2",
        label: "Герметизация",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
    ],
    executors: [level1Executor, level2Executor],
    paidTotal: 1560,
  };

  const result = calculateStage22Payroll(input);

  // Both lines should calculate, not become unsupported
  expect(result.status).toBe("supported");
  expect(result.lines[0].executorPayouts.length).toBeGreaterThan(0);
  expect(result.lines[1].executorPayouts.length).toBeGreaterThan(0);
});

test("multi-executor percent_of_profit without costPrice remains unsupported", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Продажа без себестоимости",
        amount: 5000,
        quantity: 1,
        costPrice: null,
        rule: { type: "percent_of_profit", percent: 40, label: "Продажа" },
      },
    ],
    executors: [level1Executor, level2Executor],
    paidTotal: 5000,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_profit_cost_price");
});

test("multi-executor missing salary rule remains unsupported", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Без правила",
        amount: 500,
        quantity: 1,
        costPrice: null,
        rule: null,
      },
    ],
    executors: [level1Executor, level2Executor],
    paidTotal: 500,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_salary_rule");
});

test("single executor percent_of_work remains unchanged", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Герметизация",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
    ],
    executors: [level1Executor],
    paidTotal: 600,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(300); // 50% of 600
  expect(result.lines[0].executorPayouts).toHaveLength(1);
  expect(result.lines[0].executorPayouts[0].amount).toBe(300);
});

test("single executor percent_of_profit remains unchanged", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Продажа",
        amount: 5000,
        quantity: 1,
        costPrice: 3000,
        rule: { type: "percent_of_profit", percent: 40, label: "Продажа" },
      },
    ],
    executors: [level1Executor],
    paidTotal: 5000,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.lines[0].dueAmount).toBe(800); // (5000 - 3000) × 40%
  expect(result.totalAmount).toBe(800);
});

test("single executor fixed remains unchanged", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Фикс",
        amount: 1000,
        quantity: 1,
        costPrice: null,
        rule: { type: "fixed", amount: 1000, label: "Фикс" },
      },
    ],
    executors: [level1Executor],
    paidTotal: 1000,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(1000);
});

test("single executor per_unit remains unchanged", () => {
  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "За штуку",
        amount: 500,
        quantity: 4,
        costPrice: null,
        rule: { type: "per_unit", amount: 125, label: "За штуку" },
      },
    ],
    executors: [level1Executor],
    paidTotal: 500,
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(500);
});

test("multi-executor percent_of_work with 4+ executors uses four-plus weights", () => {
  const level4Executor: Stage22PayrollExecutorInput = {
    employeeId: "emp-4",
    orderExecutorId: "oe-4",
    name: "Антон К.",
    skillLevel: "level_1",
    isInShift: true,
  };

  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Герметизация",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
    ],
    executors: [level1Executor, level2Executor, level3Executor, level4Executor],
    paidTotal: 600,
    fourPlusWeights: {
      level_1: 3,
      level_2: 2,
      level_3: 1,
    },
  };

  const result = calculateStage22Payroll(input);

  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(300); // 50% of 600 = 300 fund
  // 4 executors: 3+2+1+3 weights on 300 fund (2 level_1, 1 level_2, 1 level_3)
  expect(result.lines[0].executorPayouts).toHaveLength(4);
});

test("Manager's exact order scenario: Герметизация + Ошиповка + matrix services calculate correctly", () => {
  const matrixRule: Stage22PayrollRule = {
    type: "matrix",
    label: "Снятие/Установка",
  };

  const input: Stage22PayrollInput = {
    lines: [
      {
        id: "line-1",
        label: "Герметизация бортов",
        amount: 600,
        quantity: 1,
        costPrice: null,
        rule: percentOfWorkRule,
      },
      {
        id: "line-2",
        label: "Снятие/Установка колеса",
        amount: 960,
        quantity: 1,
        costPrice: null,
        rule: matrixRule,
      },
      {
        id: "line-3",
        label: "Демонтаж шины",
        amount: 520,
        quantity: 1,
        costPrice: null,
        rule: matrixRule,
      },
      {
        id: "line-4",
        label: "Ошиповка зимних шин",
        amount: 3600,
        quantity: 1,
        costPrice: null,
        rule: { type: "percent_of_work", percent: 40, label: "Ошиповка" },
      },
      {
        id: "line-5",
        label: "Ошиповка ремонтным шипом",
        amount: 64,
        quantity: 1,
        costPrice: null,
        rule: { type: "per_unit", amount: 64, label: "Ошиповка шип" },
      },
    ],
    executors: [level1Executor, level2Executor],
    paidTotal: 5744,
  };

  const result = calculateStage22Payroll(input);

  // Result must remain in the supported branch
  expect(result.status).toBe("supported");
  expect(result.lines).toHaveLength(5);

  // Герметизация: 50% of 600 = 300 fund, split by level_1+level_2 matrix
  const герметизацияLine = result.lines.find((l) => l.label === "Герметизация бортов");
  expect(герметизацияLine?.executorPayouts.length).toBe(2);
  expect(герметизацияLine?.executorPayouts[0].amount).toBeCloseTo(171.43, 0.01); // 300 × (2000/3500)
  expect(герметизацияLine?.executorPayouts[1].amount).toBeCloseTo(128.57, 0.01); // 300 × (1500/3500)

  // Ошиповка: 40% of 3600 = 1440 fund, split by level_1+level_2 matrix
  const ошиповкаLine = result.lines.find((l) => l.label === "Ошиповка зимних шин");
  expect(ошиповкаLine?.executorPayouts.length).toBe(2);
  expect(ошиповкаLine?.executorPayouts[0].amount).toBeCloseTo(822.86, 0.01); // 1440 × (2000/3500)
  expect(ошиповкаLine?.executorPayouts[1].amount).toBeCloseTo(617.14, 0.01); // 1440 × (1500/3500)

  // Matrix services should still work correctly
  const снятиеLine = result.lines.find((l) => l.label === "Снятие/Установка колеса");
  expect(снятиеLine?.executorPayouts.length).toBeGreaterThan(0);

  const демонтажLine = result.lines.find((l) => l.label === "Демонтаж шины");
  expect(демонтажLine?.executorPayouts.length).toBeGreaterThan(0);
});

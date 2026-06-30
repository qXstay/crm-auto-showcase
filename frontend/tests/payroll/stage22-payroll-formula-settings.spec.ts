import { expect, test } from "@playwright/test";

import {
  defaultPayrollFormulaSettings,
  readStoredPayrollSettings,
  toStoredPayrollFormulaSettingsJson,
} from "../../src/features/payroll/payroll-formula-settings";
import {
  calculateStage22Payroll,
  STAGE22_XLSX_MATRIX_RULES,
} from "../../src/features/payroll/stage22-calculator";

const fourExecutors = [
  {
    employeeId: "emp-1",
    orderExecutorId: "oe-1",
    name: "Level 1",
    skillLevel: "level_1" as const,
    isInShift: true,
  },
  {
    employeeId: "emp-2",
    orderExecutorId: "oe-2",
    name: "Level 1 again",
    skillLevel: "level_1" as const,
    isInShift: true,
  },
  {
    employeeId: "emp-3",
    orderExecutorId: "oe-3",
    name: "Level 2",
    skillLevel: "level_2" as const,
    isInShift: true,
  },
  {
    employeeId: "emp-4",
    orderExecutorId: "oe-4",
    name: "Level 3",
    skillLevel: "level_3" as const,
    isInShift: true,
  },
];

test("default payroll formula settings enable 4+ matrix fund at agreed 40 percent", () => {
  const settings = defaultPayrollFormulaSettings();
  const result = calculateStage22Payroll({
    paidTotal: 10000,
    discountTotal: 0,
    alreadyAccruedPaidBase: 0,
    executors: fourExecutors,
    fourPlusWeights: settings.fourPlusWeights,
    lines: [
      {
        id: "line-matrix",
        label: "Шиномонтаж",
        amount: 10000,
        rule: {
          type: "matrix",
          fourPlusFundPercent: settings.fourPlusFundPercent ?? undefined,
        },
      },
    ],
  });

  expect(settings).toEqual({
    fourPlusFundPercent: 40,
    fourPlusWeights: {
      level_1: 3,
      level_2: 2,
      level_3: 1,
    },
    matrixRules: STAGE22_XLSX_MATRIX_RULES,
  });
  expect(result.status).toBe("supported");
  expect(result.totalAmount).toBe(4000);
  expect(result.executors.map((executor) => executor.amount)).toEqual([
    1333.33,
    1333.33,
    888.89,
    444.45,
  ]);
});

test("legacy stored null without an explicit clear marker normalizes to default 40", () => {
  const settings = readStoredPayrollSettings({
    fourPlusFundPercent: null,
    level_1: 3,
    level_2: 2,
    level_3: 1,
  });

  expect(settings?.fourPlusFundPercent).toBe(40);
});

test("old stored payroll formula settings without 1-3 matrix use XLSX defaults", () => {
  const settings = readStoredPayrollSettings({
    fourPlusFundPercent: 40,
    level_1: 4,
    level_2: 2,
    level_3: 1,
  });

  expect(settings?.fourPlusWeights).toEqual({
    level_1: 4,
    level_2: 2,
    level_3: 1,
  });
  expect(settings?.matrixRules).toEqual(STAGE22_XLSX_MATRIX_RULES);
});

test("stored 1-3 matrix settings are preserved for calculator input", () => {
  const stored = toStoredPayrollFormulaSettingsJson({
    fourPlusFundPercent: 40,
    fourPlusWeights: {
      level_1: 3,
      level_2: 2,
      level_3: 1,
    },
    matrixRules: STAGE22_XLSX_MATRIX_RULES.map((rule) =>
      rule.key === "level_1+level_2"
        ? { ...rule, sharesBasisPoints: [1800, 1700] }
        : rule,
    ),
  });
  const settings = readStoredPayrollSettings(stored);
  const result = calculateStage22Payroll({
    paidTotal: 10000,
    discountTotal: 0,
    alreadyAccruedPaidBase: 0,
    executors: [fourExecutors[0], fourExecutors[2]],
    matrixRules: settings?.matrixRules,
    lines: [
      {
        id: "line-matrix",
        label: "Шиномонтаж",
        amount: 10000,
        rule: {
          type: "matrix",
        },
      },
    ],
  });

  expect(settings?.matrixRules.find((rule) => rule.key === "level_1+level_2")?.sharesBasisPoints).toEqual([
    1800,
    1700,
  ]);
  expect(result.status).toBe("supported");
  expect(result.executors.map((executor) => executor.amount)).toEqual([1800, 1700]);
});

test("old stored matrix settings keep saved rows even without optional 2+2+3", () => {
  const settings = readStoredPayrollSettings({
    fourPlusFundPercent: 40,
    level_1: 3,
    level_2: 2,
    level_3: 1,
    matrixRules: STAGE22_XLSX_MATRIX_RULES.map((rule) =>
      rule.key === "level_1+level_2"
        ? { key: rule.key, sharesBasisPoints: [1800, 1700] }
        : { key: rule.key, sharesBasisPoints: [...rule.sharesBasisPoints] },
    ),
  });

  expect(settings?.matrixRules.find((rule) => rule.key === "level_1+level_2")?.sharesBasisPoints).toEqual([
    1800,
    1700,
  ]);
  expect(settings?.matrixRules.find((rule) => rule.key === "level_2+level_2+level_3")).toBeUndefined();
});

test("stored optional 2+2+3 row is preserved for calculator input", () => {
  const stored = toStoredPayrollFormulaSettingsJson({
    fourPlusFundPercent: 40,
    fourPlusWeights: {
      level_1: 3,
      level_2: 2,
      level_3: 1,
    },
    matrixRules: [
      ...STAGE22_XLSX_MATRIX_RULES,
      {
        key: "level_2+level_2+level_3",
        label: "2 + 2 + 3",
        sharesBasisPoints: [1500, 1250, 1250],
      },
    ],
  });
  const settings = readStoredPayrollSettings(stored);
  const result = calculateStage22Payroll({
    paidTotal: 10000,
    discountTotal: 0,
    alreadyAccruedPaidBase: 0,
    executors: [
      fourExecutors[2],
      { ...fourExecutors[2], employeeId: "emp-22", orderExecutorId: "oe-22", name: "Level 2 again" },
      fourExecutors[3],
    ],
    matrixRules: settings?.matrixRules,
    lines: [
      {
        id: "line-matrix",
        label: "Шиномонтаж",
        amount: 10000,
        rule: {
          type: "matrix",
        },
      },
    ],
  });

  expect(settings?.matrixRules.find((rule) => rule.key === "level_2+level_2+level_3")?.sharesBasisPoints).toEqual([
    1500,
    1250,
    1250,
  ]);
  expect(result.status).toBe("supported");
  expect(result.executors.map((executor) => executor.amount)).toEqual([1500, 1250, 1250]);
});

test("explicitly cleared fourPlusFundPercent keeps missing-config warning semantics", () => {
  const stored = toStoredPayrollFormulaSettingsJson({
    fourPlusFundPercent: null,
    fourPlusWeights: {
      level_1: 3,
      level_2: 2,
      level_3: 1,
    },
    matrixRules: STAGE22_XLSX_MATRIX_RULES,
  });
  const settings = readStoredPayrollSettings(stored);
  const result = calculateStage22Payroll({
    paidTotal: 10000,
    discountTotal: 0,
    alreadyAccruedPaidBase: 0,
    executors: fourExecutors,
    fourPlusWeights: settings?.fourPlusWeights,
    lines: [
      {
        id: "line-matrix",
        label: "Шиномонтаж",
        amount: 10000,
        rule: {
          type: "matrix",
          fourPlusFundPercent: settings?.fourPlusFundPercent ?? undefined,
        },
      },
    ],
  });

  expect(stored.fourPlusFundPercentCleared).toBe(true);
  expect(settings?.fourPlusFundPercent).toBeNull();
  expect(result.status).toBe("unsupported");
  expect(result.reason).toBe("missing_four_plus_fund_percent");
});

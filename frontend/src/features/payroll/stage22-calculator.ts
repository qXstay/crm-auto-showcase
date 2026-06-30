export type Stage22SkillLevel = "level_1" | "level_2" | "level_3";

export type Stage22PayrollRule =
  | {
      type: "matrix";
      label?: string;
      fourPlusFundPercent?: number;
    }
  | {
      type: "percent_of_work";
      percent: number;
      label?: string;
      reducedEmployeePercent?: number;
    }
  | {
      type: "percent_of_profit";
      percent: number;
      label?: string;
    }
  | {
      type: "fixed";
      amount: number;
      label?: string;
    }
  | {
      type: "per_unit";
      amount: number;
      label?: string;
    };

export type Stage22PayrollLineInput = {
  id: string;
  label?: string;
  amount: number;
  quantity?: number;
  costPrice?: number | null;
  rule: Stage22PayrollRule | null;
};

export type Stage22PayrollExecutorInput = {
  employeeId?: string | null;
  orderExecutorId?: string | null;
  name?: string | null;
  skillLevel?: Stage22SkillLevel | null;
  isInShift?: boolean;
  arrivedAt?: string | null;
  leftAt?: string | null;
};

export type Stage22FourPlusWeights = Record<Stage22SkillLevel, number>;

export type Stage22MatrixRule = {
  key: string;
  sharesBasisPoints: number[];
  label: string;
};

export type Stage22PayrollInput = {
  orderId?: string;
  lines: Stage22PayrollLineInput[];
  executors: Stage22PayrollExecutorInput[];
  grossTotal?: number;
  discountTotal?: number;
  /** Cumulative paid amount for the order, including the payment currently being processed. */
  paidTotal: number;
  /** Cumulative paid base that was already accrued before this calculation. */
  alreadyAccruedPaidBase?: number;
  fourPlusWeights?: Partial<Stage22FourPlusWeights>;
  matrixRules?: Stage22MatrixRule[];
};

export type Stage22PayrollWarningCode =
  | "legacy_executor_without_order_executor_id"
  | "executor_not_in_shift"
  | "attendance_timestamps_ignored";

export type Stage22PayrollWarning = {
  code: Stage22PayrollWarningCode;
  message: string;
  employeeId?: string;
  orderExecutorId?: string | null;
};

export type Stage22PayrollUnsupportedReason =
  | "empty_order"
  | "missing_salary_rule"
  | "unsupported_rule"
  | "missing_profit_cost_price"
  | "missing_executor_input"
  | "duplicate_executor_input"
  | "missing_executor_skill_level"
  | "missing_matrix_row"
  | "missing_four_plus_fund_percent"
  | "unsupported_multi_executor_rule";

export type Stage22PayrollNotDueReason = "unpaid" | "no_remaining_paid_base";

export type Stage22PayrollExecutorPayout = {
  employeeId: string;
  orderExecutorId: string | null;
  name: string | null;
  skillLevel: Stage22SkillLevel;
  amount: number;
  amountCents: number;
  sharePercent: number | null;
  weight: number | null;
  basisLabel: string;
  warnings: Stage22PayrollWarning[];
  explanation: {
    originalIndex: number;
    isInShift: boolean | null;
    arrivedAt: string | null;
    leftAt: string | null;
  };
};

export type Stage22PayrollLineExplanation = {
  id: string;
  label: string | null;
  ruleType: Stage22PayrollRule["type"];
  ruleLabel: string;
  grossAmount: number;
  discountedAmount: number;
  remainingPaidBase: number;
  fullRuleAmount: number;
  dueAmount: number;
  baseAmount: number;
  costAmount: number | null;
  paidRatio: number;
  distributionRule: string;
  executorPayouts: Stage22PayrollExecutorPayout[];
};

export type Stage22PayrollBaseExplanation = {
  grossTotal: number;
  discountTotal: number;
  discountedTotal: number;
  paidTotal: number;
  eligiblePaidBase: number;
  alreadyAccruedPaidBase: number;
  remainingPaidBase: number;
};

export type Stage22PayrollSupportedResult = {
  status: "supported";
  totalAmount: number;
  totalAmountCents: number;
  base: Stage22PayrollBaseExplanation;
  lines: Stage22PayrollLineExplanation[];
  executors: Stage22PayrollExecutorPayout[];
  warnings: Stage22PayrollWarning[];
};

export type Stage22PayrollNotDueResult = {
  status: "not_due";
  reason: Stage22PayrollNotDueReason;
  totalAmount: 0;
  totalAmountCents: 0;
  base: Stage22PayrollBaseExplanation;
  warnings: Stage22PayrollWarning[];
};

export type Stage22PayrollUnsupportedResult = {
  status: "unsupported";
  reason: Stage22PayrollUnsupportedReason;
  message: string;
  base?: Stage22PayrollBaseExplanation;
  warnings: Stage22PayrollWarning[];
};

export type Stage22PayrollResult =
  | Stage22PayrollSupportedResult
  | Stage22PayrollNotDueResult
  | Stage22PayrollUnsupportedResult;

type NormalizedExecutor = {
  employeeId: string;
  orderExecutorId: string | null;
  name: string | null;
  skillLevel: Stage22SkillLevel;
  originalIndex: number;
  isInShift: boolean | null;
  arrivedAt: string | null;
  leftAt: string | null;
  warnings: Stage22PayrollWarning[];
};

type AllocationSlice = {
  cents: number;
  weight: number;
};

const SKILL_LEVEL_ORDER: Stage22SkillLevel[] = ["level_1", "level_2", "level_3"];

export const STAGE22_DEFAULT_FOUR_PLUS_WEIGHTS: Stage22FourPlusWeights = {
  level_1: 3,
  level_2: 2,
  level_3: 1,
};

export const STAGE22_XLSX_WORK_RULES = [
  { label: "Шиномонтаж", type: "matrix", rate: "35% / 40% / configurable" },
  { label: "Слесарные работы", type: "percent_of_work", percent: 50 },
  { label: "Подкачка", type: "percent_of_work", percent: 100 },
  { label: "Кондиционеры - заправка", type: "percent_of_work", percent: 35 },
  { label: "Кондиционеры - ремонт", type: "percent_of_work", percent: 40 },
  { label: "Аргон", type: "percent_of_work", percent: 40 },
  { label: "Шины/диски с витрины", type: "percent_of_profit", percent: 40 },
  { label: "Шины/диски под заказ", type: "percent_of_profit", percent: 50 },
  { label: "Запчасти", type: "percent_of_profit", percent: 50 },
  { label: "Крепеж / кольца / секретки / дворники", type: "percent_of_work", percent: 20 },
  { label: "Автотовары с витрины", type: "percent_of_profit", percent: 50 },
  { label: "Камеры б/у", type: "percent_of_work", percent: 50 },
  { label: "Камеры новые", type: "fixed", amount: 100 },
  { label: "Дошиповка", type: "per_unit", amount: "2 / 3" },
] as const;

export const STAGE22_XLSX_MATRIX_RULES: Stage22MatrixRule[] = [
  { key: "level_1", sharesBasisPoints: [3500], label: "1 level" },
  { key: "level_2", sharesBasisPoints: [3000], label: "2 level" },
  { key: "level_3", sharesBasisPoints: [3000], label: "3 level" },
  { key: "level_1+level_2", sharesBasisPoints: [2000, 1500], label: "1 + 2" },
  { key: "level_1+level_3", sharesBasisPoints: [2500, 1000], label: "1 + 3" },
  { key: "level_2+level_3", sharesBasisPoints: [2000, 1500], label: "2 + 3" },
  { key: "level_1+level_1", sharesBasisPoints: [1750, 1750], label: "1 + 1" },
  { key: "level_2+level_2", sharesBasisPoints: [1750, 1750], label: "2 + 2" },
  { key: "level_3+level_3", sharesBasisPoints: [1750, 1750], label: "3 + 3" },
  { key: "level_1+level_1+level_1", sharesBasisPoints: [1333, 1333, 1334], label: "1 + 1 + 1" },
  { key: "level_1+level_1+level_2", sharesBasisPoints: [1500, 1500, 1000], label: "1 + 1 + 2" },
  { key: "level_1+level_1+level_3", sharesBasisPoints: [1650, 1650, 700], label: "1 + 1 + 3" },
  { key: "level_1+level_2+level_3", sharesBasisPoints: [2000, 1300, 700], label: "1 + 2 + 3" },
  { key: "level_1+level_2+level_2", sharesBasisPoints: [1500, 1250, 1250], label: "1 + 2 + 2" },
  { key: "level_1+level_3+level_3", sharesBasisPoints: [2000, 1000, 1000], label: "1 + 3 + 3" },
  { key: "level_2+level_2+level_2", sharesBasisPoints: [1333, 1333, 1334], label: "2 + 2 + 2" },
  { key: "level_2+level_3+level_3", sharesBasisPoints: [1500, 1250, 1250], label: "2 + 3 + 3" },
  { key: "level_3+level_3+level_3", sharesBasisPoints: [1333, 1333, 1334], label: "3 + 3 + 3" },
];

export const STAGE22_OPTIONAL_MATRIX_RULES: Stage22MatrixRule[] = [
  {
    key: "level_2+level_2+level_3",
    sharesBasisPoints: [0, 0, 0],
    label: "2 + 2 + 3",
  },
];

const MATRIX_RULES_BY_KEY = new Map(STAGE22_XLSX_MATRIX_RULES.map((rule) => [rule.key, rule]));

function getMatrixRuleByKey(matrixRules: Stage22MatrixRule[] | undefined, key: string) {
  if (!matrixRules) {
    return MATRIX_RULES_BY_KEY.get(key) ?? null;
  }

  return matrixRules.find((rule) => rule.key === key) ?? MATRIX_RULES_BY_KEY.get(key) ?? null;
}

function toCents(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value * 100));
}

function fromCents(cents: number) {
  return Math.round(cents) / 100;
}

function toBasisPoints(percent: number | undefined) {
  if (percent === undefined || !Number.isFinite(percent)) {
    return 0;
  }

  return Math.max(0, Math.round(percent * 100));
}

function multiplyByBasisPoints(cents: number, basisPoints: number) {
  return Math.round((cents * basisPoints) / 10_000);
}

function getRuleLabel(rule: Stage22PayrollRule) {
  return rule.label ?? rule.type;
}

function getSkillLevelOrder(level: Stage22SkillLevel) {
  return SKILL_LEVEL_ORDER.indexOf(level);
}

function buildBaseExplanation(
  input: Stage22PayrollInput,
  grossTotalCents: number,
): Stage22PayrollBaseExplanation {
  const discountTotalCents = Math.min(grossTotalCents, toCents(input.discountTotal));
  const discountedTotalCents = Math.max(0, grossTotalCents - discountTotalCents);
  const paidTotalCents = toCents(input.paidTotal);
  const eligiblePaidBaseCents = Math.min(paidTotalCents, discountedTotalCents);
  const alreadyAccruedPaidBaseCents = Math.min(
    eligiblePaidBaseCents,
    toCents(input.alreadyAccruedPaidBase),
  );
  const remainingPaidBaseCents = Math.max(0, eligiblePaidBaseCents - alreadyAccruedPaidBaseCents);

  return {
    grossTotal: fromCents(grossTotalCents),
    discountTotal: fromCents(discountTotalCents),
    discountedTotal: fromCents(discountedTotalCents),
    paidTotal: fromCents(paidTotalCents),
    eligiblePaidBase: fromCents(eligiblePaidBaseCents),
    alreadyAccruedPaidBase: fromCents(alreadyAccruedPaidBaseCents),
    remainingPaidBase: fromCents(remainingPaidBaseCents),
  };
}

function getBaseCents(base: Stage22PayrollBaseExplanation) {
  return {
    grossTotalCents: toCents(base.grossTotal),
    discountTotalCents: toCents(base.discountTotal),
    discountedTotalCents: toCents(base.discountedTotal),
    paidTotalCents: toCents(base.paidTotal),
    eligiblePaidBaseCents: toCents(base.eligiblePaidBase),
    remainingPaidBaseCents: toCents(base.remainingPaidBase),
  };
}

function unsupported(
  reason: Stage22PayrollUnsupportedReason,
  message: string,
  warnings: Stage22PayrollWarning[],
  base?: Stage22PayrollBaseExplanation,
): Stage22PayrollUnsupportedResult {
  return {
    status: "unsupported",
    reason,
    message,
    base,
    warnings,
  };
}

function allocateCents(totalCents: number, weights: number[]): number[] {
  if (totalCents <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const positiveWeights = weights.map((weight) => Math.max(0, weight));
  const totalWeight = positiveWeights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const raw = positiveWeights.map((weight, index) => {
    const value = (totalCents * weight) / totalWeight;

    return {
      index,
      floor: Math.floor(value),
      remainder: value - Math.floor(value),
    };
  });
  const allocations = raw.map((item) => item.floor);
  let remainder = totalCents - allocations.reduce((sum, cents) => sum + cents, 0);

  raw
    .slice()
    .sort((left, right) => {
      if (right.remainder === left.remainder) {
        return left.index - right.index;
      }

      return right.remainder - left.remainder;
    })
    .forEach((item) => {
      if (remainder <= 0) {
        return;
      }

      allocations[item.index] += 1;
      remainder -= 1;
    });

  return allocations;
}

function normalizeExecutors(
  executors: Stage22PayrollExecutorInput[],
): { executors: NormalizedExecutor[]; warnings: Stage22PayrollWarning[] } | Stage22PayrollUnsupportedResult {
  if (executors.length === 0) {
    return unsupported("missing_executor_input", "No order executors were provided.", []);
  }

  const warnings: Stage22PayrollWarning[] = [];
  const employeeIds = new Set<string>();
  const orderExecutorIds = new Set<string>();
  const normalizedExecutors: NormalizedExecutor[] = [];

  for (const [index, executor] of executors.entries()) {
    const employeeId = executor.employeeId?.trim();

    if (!employeeId) {
      return unsupported("missing_executor_input", "Executor input is missing employeeId.", warnings);
    }

    if (employeeIds.has(employeeId)) {
      return unsupported("duplicate_executor_input", `Executor ${employeeId} is duplicated.`, warnings);
    }

    employeeIds.add(employeeId);

    const orderExecutorId = executor.orderExecutorId?.trim() || null;

    if (orderExecutorId) {
      if (orderExecutorIds.has(orderExecutorId)) {
        return unsupported(
          "duplicate_executor_input",
          `Order executor row ${orderExecutorId} is duplicated.`,
          warnings,
        );
      }

      orderExecutorIds.add(orderExecutorId);
    }

    if (!executor.skillLevel) {
      return unsupported(
        "missing_executor_skill_level",
        `Executor ${employeeId} is missing skill level.`,
        warnings,
      );
    }

    const executorWarnings: Stage22PayrollWarning[] = [];

    if (!orderExecutorId) {
      executorWarnings.push({
        code: "legacy_executor_without_order_executor_id",
        employeeId,
        orderExecutorId,
        message: "Legacy executor can be calculated, but cannot be persisted to OrderPayrollPayout yet.",
      });
    }

    if (executor.isInShift === false) {
      executorWarnings.push({
        code: "executor_not_in_shift",
        employeeId,
        orderExecutorId,
        message: "Executor is not present in shift staff; payout amount is not changed in this pure calculator.",
      });
    }

    if (executor.arrivedAt || executor.leftAt) {
      executorWarnings.push({
        code: "attendance_timestamps_ignored",
        employeeId,
        orderExecutorId,
        message: "arrivedAt/leftAt are explainability only in this batch and do not change payout amount.",
      });
    }

    warnings.push(...executorWarnings);
    normalizedExecutors.push({
      employeeId,
      orderExecutorId,
      name: executor.name ?? null,
      skillLevel: executor.skillLevel,
      originalIndex: index,
      isInShift: executor.isInShift ?? null,
      arrivedAt: executor.arrivedAt ?? null,
      leftAt: executor.leftAt ?? null,
      warnings: executorWarnings,
    });
  }

  return { executors: normalizedExecutors, warnings };
}

function orderExecutorsBySkill(executors: NormalizedExecutor[]) {
  return executors.slice().sort((left, right) => {
    const leftOrder = getSkillLevelOrder(left.skillLevel);
    const rightOrder = getSkillLevelOrder(right.skillLevel);

    if (leftOrder === rightOrder) {
      return left.originalIndex - right.originalIndex;
    }

    return leftOrder - rightOrder;
  });
}

function toExecutorPayout(
  executor: NormalizedExecutor,
  amountCents: number,
  shareBasisPoints: number | null,
  weight: number | null,
  basisLabel: string,
): Stage22PayrollExecutorPayout {
  return {
    employeeId: executor.employeeId,
    orderExecutorId: executor.orderExecutorId,
    name: executor.name,
    skillLevel: executor.skillLevel,
    amount: fromCents(amountCents),
    amountCents,
    sharePercent: shareBasisPoints === null ? null : shareBasisPoints / 100,
    weight,
    basisLabel,
    warnings: executor.warnings,
    explanation: {
      originalIndex: executor.originalIndex,
      isInShift: executor.isInShift,
      arrivedAt: executor.arrivedAt,
      leftAt: executor.leftAt,
    },
  };
}

function getFourPlusWeights(inputWeights: Partial<Stage22FourPlusWeights> | undefined) {
  return {
    ...STAGE22_DEFAULT_FOUR_PLUS_WEIGHTS,
    ...inputWeights,
  };
}

function distributeMatrixLine(
  lineBaseCents: number,
  rule: Extract<Stage22PayrollRule, { type: "matrix" }>,
  executors: NormalizedExecutor[],
  fourPlusWeights: Partial<Stage22FourPlusWeights> | undefined,
  matrixRules: Stage22MatrixRule[] | undefined,
  warnings: Stage22PayrollWarning[],
  base: Stage22PayrollBaseExplanation,
) {
  const orderedExecutors = orderExecutorsBySkill(executors);

  if (orderedExecutors.length <= 3) {
    const key = orderedExecutors.map((executor) => executor.skillLevel).join("+");
    const matrixRule = getMatrixRuleByKey(matrixRules, key);

    if (!matrixRule) {
      return unsupported(
        "missing_matrix_row",
        `No XLSX matrix row exists for executor levels ${key}.`,
        warnings,
        base,
      );
    }

    const payoutsByOriginalIndex = new Array<Stage22PayrollExecutorPayout>(executors.length);

    orderedExecutors.forEach((executor, index) => {
      const shareBasisPoints = matrixRule.sharesBasisPoints[index] ?? 0;
      const amountCents = multiplyByBasisPoints(lineBaseCents, shareBasisPoints);

      payoutsByOriginalIndex[executor.originalIndex] = toExecutorPayout(
        executor,
        amountCents,
        shareBasisPoints,
        null,
        `XLSX matrix ${matrixRule.label}: ${shareBasisPoints / 100}% of paid base`,
      );
    });

    return {
      distributionRule: `matrix:${matrixRule.key}`,
      payouts: payoutsByOriginalIndex.filter(Boolean),
    };
  }

  if (rule.fourPlusFundPercent === undefined) {
    return unsupported(
      "missing_four_plus_fund_percent",
      "4+ executor matrix rule requires an explicit configurable fund percent.",
      warnings,
      base,
    );
  }

  const fundCents = multiplyByBasisPoints(lineBaseCents, toBasisPoints(rule.fourPlusFundPercent));
  const weights = getFourPlusWeights(fourPlusWeights);
  const slices: AllocationSlice[] = executors.map((executor) => ({
    cents: 0,
    weight: weights[executor.skillLevel],
  }));
  const allocatedCents = allocateCents(
    fundCents,
    slices.map((slice) => slice.weight),
  );

  return {
    distributionRule: `four_plus_weights:${rule.fourPlusFundPercent}%`,
    payouts: executors.map((executor, index) =>
      toExecutorPayout(
        executor,
        allocatedCents[index] ?? 0,
        null,
        slices[index]?.weight ?? null,
        `4+ weights ${weights.level_1}:${weights.level_2}:${weights.level_3}; fund ${rule.fourPlusFundPercent}%`,
      ),
    ),
  };
}

/**
 * Distributes a pre-computed fund among multiple executors using matrix proportions.
 * Unlike distributeMatrixLine, this treats the fund as the total to distribute (not as a line base amount).
 * The sharesBasisPoints from matrix rules are used as proportions, not as direct percentages.
 */
function distributeByMatrixProportions(
  fundCents: number,
  executors: NormalizedExecutor[],
  matrixRules: Stage22MatrixRule[] | undefined,
  warnings: Stage22PayrollWarning[],
  base: Stage22PayrollBaseExplanation,
  fourPlusWeights?: Partial<Stage22FourPlusWeights>,
) {
  const orderedExecutors = orderExecutorsBySkill(executors);

  if (orderedExecutors.length <= 3) {
    const key = orderedExecutors.map((executor) => executor.skillLevel).join("+");
    const matrixRule = getMatrixRuleByKey(matrixRules, key);

    if (!matrixRule) {
      return unsupported(
        "missing_matrix_row",
        `No XLSX matrix row exists for executor levels ${key}.`,
        warnings,
        base,
      );
    }

    // Calculate total proportion basis points
    const totalProportionBasisPoints = matrixRule.sharesBasisPoints.reduce((sum, share) => sum + share, 0);

    if (totalProportionBasisPoints === 0) {
      return unsupported(
        "unsupported_multi_executor_rule",
        `Matrix proportions for ${key} sum to zero.`,
        warnings,
        base,
      );
    }

    const payoutsByOriginalIndex = new Array<Stage22PayrollExecutorPayout>(executors.length);

    orderedExecutors.forEach((executor, index) => {
      const proportionBasisPoints = matrixRule.sharesBasisPoints[index] ?? 0;
      // Distribute fund proportionally: fund * (proportion / total_proportions)
      const amountCents = Math.round((fundCents * proportionBasisPoints) / totalProportionBasisPoints);

      payoutsByOriginalIndex[executor.originalIndex] = toExecutorPayout(
        executor,
        amountCents,
        proportionBasisPoints,
        null,
        `Non-matrix fund distributed by matrix proportions ${matrixRule.label}: ${proportionBasisPoints}/${totalProportionBasisPoints} of ${fundCents / 100}₽`,
      );
    });

    return {
      distributionRule: `matrix_proportions:${matrixRule.key}`,
      payouts: payoutsByOriginalIndex.filter(Boolean),
    };
  }

  // For 4+ executors, use fourPlusWeights if provided
  if (!fourPlusWeights) {
    return unsupported(
      "unsupported_multi_executor_rule",
      "4+ executors for non-matrix services requires fourPlusWeights configuration",
      warnings,
      base,
    );
  }

  const weights = getFourPlusWeights(fourPlusWeights);
  const slices: AllocationSlice[] = executors.map((executor) => ({
    cents: 0,
    weight: weights[executor.skillLevel],
  }));
  const allocatedCents = allocateCents(
    fundCents,
    slices.map((slice) => slice.weight),
  );

  return {
    distributionRule: `four_plus_weights_proportions`,
    payouts: executors.map((executor, index) =>
      toExecutorPayout(
        executor,
        allocatedCents[index] ?? 0,
        null,
        slices[index]?.weight ?? null,
        `4+ weights ${weights.level_1}:${weights.level_2}:${weights.level_3}; fund ${fundCents / 100}₽`,
      ),
    ),
  };
}

function calculateMatrixFullRuleAmount(
  discountedCents: number,
  rule: Extract<Stage22PayrollRule, { type: "matrix" }>,
  executors: NormalizedExecutor[],
  matrixRules: Stage22MatrixRule[] | undefined,
) {
  const orderedExecutors = orderExecutorsBySkill(executors);

  if (orderedExecutors.length <= 3) {
    const key = orderedExecutors.map((executor) => executor.skillLevel).join("+");
    const matrixRule = getMatrixRuleByKey(matrixRules, key);

    if (!matrixRule) {
      return 0;
    }

    return matrixRule.sharesBasisPoints.reduce(
      (sum, shareBasisPoints) => sum + multiplyByBasisPoints(discountedCents, shareBasisPoints),
      0,
    );
  }

  return multiplyByBasisPoints(discountedCents, toBasisPoints(rule.fourPlusFundPercent));
}

function distributeSingleExecutorLine(
  dueAmountCents: number,
  executors: NormalizedExecutor[],
  ruleType: Stage22PayrollRule["type"],
  warnings: Stage22PayrollWarning[],
  base: Stage22PayrollBaseExplanation,
) {
  if (executors.length !== 1) {
    return unsupported(
      "unsupported_multi_executor_rule",
      `${ruleType} multi-executor distribution is not specified in the XLSX matrix.`,
      warnings,
      base,
    );
  }

  return {
    distributionRule: `single_executor:${ruleType}`,
    payouts: [
      toExecutorPayout(executors[0], dueAmountCents, null, null, `${ruleType}: one executor receives line amount`),
    ],
  };
}

function getValidReducedPercent(rule: Extract<Stage22PayrollRule, { type: "percent_of_work" }>) {
  if (
    rule.reducedEmployeePercent === undefined ||
    !Number.isFinite(rule.reducedEmployeePercent) ||
    rule.reducedEmployeePercent <= 0 ||
    rule.reducedEmployeePercent > rule.percent
  ) {
    return null;
  }

  return rule.reducedEmployeePercent;
}

function distributeReducedPercentOfWorkLine(
  lineBaseCents: number,
  rule: Extract<Stage22PayrollRule, { type: "percent_of_work" }>,
  executors: NormalizedExecutor[],
  warnings: Stage22PayrollWarning[],
  base: Stage22PayrollBaseExplanation,
) {
  const reducedPercent = getValidReducedPercent(rule);

  if (reducedPercent === null) {
    return null;
  }

  if (executors.length === 1) {
    const executor = executors[0];
    const percent = executor.skillLevel === "level_1" ? rule.percent : reducedPercent;
    const shareBasisPoints = toBasisPoints(percent);

    return {
      distributionRule: `reduced_percent:${percent}%`,
      payouts: [
        toExecutorPayout(
          executor,
          multiplyByBasisPoints(lineBaseCents, shareBasisPoints),
          shareBasisPoints,
          null,
          `Reduced percent rule: ${percent}%`,
        ),
      ],
    };
  }

  if (executors.length !== 2) {
    return unsupported(
      "unsupported_multi_executor_rule",
      "Reduced percent rule supports one executor or exactly one level 1 plus one level 2/3 executor.",
      warnings,
      base,
    );
  }

  const level1Executors = executors.filter((executor) => executor.skillLevel === "level_1");
  const reducedExecutors = executors.filter((executor) => executor.skillLevel !== "level_1");

  if (level1Executors.length !== 1 || reducedExecutors.length !== 1) {
    return unsupported(
      "unsupported_multi_executor_rule",
      "Reduced percent rule supports only one level 1 executor together with one level 2/3 executor.",
      warnings,
      base,
    );
  }

  const level1Percent = rule.percent - reducedPercent;
  const payoutsByOriginalIndex = new Array<Stage22PayrollExecutorPayout>(executors.length);

  for (const executor of executors) {
    const percent = executor.skillLevel === "level_1" ? level1Percent : reducedPercent;
    const shareBasisPoints = toBasisPoints(percent);
    payoutsByOriginalIndex[executor.originalIndex] = toExecutorPayout(
      executor,
      multiplyByBasisPoints(lineBaseCents, shareBasisPoints),
      shareBasisPoints,
      null,
      `Reduced percent rule: ${percent}%`,
    );
  }

  return {
    distributionRule: `reduced_percent:${level1Percent}%+${reducedPercent}%`,
    payouts: payoutsByOriginalIndex.filter(Boolean),
  };
}

function buildLineBaseAllocations(
  lines: Stage22PayrollLineInput[],
  base: Stage22PayrollBaseExplanation,
) {
  const { grossTotalCents, discountTotalCents, discountedTotalCents, remainingPaidBaseCents } =
    getBaseCents(base);
  const lineGrossCents = lines.map((line) => toCents(line.amount));
  const discountAllocations = allocateCents(discountTotalCents, lineGrossCents);
  const discountedLineCents = lineGrossCents.map((grossCents, index) =>
    Math.max(0, grossCents - (discountAllocations[index] ?? 0)),
  );
  const paidBaseAllocations = allocateCents(remainingPaidBaseCents, discountedLineCents);

  return lines.map((line, index) => {
    const grossCents = lineGrossCents[index] ?? 0;
    const discountedCents =
      discountedTotalCents === 0 || grossTotalCents === 0 ? 0 : (discountedLineCents[index] ?? 0);
    const remainingPaidBaseCents =
      discountedTotalCents === 0 ? 0 : (paidBaseAllocations[index] ?? 0);

    return {
      line,
      grossCents,
      discountedCents,
      remainingPaidBaseCents,
      paidRatio:
        discountedCents <= 0 ? 0 : Math.min(1, remainingPaidBaseCents / discountedCents),
    };
  });
}

function aggregateExecutorPayouts(lines: Stage22PayrollLineExplanation[]) {
  const byEmployeeId = new Map<string, Stage22PayrollExecutorPayout>();

  for (const line of lines) {
    for (const payout of line.executorPayouts) {
      const existing = byEmployeeId.get(payout.employeeId);

      if (!existing) {
        byEmployeeId.set(payout.employeeId, { ...payout });
        continue;
      }

      existing.amountCents += payout.amountCents;
      existing.amount = fromCents(existing.amountCents);
    }
  }

  return Array.from(byEmployeeId.values()).sort(
    (left, right) => left.explanation.originalIndex - right.explanation.originalIndex,
  );
}

export function calculateStage22Payroll(input: Stage22PayrollInput): Stage22PayrollResult {
  const grossTotalCents =
    input.grossTotal === undefined
      ? input.lines.reduce((sum, line) => sum + toCents(line.amount), 0)
      : toCents(input.grossTotal);
  const base = buildBaseExplanation(input, grossTotalCents);
  const { paidTotalCents, remainingPaidBaseCents } = getBaseCents(base);

  if (input.lines.length === 0 || grossTotalCents === 0) {
    return unsupported("empty_order", "Order has no payable lines.", [], base);
  }

  if (paidTotalCents === 0) {
    return {
      status: "not_due",
      reason: "unpaid",
      totalAmount: 0,
      totalAmountCents: 0,
      base,
      warnings: [],
    };
  }

  if (remainingPaidBaseCents === 0) {
    return {
      status: "not_due",
      reason: "no_remaining_paid_base",
      totalAmount: 0,
      totalAmountCents: 0,
      base,
      warnings: [],
    };
  }

  const normalized = normalizeExecutors(input.executors);

  if ("status" in normalized) {
    return { ...normalized, base };
  }

  const { executors, warnings } = normalized;
  const lineAllocations = buildLineBaseAllocations(input.lines, base);
  const lineExplanations: Stage22PayrollLineExplanation[] = [];

  for (const allocation of lineAllocations) {
    const { line, grossCents, discountedCents, remainingPaidBaseCents: lineBaseCents, paidRatio } = allocation;

    if (!line.rule) {
      return unsupported("missing_salary_rule", `Line ${line.id} has no salary rule.`, warnings, base);
    }

    let dueAmountCents = 0;
    let fullRuleAmountCents = 0;
    let ruleBaseCents = lineBaseCents;
    let costAmountCents: number | null = null;
    let distribution:
      | { distributionRule: string; payouts: Stage22PayrollExecutorPayout[] }
      | Stage22PayrollUnsupportedResult;

    switch (line.rule.type) {
      case "matrix": {
        distribution = distributeMatrixLine(
          lineBaseCents,
          line.rule,
          executors,
          input.fourPlusWeights,
          input.matrixRules,
          warnings,
          base,
        );
        dueAmountCents =
          "status" in distribution
            ? 0
            : distribution.payouts.reduce((sum, payout) => sum + payout.amountCents, 0);
        fullRuleAmountCents = calculateMatrixFullRuleAmount(
          discountedCents,
          line.rule,
          executors,
          input.matrixRules,
        );
        break;
      }
      case "percent_of_work": {
        const reducedDistribution = distributeReducedPercentOfWorkLine(
          lineBaseCents,
          line.rule,
          executors,
          warnings,
          base,
        );

        if (reducedDistribution) {
          distribution = reducedDistribution;
          dueAmountCents =
            "status" in distribution
              ? 0
              : distribution.payouts.reduce((sum, payout) => sum + payout.amountCents, 0);
          const reducedPercent = getValidReducedPercent(line.rule);
          fullRuleAmountCents =
            executors.length === 1 && executors[0].skillLevel !== "level_1" && reducedPercent !== null
              ? multiplyByBasisPoints(discountedCents, toBasisPoints(reducedPercent))
              : multiplyByBasisPoints(discountedCents, toBasisPoints(line.rule.percent));
          break;
        }

        dueAmountCents = multiplyByBasisPoints(lineBaseCents, toBasisPoints(line.rule.percent));
        fullRuleAmountCents = multiplyByBasisPoints(discountedCents, toBasisPoints(line.rule.percent));

        // For multi-executor non-matrix percent_of_work: use matrix proportions to distribute computed fund
        if (executors.length > 1) {
          distribution = distributeByMatrixProportions(
            dueAmountCents,
            executors,
            input.matrixRules,
            warnings,
            base,
            input.fourPlusWeights,
          );
        } else {
          distribution = distributeSingleExecutorLine(dueAmountCents, executors, line.rule.type, warnings, base);
        }
        break;
      }
      case "percent_of_profit": {
        if (
          line.costPrice === null ||
          line.costPrice === undefined ||
          !Number.isFinite(line.costPrice) ||
          line.costPrice <= 0
        ) {
          return unsupported(
            "missing_profit_cost_price",
            `Line ${line.id} uses profit-based payroll and has no cost price.`,
            warnings,
            base,
          );
        }

        const quantity = line.quantity ?? 1;
        const fullCostCents = Math.max(0, Math.round(toCents(line.costPrice) * quantity));
        costAmountCents = Math.round(fullCostCents * paidRatio);
        ruleBaseCents = Math.max(0, lineBaseCents - costAmountCents);
        dueAmountCents = multiplyByBasisPoints(ruleBaseCents, toBasisPoints(line.rule.percent));
        fullRuleAmountCents = multiplyByBasisPoints(
          Math.max(0, discountedCents - fullCostCents),
          toBasisPoints(line.rule.percent),
        );
        distribution = distributeSingleExecutorLine(dueAmountCents, executors, line.rule.type, warnings, base);
        break;
      }
      case "fixed": {
        const quantity = line.quantity ?? 1;
        fullRuleAmountCents = Math.max(0, Math.round(toCents(line.rule.amount) * quantity));
        dueAmountCents = Math.round(fullRuleAmountCents * paidRatio);
        distribution = distributeSingleExecutorLine(dueAmountCents, executors, line.rule.type, warnings, base);
        break;
      }
      case "per_unit": {
        const quantity = line.quantity ?? 1;
        fullRuleAmountCents = Math.max(0, Math.round(toCents(line.rule.amount) * quantity));
        dueAmountCents = Math.round(fullRuleAmountCents * paidRatio);

        // For multi-executor per_unit: use matrix proportions to distribute computed fund
        if (executors.length > 1) {
          distribution = distributeByMatrixProportions(
            dueAmountCents,
            executors,
            input.matrixRules,
            warnings,
            base,
          );
        } else {
          distribution = distributeSingleExecutorLine(dueAmountCents, executors, line.rule.type, warnings, base);
        }
        break;
      }
      default:
        return unsupported("unsupported_rule", `Line ${line.id} has unsupported salary rule.`, warnings, base);
    }

    if ("status" in distribution) {
      return distribution;
    }

    lineExplanations.push({
      id: line.id,
      label: line.label ?? null,
      ruleType: line.rule.type,
      ruleLabel: getRuleLabel(line.rule),
      grossAmount: fromCents(grossCents),
      discountedAmount: fromCents(discountedCents),
      remainingPaidBase: fromCents(lineBaseCents),
      fullRuleAmount: fromCents(fullRuleAmountCents),
      dueAmount: fromCents(dueAmountCents),
      baseAmount: fromCents(ruleBaseCents),
      costAmount: costAmountCents === null ? null : fromCents(costAmountCents),
      paidRatio,
      distributionRule: distribution.distributionRule,
      executorPayouts: distribution.payouts,
    });
  }

  const executorPayouts = aggregateExecutorPayouts(lineExplanations);
  const totalAmountCents = executorPayouts.reduce((sum, payout) => sum + payout.amountCents, 0);

  return {
    status: "supported",
    totalAmount: fromCents(totalAmountCents),
    totalAmountCents,
    base,
    lines: lineExplanations,
    executors: executorPayouts,
    warnings,
  };
}

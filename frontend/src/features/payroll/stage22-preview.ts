import {
  calculateStage22Payroll,
  type Stage22FourPlusWeights,
  type Stage22MatrixRule,
  type Stage22PayrollInput,
  type Stage22PayrollResult,
  type Stage22PayrollRule,
  type Stage22SkillLevel,
} from "@/features/payroll/stage22-calculator";

type UnknownRecord = Record<string, unknown>;

export type Stage22PayrollPreviewLineInput = {
  id: string;
  label?: string | null;
  unitPrice: number;
  quantity: number;
  costPriceSnapshot?: number | null;
  salaryRuleSnapshotJson?: unknown;
};

export type Stage22PayrollPreviewPaymentInput = {
  amount: number;
};

export type Stage22PayrollPreviewExecutorInput = {
  employeeId?: string | null;
  orderExecutorId?: string | null;
  skillLevelSnapshot?: string | null;
  workPercentSnapshot?: number | null;
  employeeNameSnapshot?: string | null;
};

export type Stage22PayrollPreviewShiftStaffInput = {
  employeeId?: string | null;
  arrivedAt?: string | null;
  leftAt?: string | null;
};

export type Stage22PayrollPreviewOrderInput = {
  id: string;
  subtotal: number;
  discount: number;
  total: number;
  legacyAccrualTotal?: number | null;
  alreadyAccruedPaidBase?: number | null;
  lines: Stage22PayrollPreviewLineInput[];
  payments: Stage22PayrollPreviewPaymentInput[];
  executors: Stage22PayrollPreviewExecutorInput[];
  shiftStaff?: Stage22PayrollPreviewShiftStaffInput[];
};

export type Stage22PayrollPreviewComparison =
  | "equal"
  | "differs"
  | "legacy_missing"
  | "stage22_unsupported"
  | "not_due";

export type Stage22PayrollPreview = {
  orderId: string;
  input: Stage22PayrollInput;
  result: Stage22PayrollResult;
  paidTotal: number;
  legacyAccrualTotal: number | null;
  comparison: Stage22PayrollPreviewComparison;
};

const STAGE22_RULE_MARKER_KEYS = ["stage22PayrollRule", "stage22Rule", "stage22Payroll"] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(value: unknown): UnknownRecord | null {
  if (isRecord(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readFiniteNumber(record: UnknownRecord, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readPositiveFiniteNumber(record: UnknownRecord, key: string) {
  const value = readFiniteNumber(record, key);
  return value === null || value <= 0 ? null : value;
}

function readNonNegativeNumber(record: UnknownRecord, key: string) {
  const value = readFiniteNumber(record, key);
  return value === null || value < 0 ? null : value;
}

function readStage22RuleMarker(snapshot: UnknownRecord) {
  for (const key of STAGE22_RULE_MARKER_KEYS) {
    const marker = snapshot[key];

    if (isRecord(marker)) {
      return marker;
    }
  }

  return null;
}

function readFourPlusWeights(marker: UnknownRecord): Partial<Stage22FourPlusWeights> | undefined {
  const weights = marker.fourPlusWeights;

  if (!isRecord(weights)) {
    return undefined;
  }

  const level1 = readPositiveFiniteNumber(weights, "level_1");
  const level2 = readPositiveFiniteNumber(weights, "level_2");
  const level3 = readPositiveFiniteNumber(weights, "level_3");

  if (level1 === null || level2 === null || level3 === null) {
    return undefined;
  }

  return {
    level_1: level1,
    level_2: level2,
    level_3: level3,
  };
}

function readMatrixRules(marker: UnknownRecord): Stage22MatrixRule[] | undefined {
  const matrixRules = marker.matrixRules;

  if (!Array.isArray(matrixRules)) {
    return undefined;
  }

  const normalized = matrixRules
    .map((rule) => {
      if (!isRecord(rule) || typeof rule.key !== "string" || !Array.isArray(rule.sharesBasisPoints)) {
        return null;
      }

      const sharesBasisPoints = rule.sharesBasisPoints;

      if (
        sharesBasisPoints.length === 0 ||
        sharesBasisPoints.some(
          (share) =>
            typeof share !== "number" ||
            !Number.isFinite(share) ||
            !Number.isInteger(share) ||
            share < 0 ||
            share > 10_000,
        ) ||
        sharesBasisPoints.reduce((sum, share) => sum + share, 0) <= 0 ||
        sharesBasisPoints.reduce((sum, share) => sum + share, 0) > 10_000
      ) {
        return null;
      }

      return {
        key: rule.key,
        label: typeof rule.label === "string" ? rule.label : rule.key,
        sharesBasisPoints: [...sharesBasisPoints],
      };
    })
    .filter((rule): rule is Stage22MatrixRule => rule !== null);

  return normalized.length > 0 ? normalized : undefined;
}

function mapMarkedStage22Rule(snapshot: UnknownRecord): {
  rule: Stage22PayrollRule;
  fourPlusWeights?: Partial<Stage22FourPlusWeights>;
  matrixRules?: Stage22MatrixRule[];
} | null {
  const marker = readStage22RuleMarker(snapshot);

  if (!marker || marker.type !== "matrix") {
    return null;
  }

  const fourPlusFundPercent = readPositiveFiniteNumber(marker, "fourPlusFundPercent");
  const fourPlusWeights = readFourPlusWeights(marker);
  const matrixRules = readMatrixRules(marker);

  return {
    rule: {
      type: "matrix",
      label: typeof marker.label === "string" ? marker.label : undefined,
      fourPlusFundPercent: fourPlusFundPercent ?? undefined,
    },
    ...(fourPlusWeights ? { fourPlusWeights } : {}),
    ...(matrixRules ? { matrixRules } : {}),
  };
}

function mapStage22PayrollRuleDetailsFromSnapshot(snapshotJson: unknown): {
  rule: Stage22PayrollRule | null;
  fourPlusWeights?: Partial<Stage22FourPlusWeights>;
  matrixRules?: Stage22MatrixRule[];
} {
  const snapshot = readJsonObject(snapshotJson);

  if (!snapshot) {
    return { rule: null };
  }

  const markedRule = mapMarkedStage22Rule(snapshot);

  if (markedRule) {
    return markedRule;
  }

  switch (snapshot.ruleType) {
    case "percent_of_work": {
      const percent = readNonNegativeNumber(snapshot, "percent");
      const reducedPercent =
        snapshot.reducedEmployeePercentEnabled === true
          ? readPositiveFiniteNumber(snapshot, "reducedEmployeePercentValue")
          : null;

      return {
        rule:
          percent === null
            ? null
            : {
                type: "percent_of_work",
                percent,
                ...(reducedPercent !== null && reducedPercent <= percent
                  ? { reducedEmployeePercent: reducedPercent }
                  : {}),
              },
      };
    }
    case "percent_of_profit": {
      const percent = readNonNegativeNumber(snapshot, "percent");

      if (percent === null || snapshot.usesCostPrice !== true) {
        return { rule: null };
      }

      return { rule: { type: "percent_of_profit", percent } };
    }
    case "fixed": {
      const amount = readNonNegativeNumber(snapshot, "fixedAmount");
      return { rule: amount === null ? null : { type: "fixed", amount } };
    }
    case "per_unit": {
      const amount = readNonNegativeNumber(snapshot, "perUnitAmount");
      return { rule: amount === null ? null : { type: "per_unit", amount } };
    }
    default:
      return { rule: null };
  }
}

export function mapStage22PayrollRuleFromSnapshot(snapshotJson: unknown): Stage22PayrollRule | null {
  return mapStage22PayrollRuleDetailsFromSnapshot(snapshotJson).rule;
}

function mapSkillLevel(value: string | null | undefined): Stage22SkillLevel | null {
  if (value === "level_1" || value === "level_2" || value === "level_3") {
    return value;
  }

  return null;
}

function roundMoney(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.round(value * 100) / 100;
}

function toComparisonCents(value: number | null) {
  return value === null ? null : Math.round(value * 100);
}

function buildComparison(
  result: Stage22PayrollResult,
  legacyAccrualTotal: number | null,
): Stage22PayrollPreviewComparison {
  if (result.status === "not_due") {
    return "not_due";
  }

  if (result.status === "unsupported") {
    return "stage22_unsupported";
  }

  if (legacyAccrualTotal === null) {
    return "legacy_missing";
  }

  return toComparisonCents(legacyAccrualTotal) === toComparisonCents(result.totalAmount)
    ? "equal"
    : "differs";
}

export function buildStage22PayrollPreview(order: Stage22PayrollPreviewOrderInput): Stage22PayrollPreview {
  const paidTotal = roundMoney(order.payments.reduce((sum, payment) => sum + roundMoney(payment.amount), 0));
  const shiftStaffByEmployeeId = new Map(
    (order.shiftStaff ?? [])
      .filter((staff): staff is Required<Pick<Stage22PayrollPreviewShiftStaffInput, "employeeId">> &
        Stage22PayrollPreviewShiftStaffInput => Boolean(staff.employeeId))
      .map((staff) => [staff.employeeId, staff]),
  );
  const mappedLines = order.lines.map((line) => ({
    line,
    mappedRule: mapStage22PayrollRuleDetailsFromSnapshot(line.salaryRuleSnapshotJson),
  }));
  const fourPlusWeights = mappedLines.find((line) => line.mappedRule.fourPlusWeights)?.mappedRule.fourPlusWeights;
  const matrixRules = mappedLines.find((line) => line.mappedRule.matrixRules)?.mappedRule.matrixRules;
  const input: Stage22PayrollInput = {
    orderId: order.id,
    grossTotal: roundMoney(order.subtotal),
    discountTotal: roundMoney(order.discount),
    paidTotal,
    alreadyAccruedPaidBase: roundMoney(order.alreadyAccruedPaidBase ?? 0),
    ...(fourPlusWeights ? { fourPlusWeights } : {}),
    ...(matrixRules ? { matrixRules } : {}),
    lines: mappedLines.map(({ line, mappedRule }) => ({
      id: line.id,
      label: line.label ?? undefined,
      amount: roundMoney(line.unitPrice * line.quantity),
      quantity: line.quantity,
      costPrice: line.costPriceSnapshot ?? null,
      rule: mappedRule.rule,
    })),
    executors: order.executors.map((executor) => {
      const employeeId = executor.employeeId ?? null;
      const shiftStaff = employeeId ? shiftStaffByEmployeeId.get(employeeId) : undefined;

      return {
        employeeId,
        orderExecutorId: executor.orderExecutorId ?? null,
        name: executor.employeeNameSnapshot ?? null,
        skillLevel: mapSkillLevel(executor.skillLevelSnapshot),
        isInShift: employeeId ? Boolean(shiftStaff) : undefined,
        arrivedAt: shiftStaff?.arrivedAt ?? null,
        leftAt: shiftStaff?.leftAt ?? null,
      };
    }),
  };
  const result = calculateStage22Payroll(input);
  const legacyAccrualTotal =
    typeof order.legacyAccrualTotal === "number" && Number.isFinite(order.legacyAccrualTotal)
      ? roundMoney(order.legacyAccrualTotal)
      : null;

  return {
    orderId: order.id,
    input,
    result,
    paidTotal,
    legacyAccrualTotal,
    comparison: buildComparison(result, legacyAccrualTotal),
  };
}

import {
  STAGE22_OPTIONAL_MATRIX_RULES,
  STAGE22_XLSX_MATRIX_RULES,
  type Stage22MatrixRule,
} from "@/features/payroll/stage22-calculator";

export const DEFAULT_FOUR_PLUS_FUND_PERCENT = 40;

export const DEFAULT_FOUR_PLUS_WEIGHTS = {
  level_1: 3,
  level_2: 2,
  level_3: 1,
};

export type PayrollFormulaSettingsDto = {
  fourPlusFundPercent: number | null;
  fourPlusWeights: {
    level_1: number;
    level_2: number;
    level_3: number;
  };
  matrixRules: Stage22MatrixRule[];
};

export type PayrollFormulaSettingsJson = {
  fourPlusFundPercent: number | null;
  fourPlusFundPercentCleared?: boolean;
  level_1: number;
  level_2: number;
  level_3: number;
  matrixRules?: Array<{
    key: string;
    sharesBasisPoints: number[];
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readFiniteNumber(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function cloneDefaultMatrixRules(): Stage22MatrixRule[] {
  return STAGE22_XLSX_MATRIX_RULES.map((rule) => ({
    key: rule.key,
    label: rule.label,
    sharesBasisPoints: [...rule.sharesBasisPoints],
  }));
}

function cloneOptionalMatrixRule(rule: Stage22MatrixRule): Stage22MatrixRule {
  return {
    key: rule.key,
    label: rule.label,
    sharesBasisPoints: [...rule.sharesBasisPoints],
  };
}

function normalizeMatrixRuleShares(
  item: unknown,
  rule: Stage22MatrixRule,
): Stage22MatrixRule | null {
  if (!isRecord(item) || !Array.isArray(item.sharesBasisPoints)) {
    return null;
  }

  const sharesBasisPoints = item.sharesBasisPoints;

  if (
    sharesBasisPoints.length !== rule.sharesBasisPoints.length ||
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
    label: rule.label,
    sharesBasisPoints: [...sharesBasisPoints],
  };
}

function normalizeStoredMatrixRules(value: unknown): Stage22MatrixRule[] {
  if (!Array.isArray(value)) {
    return cloneDefaultMatrixRules();
  }

  const byKey = new Map<string, unknown>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== "string") {
      return cloneDefaultMatrixRules();
    }

    byKey.set(item.key, item);
  }

  const requiredRules = STAGE22_XLSX_MATRIX_RULES.map((defaultRule) => {
    const normalizedRule = normalizeMatrixRuleShares(byKey.get(defaultRule.key), defaultRule);

    return normalizedRule ?? cloneOptionalMatrixRule(defaultRule);
  });
  const optionalRules = STAGE22_OPTIONAL_MATRIX_RULES.flatMap((optionalRule) => {
    const normalizedRule = normalizeMatrixRuleShares(byKey.get(optionalRule.key), optionalRule);

    return normalizedRule ? [normalizedRule] : [];
  });

  return [...requiredRules, ...optionalRules];
}

function validateMatrixRulesInput(value: unknown): Stage22MatrixRule[] {
  if (value === undefined) {
    return cloneDefaultMatrixRules();
  }

  if (!Array.isArray(value)) {
    throw new Error("Матрица 1-3 мастера должна быть списком строк.");
  }

  const byKey = new Map<string, unknown>();

  for (const item of value) {
    if (!isRecord(item) || typeof item.key !== "string") {
      throw new Error("В матрице 1-3 мастера есть некорректная строка.");
    }

    byKey.set(item.key, item);
  }

  const knownRuleKeys = new Set([
    ...STAGE22_XLSX_MATRIX_RULES.map((rule) => rule.key),
    ...STAGE22_OPTIONAL_MATRIX_RULES.map((rule) => rule.key),
  ]);
  const unknownRuleKey = [...byKey.keys()].find((key) => !knownRuleKeys.has(key));

  if (unknownRuleKey) {
    throw new Error("Матрица 1-3 мастера содержит неизвестную строку.");
  }

  const requiredRules = STAGE22_XLSX_MATRIX_RULES.map((defaultRule) => {
    const normalizedRule = normalizeMatrixRuleShares(byKey.get(defaultRule.key), defaultRule);

    if (!normalizedRule) {
      throw new Error(`Матрица 1-3 мастера: проверьте проценты для ${defaultRule.label}.`);
    }

    return normalizedRule;
  });
  const optionalRules = STAGE22_OPTIONAL_MATRIX_RULES.flatMap((optionalRule) => {
    const item = byKey.get(optionalRule.key);

    if (item === undefined) {
      return [];
    }

    const normalizedRule = normalizeMatrixRuleShares(item, optionalRule);

    if (!normalizedRule) {
      throw new Error(`Матрица 1-3 мастера: проверьте проценты для ${optionalRule.label}.`);
    }

    return [normalizedRule];
  });

  return [...requiredRules, ...optionalRules];
}

function normalizeStoredFourPlusFundPercent(record: Record<string, unknown>) {
  const rawFourPlusFundPercent = record.fourPlusFundPercent;

  if (
    typeof rawFourPlusFundPercent === "number" &&
    Number.isFinite(rawFourPlusFundPercent) &&
    rawFourPlusFundPercent > 0 &&
    rawFourPlusFundPercent <= 100
  ) {
    return rawFourPlusFundPercent;
  }

  if (rawFourPlusFundPercent === null) {
    return record.fourPlusFundPercentCleared === true
      ? null
      : DEFAULT_FOUR_PLUS_FUND_PERCENT;
  }

  return rawFourPlusFundPercent === undefined
    ? DEFAULT_FOUR_PLUS_FUND_PERCENT
    : null;
}

export function defaultPayrollFormulaSettings(): PayrollFormulaSettingsDto {
  return {
    fourPlusFundPercent: DEFAULT_FOUR_PLUS_FUND_PERCENT,
    fourPlusWeights: { ...DEFAULT_FOUR_PLUS_WEIGHTS },
    matrixRules: cloneDefaultMatrixRules(),
  };
}

export function readStoredPayrollSettings(value: unknown): PayrollFormulaSettingsDto | null {
  const record = isRecord(value) ? value : null;

  if (!record) {
    return null;
  }

  const fourPlusFundPercent = normalizeStoredFourPlusFundPercent(record);
  const level1 = readFiniteNumber(record, "level_1");
  const level2 = readFiniteNumber(record, "level_2");
  const level3 = readFiniteNumber(record, "level_3");

  if (level1 === null || level2 === null || level3 === null) {
    return null;
  }

  return {
    fourPlusFundPercent,
    fourPlusWeights: {
      level_1: level1,
      level_2: level2,
      level_3: level3,
    },
    matrixRules: normalizeStoredMatrixRules(record.matrixRules),
  };
}

export function validatePayrollFormulaSettings(body: unknown): PayrollFormulaSettingsDto {
  if (!isRecord(body) || !isRecord(body.fourPlusWeights)) {
    throw new Error("Некорректные настройки формулы зарплаты.");
  }

  const rawFourPlusFundPercent = body.fourPlusFundPercent;

  if (
    rawFourPlusFundPercent !== null &&
    (typeof rawFourPlusFundPercent !== "number" ||
      !Number.isFinite(rawFourPlusFundPercent) ||
      rawFourPlusFundPercent <= 0 ||
      rawFourPlusFundPercent > 100)
  ) {
    throw new Error("Процент фонда при 4+ сотрудниках должен быть пустым или числом больше 0 и не больше 100.");
  }
  const fourPlusFundPercent =
    rawFourPlusFundPercent === null ? null : rawFourPlusFundPercent;

  const level1 = readFiniteNumber(body.fourPlusWeights, "level_1");
  const level2 = readFiniteNumber(body.fourPlusWeights, "level_2");
  const level3 = readFiniteNumber(body.fourPlusWeights, "level_3");
  const matrixRules = validateMatrixRulesInput(body.matrixRules);

  if (
    level1 === null ||
    level2 === null ||
    level3 === null ||
    level1 <= 0 ||
    level2 <= 0 ||
    level3 <= 0
  ) {
    throw new Error("Каждый коэффициент уровня должен быть числом больше 0.");
  }

  return {
    fourPlusFundPercent,
    fourPlusWeights: {
      level_1: level1,
      level_2: level2,
      level_3: level3,
    },
    matrixRules,
  };
}

export function toStoredPayrollFormulaSettingsJson(
  settings: PayrollFormulaSettingsDto,
): PayrollFormulaSettingsJson {
  return {
    fourPlusFundPercent: settings.fourPlusFundPercent,
    fourPlusFundPercentCleared: settings.fourPlusFundPercent === null,
    level_1: settings.fourPlusWeights.level_1,
    level_2: settings.fourPlusWeights.level_2,
    level_3: settings.fourPlusWeights.level_3,
    matrixRules: settings.matrixRules.map((rule) => ({
      key: rule.key,
      sharesBasisPoints: [...rule.sharesBasisPoints],
    })),
  };
}

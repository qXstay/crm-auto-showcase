import type { SalaryRuleSnapshot } from "@/features/pricing/types";

export type DemoOrderLineAccrualSnapshot = {
  ruleType: SalaryRuleSnapshot["ruleType"];
  amount: number;
  lineAmount: number;
  baseAmount: number;
  percentApplied: number | null;
  fixedAmountApplied: number | null;
  perUnitAmountApplied: number | null;
  usesCostPrice: boolean;
  costAmount: number | null;
  reducedPercentApplied: boolean;
};

type SalaryAccrualInput = {
  unitPrice: number;
  quantity: number;
  salaryRuleSnapshot: SalaryRuleSnapshot | null;
  costPrice: number | null;
};

function roundMoney(value: number) {
  return Math.round(value);
}

export function calculateLineAccrualSnapshot({
  unitPrice,
  quantity,
  salaryRuleSnapshot,
  costPrice,
}: SalaryAccrualInput): DemoOrderLineAccrualSnapshot | null {
  if (!salaryRuleSnapshot || quantity <= 0 || unitPrice < 0) {
    return null;
  }

  const lineAmount = Math.max(0, roundMoney(unitPrice * quantity));

  switch (salaryRuleSnapshot.ruleType) {
    case "percent_of_work": {
      const percentApplied = salaryRuleSnapshot.percent;
      const amount = roundMoney((lineAmount * percentApplied) / 100);

      return {
        ruleType: salaryRuleSnapshot.ruleType,
        amount,
        lineAmount,
        baseAmount: lineAmount,
        percentApplied,
        fixedAmountApplied: null,
        perUnitAmountApplied: null,
        usesCostPrice: false,
        costAmount: null,
        reducedPercentApplied: false,
      };
    }
    case "percent_of_profit": {
      if (
        !salaryRuleSnapshot.usesCostPrice ||
        costPrice === null ||
        !Number.isFinite(costPrice) ||
        costPrice < 0
      ) {
        return null;
      }

      const percentApplied = salaryRuleSnapshot.percent;
      const costAmount = Math.max(0, roundMoney(costPrice * quantity));
      const baseAmount = Math.max(0, lineAmount - costAmount);
      const amount = roundMoney((baseAmount * percentApplied) / 100);

      return {
        ruleType: salaryRuleSnapshot.ruleType,
        amount,
        lineAmount,
        baseAmount,
        percentApplied,
        fixedAmountApplied: null,
        perUnitAmountApplied: null,
        usesCostPrice: salaryRuleSnapshot.usesCostPrice,
        costAmount,
        reducedPercentApplied: false,
      };
    }
    case "fixed": {
      const amount = roundMoney(salaryRuleSnapshot.fixedAmount * quantity);

      return {
        ruleType: salaryRuleSnapshot.ruleType,
        amount,
        lineAmount,
        baseAmount: lineAmount,
        percentApplied: null,
        fixedAmountApplied: salaryRuleSnapshot.fixedAmount,
        perUnitAmountApplied: null,
        usesCostPrice: false,
        costAmount: null,
        reducedPercentApplied: false,
      };
    }
    case "per_unit": {
      const amount = roundMoney(salaryRuleSnapshot.perUnitAmount * quantity);

      return {
        ruleType: salaryRuleSnapshot.ruleType,
        amount,
        lineAmount,
        baseAmount: lineAmount,
        percentApplied: null,
        fixedAmountApplied: null,
        perUnitAmountApplied: salaryRuleSnapshot.perUnitAmount,
        usesCostPrice: false,
        costAmount: null,
        reducedPercentApplied: false,
      };
    }
    default:
      return null;
  }
}

export function calculateOrderAccrualTotal(
  lines: Array<{
    salaryRuleSnapshot?: SalaryRuleSnapshot | null;
    salaryAccrualSnapshot?: DemoOrderLineAccrualSnapshot | null;
  }>,
) {
  const hasUnsupportedRule = lines.some(
    (line) => line.salaryRuleSnapshot && line.salaryAccrualSnapshot === null,
  );

  if (hasUnsupportedRule) {
    return null;
  }

  return lines.reduce((total, line) => total + (line.salaryAccrualSnapshot?.amount ?? 0), 0);
}

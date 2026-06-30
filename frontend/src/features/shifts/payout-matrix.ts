import {
  formatEmployeeSkillLevelLabel,
  resolveStage1EmployeeSkillLevel,
} from "@/features/settings-employees/skill-level";
import type { DemoShiftOrderPayoutSnapshotMember, DemoShiftStaffMember } from "@/features/shifts/types";
import type { DemoEmployeeSkillLevel } from "@/features/settings-employees/types";

type MatrixRule = {
  key: string;
  weights: number[];
  ruleLabel: string;
};

type OrderedStaffMember = DemoShiftStaffMember & {
  originalIndex: number;
  skillLevel: DemoEmployeeSkillLevel;
};

type OrderedStaffResolution =
  | {
      status: "supported";
      members: OrderedStaffMember[];
    }
  | {
      status: "unsupported";
      reasonLabel: string;
    };

type SupportedMatrixPayout = {
  status: "supported";
  members: DemoShiftOrderPayoutSnapshotMember[];
};

type UnsupportedMatrixPayout = {
  status: "unsupported";
  reasonLabel: string;
  members: DemoShiftOrderPayoutSnapshotMember[];
};

export type ShiftMatrixPayoutResult = SupportedMatrixPayout | UnsupportedMatrixPayout;

const SKILL_LEVEL_ORDER: DemoEmployeeSkillLevel[] = ["level_1", "level_2", "level_3"];

const MATRIX_RULES = new Map<string, MatrixRule>([
  ["level_1", { key: "level_1", weights: [35], ruleLabel: "1 сотрудник" }],
  ["level_2", { key: "level_2", weights: [30], ruleLabel: "1 сотрудник" }],
  ["level_3", { key: "level_3", weights: [30], ruleLabel: "1 сотрудник" }],
  ["level_1+level_1", { key: "level_1+level_1", weights: [17.5, 17.5], ruleLabel: "1+1" }],
  ["level_1+level_2", { key: "level_1+level_2", weights: [20, 15], ruleLabel: "1+2" }],
  ["level_1+level_3", { key: "level_1+level_3", weights: [25, 10], ruleLabel: "1+3" }],
  ["level_2+level_2", { key: "level_2+level_2", weights: [17.5, 17.5], ruleLabel: "2+2" }],
  ["level_2+level_3", { key: "level_2+level_3", weights: [20, 15], ruleLabel: "2+3" }],
  ["level_3+level_3", { key: "level_3+level_3", weights: [17.5, 17.5], ruleLabel: "3+3" }],
  ["level_1+level_1+level_2", { key: "level_1+level_1+level_2", weights: [15, 15, 10], ruleLabel: "1+1+2" }],
  ["level_1+level_1+level_3", { key: "level_1+level_1+level_3", weights: [16.5, 16.5, 7], ruleLabel: "1+1+3" }],
  ["level_1+level_2+level_2", { key: "level_1+level_2+level_2", weights: [15, 12.5, 12.5], ruleLabel: "1+2+2" }],
  ["level_1+level_2+level_3", { key: "level_1+level_2+level_3", weights: [20, 13, 7], ruleLabel: "1+2+3" }],
  ["level_1+level_3+level_3", { key: "level_1+level_3+level_3", weights: [20, 10, 10], ruleLabel: "1+3+3" }],
  ["level_2+level_3+level_3", { key: "level_2+level_3+level_3", weights: [15, 12.5, 12.5], ruleLabel: "2+3+3" }],
]);

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function allocateByWeights(totalAmount: number, weights: number[]) {
  if (totalAmount <= 0 || weights.length === 0) {
    return weights.map(() => 0);
  }

  const positiveWeights = weights.map((weight) => Math.max(0, weight));
  const totalWeight = positiveWeights.reduce((sum, weight) => sum + weight, 0);

  if (totalWeight <= 0) {
    return weights.map(() => 0);
  }

  const totalCents = Math.round(totalAmount * 100);
  const rawAllocations = positiveWeights.map((weight, index) => {
    const raw = (totalCents * weight) / totalWeight;
    const floor = Math.floor(raw);

    return {
      index,
      floor,
      remainder: raw - floor,
    };
  });

  const allocations = rawAllocations.map((item) => item.floor);
  let remainder = totalCents - allocations.reduce((sum, amount) => sum + amount, 0);

  rawAllocations
    .slice()
    .sort((left, right) => right.remainder - left.remainder)
    .forEach((item) => {
      if (remainder <= 0) {
        return;
      }

      allocations[item.index] += 1;
      remainder -= 1;
    });

  return allocations.map((amount) => amount / 100);
}

function getSkillLevelOrder(level: DemoEmployeeSkillLevel) {
  return SKILL_LEVEL_ORDER.indexOf(level);
}

function resolveOrderedStaffMembers(staff: DemoShiftStaffMember[]): OrderedStaffResolution {
  const members: OrderedStaffMember[] = [];

  for (const [index, member] of staff.entries()) {
    const resolvedSkillLevel = resolveStage1EmployeeSkillLevel(
      member.skillLevelSnapshot,
      member.workPercentSnapshot,
    );

    if (!resolvedSkillLevel) {
      return {
        status: "unsupported" as const,
        reasonLabel: "Для сотрудников смены не задан уровень мастерства.",
      };
    }

    members.push({
      ...member,
      originalIndex: index,
      skillLevel: resolvedSkillLevel,
    });
  }

  members.sort((left, right) => {
    const leftOrder = getSkillLevelOrder(left.skillLevel);
    const rightOrder = getSkillLevelOrder(right.skillLevel);

    if (leftOrder === rightOrder) {
      return left.originalIndex - right.originalIndex;
    }

    return leftOrder - rightOrder;
  });

  return {
    status: "supported" as const,
    members,
  };
}

function buildMemberBasisLabel(level: DemoEmployeeSkillLevel, ruleLabel: string, rawPercent: number) {
  return `${formatEmployeeSkillLevelLabel(level)} · правило ${ruleLabel} · ${rawPercent}%`;
}

export function buildShiftMatrixPayout(
  totalAmount: number,
  staff: DemoShiftStaffMember[],
): ShiftMatrixPayoutResult {
  if (staff.length === 0) {
    return {
      status: "unsupported",
      reasonLabel: "В смене не указан состав сотрудников.",
      members: [],
    };
  }

  if (staff.length > 3) {
    return {
      status: "unsupported",
      reasonLabel: "Распределение для 4+ сотрудников не настроено.",
      members: [],
    };
  }

  const orderedStaffResult = resolveOrderedStaffMembers(staff);

  if (orderedStaffResult.status === "unsupported") {
    return {
      status: "unsupported",
      reasonLabel: orderedStaffResult.reasonLabel,
      members: [],
    };
  }

  const orderedStaff = orderedStaffResult.members;
  const ruleKey = orderedStaff.map((member) => member.skillLevel).join("+");
  const rule = MATRIX_RULES.get(ruleKey);

  if (!rule) {
    return {
      status: "unsupported",
      reasonLabel: `Для комбинации ${orderedStaff.map((member) => formatEmployeeSkillLevelLabel(member.skillLevel)).join(", ")} нет подтверждённого правила.`,
      members: [],
    };
  }

  const allocatedAmounts = allocateByWeights(totalAmount, rule.weights);
  const membersByOriginalIndex = new Array<DemoShiftOrderPayoutSnapshotMember>(staff.length);

  orderedStaff.forEach((member, index) => {
    membersByOriginalIndex[member.originalIndex] = {
      employeeId: member.employeeId,
      employeeName: member.employeeNameSnapshot,
      sharePercent: rule.weights[index] ?? 0,
      basisLabel: buildMemberBasisLabel(member.skillLevel, rule.ruleLabel, rule.weights[index] ?? 0),
      employeeAmount: roundMoney(allocatedAmounts[index] ?? 0),
    };
  });

  return {
    status: "supported",
    members: membersByOriginalIndex.filter(Boolean),
  };
}

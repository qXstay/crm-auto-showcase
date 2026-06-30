import type { DemoEmployeeSkillLevel } from "@/features/settings-employees/types";

export const EMPLOYEE_SKILL_LEVEL_OPTIONS: Array<{
  value: DemoEmployeeSkillLevel;
  label: string;
}> = [
  { value: "level_1", label: "1 уровень" },
  { value: "level_2", label: "2 уровень" },
  { value: "level_3", label: "3 уровень" },
];

const EMPLOYEE_SKILL_LEVEL_LABELS = new Map(
  EMPLOYEE_SKILL_LEVEL_OPTIONS.map((option) => [option.value, option.label]),
);

const LEGACY_SKILL_LEVEL_BY_WORK_PERCENT = new Map<number, DemoEmployeeSkillLevel>([
  [35, "level_1"],
  [30, "level_2"],
  [40, "level_3"],
]);

const STAGE1_SINGLE_WORK_PERCENT_BY_SKILL_LEVEL = new Map<DemoEmployeeSkillLevel, number>([
  ["level_1", 35],
  ["level_2", 30],
  ["level_3", 30],
]);

export function isEmployeeSkillLevel(value: unknown): value is DemoEmployeeSkillLevel {
  return (
    value === "level_1" ||
    value === "level_2" ||
    value === "level_3"
  );
}

export function formatEmployeeSkillLevelLabel(
  level: DemoEmployeeSkillLevel | string | null | undefined,
) {
  if (!level) {
    return "В смене";
  }

  return EMPLOYEE_SKILL_LEVEL_LABELS.get(level as DemoEmployeeSkillLevel) ?? String(level);
}

export function deriveLegacyEmployeeSkillLevel(workPercent: number) {
  return LEGACY_SKILL_LEVEL_BY_WORK_PERCENT.get(workPercent) ?? null;
}

export function resolveStage1EmployeeSkillLevel(
  skillLevel: DemoEmployeeSkillLevel | string | null | undefined,
  workPercent: number | null | undefined,
) {
  if (isEmployeeSkillLevel(skillLevel)) {
    return skillLevel;
  }

  if (typeof workPercent !== "number" || Number.isNaN(workPercent)) {
    return null;
  }

  return deriveLegacyEmployeeSkillLevel(workPercent);
}

export function getLegacyWorkPercentForSkillLevel(
  level: DemoEmployeeSkillLevel | string | null | undefined,
) {
  if (!level || !isEmployeeSkillLevel(level)) {
    return null;
  }

  return STAGE1_SINGLE_WORK_PERCENT_BY_SKILL_LEVEL.get(level) ?? null;
}

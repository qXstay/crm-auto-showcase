export type DemoEmployeeRole = string;
export type DemoEmployeeSkillLevel = "level_1" | "level_2" | "level_3";

export type DemoEmployeeBranchAccess = {
  branchId: string;
  isDefault: boolean;
  canSwitchInto: boolean;
};

export type DemoEmployeeHardDeleteState = {
  canDelete: boolean;
  reason: string | null;
  suggestion: string | null;
};

export type DemoEmployeeRecord = {
  id: string;
  phone: string;
  pin: string;
  lastName: string;
  firstName: string;
  middleName: string;
  role: DemoEmployeeRole;
  hiredAt: string;
  firedAt: string | null;
  lastActivityAt: string | null;
  skillLevel: DemoEmployeeSkillLevel | null;
  workPercent: number;
  shiftMinimum: number;
  addMinimumToWorkPercent: boolean;
  canBeAssignedExecutor: boolean;
  branchAccesses?: DemoEmployeeBranchAccess[];
  hardDelete?: DemoEmployeeHardDeleteState;
};

export type DemoEmployeesStore = {
  employees: DemoEmployeeRecord[];
};

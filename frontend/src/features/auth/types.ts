import type { DemoEmployeeRecord } from "@/features/settings-employees/types";
import type { DemoRoleRecord } from "@/features/settings-roles/types";
import type { DemoBranchSummary } from "@/features/branches/types";

export type DemoAuthSession = {
  currentEmployeeId: string;
  signedInAt: string;
  phoneSnapshot: string;
  roleIdSnapshot: string;
  currentBranchId: string;
};

export type DemoAuthContext = {
  session: DemoAuthSession;
  employee: DemoEmployeeRecord;
  role: DemoRoleRecord | null;
  permissionIds: string[];
  employeeLabel: string;
  employeeDisplayLabel: string;
  roleLabel: string;
  currentBranch: DemoBranchSummary;
  availableBranches: DemoBranchSummary[];
};

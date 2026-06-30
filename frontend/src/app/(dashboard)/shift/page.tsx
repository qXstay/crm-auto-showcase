import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import {
  getShiftCurrentState,
  listShiftActivity,
  listShiftHistory,
} from "@/server/repositories/shift-read-repository";
import { listShiftAssignableEmployees } from "@/server/repositories/shift-write-repository";
import { ShiftReadScreen } from "@/features/shifts/components/shift-read-screen";

export const dynamic = "force-dynamic";

export default async function ShiftPage() {
  const auth = await requireServerAuthContext();

  if (!hasServerPermission(auth, "shift.view")) {
    return null;
  }

  const [currentShift, historyResult, activityResult, staffOptions] = await Promise.all([
    getShiftCurrentState(auth.currentBranch.id),
    listShiftHistory(auth.currentBranch.id),
    listShiftActivity(auth.currentBranch.id),
    listShiftAssignableEmployees(auth.currentBranch.id),
  ]);

  return (
    <ShiftReadScreen
      shiftState={{
        currentShift,
        history: historyResult.history,
        activity: activityResult.activity,
      }}
      currentEmployeeId={auth.employee.id}
      staffOptions={staffOptions}
      permissions={{
        canOpenShift: hasServerPermission(auth, "shift.open"),
        canManageCurrentShift: hasServerPermission(auth, "shift.open"),
        canCloseShift: hasServerPermission(auth, "shift.close"),
      }}
    />
  );
}

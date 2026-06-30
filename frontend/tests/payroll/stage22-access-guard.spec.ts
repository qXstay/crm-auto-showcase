import { expect, test } from "@playwright/test";

import { getRequiredPermissionForPath } from "../../src/shared/permissions/config";

test("payroll settings page uses the same permission as payroll formula API", () => {
  expect(getRequiredPermissionForPath("/settings/payroll")).toBe("settings.services");
  expect(getRequiredPermissionForPath("/settings/payroll/details")).toBe("settings.services");
});

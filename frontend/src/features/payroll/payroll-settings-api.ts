"use client";

import { apiRequest } from "@/lib/api/client";
import type { PayrollFormulaSettingsDto } from "@/features/payroll/payroll-formula-settings";

export type { PayrollFormulaSettingsDto };

type PayrollFormulaSettingsResponse = {
  settings: PayrollFormulaSettingsDto;
  affectedFourPlusOrderCount?: number;
};

export async function fetchPayrollFormulaSettings() {
  return apiRequest<PayrollFormulaSettingsResponse>(
    "/api/settings/payroll-formula",
  );
}

export async function savePayrollFormulaSettings(settings: PayrollFormulaSettingsDto) {
  const response = await apiRequest<PayrollFormulaSettingsResponse>(
    "/api/settings/payroll-formula",
    {
      method: "PUT",
      body: JSON.stringify(settings),
    },
  );

  return response.settings;
}

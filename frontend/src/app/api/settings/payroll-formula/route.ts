import { NextRequest } from "next/server";
import { Prisma } from "@/server/db/prisma-client";
import { requireApiPermission } from "@/server/api/guards";
import { badRequest, okJson } from "@/server/api/responses";
import { prisma } from "@/server/db/prisma";
import { logAuditEvent } from "@/server/services/audit";
import {
  defaultPayrollFormulaSettings,
  readStoredPayrollSettings,
  toStoredPayrollFormulaSettingsJson,
  validatePayrollFormulaSettings,
  type PayrollFormulaSettingsDto,
} from "@/features/payroll/payroll-formula-settings";

const DEFAULT_PAYROLL_FORMULA_SETTINGS_ID = "payroll-formula-default";

async function countAffectedFourPlusOrders(branchId: string) {
  const orders = await prisma.orderPayrollAccrual.findMany({
    where: {
      statusReason: "missing_four_plus_fund_percent",
      order: {
        branchId,
      },
    },
    select: {
      orderId: true,
    },
    distinct: ["orderId"],
  });

  return orders.length;
}

export async function GET() {
  const auth = await requireApiPermission("settings.services");

  if (!auth.ok) {
    return auth.response;
  }

  const rows = await prisma.payrollFormulaSettings.findMany({
    select: { fourPlusLevelWeightsJson: true },
    orderBy: { id: "asc" },
    take: 2,
  });

  if (rows.length > 1) {
    return badRequest("Найдено больше одной строки настроек формулы зарплаты.", 409);
  }

  const settings =
    rows.length === 0
      ? defaultPayrollFormulaSettings()
      : readStoredPayrollSettings(rows[0].fourPlusLevelWeightsJson) ??
        defaultPayrollFormulaSettings();
  const affectedFourPlusOrderCount =
    settings.fourPlusFundPercent === null
      ? await countAffectedFourPlusOrders(auth.context.currentBranch.id)
      : 0;

  return okJson({
    settings,
    affectedFourPlusOrderCount,
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireApiPermission("settings.services");

  if (!auth.ok) {
    return auth.response;
  }

  const body = await request.json().catch(() => null);
  let settings: PayrollFormulaSettingsDto;

  try {
    settings = validatePayrollFormulaSettings(body);
  } catch (error) {
    return badRequest(
      error instanceof Error ? error.message : "Некорректные настройки формулы зарплаты.",
    );
  }

  const storedJson = toStoredPayrollFormulaSettingsJson(settings);
  const result = await prisma.$transaction(async (tx) => {
    const rows = await tx.payrollFormulaSettings.findMany({
      select: { id: true },
      orderBy: { id: "asc" },
      take: 2,
    });

    if (rows.length > 1) {
      return { ok: false as const };
    }

    if (rows.length === 0) {
      await tx.payrollFormulaSettings.create({
        data: {
          id: DEFAULT_PAYROLL_FORMULA_SETTINGS_ID,
          fourPlusLevelWeightsJson: storedJson as Prisma.InputJsonValue,
        },
      });
    } else {
      await tx.payrollFormulaSettings.update({
        where: { id: rows[0].id },
        data: {
          fourPlusLevelWeightsJson: storedJson as Prisma.InputJsonValue,
        },
      });
    }

    return { ok: true as const };
  });

  if (!result.ok) {
    return badRequest("Найдено больше одной строки настроек формулы зарплаты.", 409);
  }

  await logAuditEvent({
    eventType: "settings.payroll_formula.update",
    actorEmployeeId: auth.context.employee.id,
    actorUserId: null,
    branchId: auth.context.currentBranch.id,
    entityType: "payroll_formula_settings",
    entityId: DEFAULT_PAYROLL_FORMULA_SETTINGS_ID,
    payload: storedJson,
  });

  return okJson({ settings });
}

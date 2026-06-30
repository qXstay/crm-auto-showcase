import type { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import { resolveStage1EmployeeSkillLevel } from "@/features/settings-employees/skill-level";
import type {
  DemoShiftAccountBreakdownItem,
  DemoShift22ExecutorPreview,
  DemoShift22Preview,
  DemoShift22SkippedReasonCategory,
  DemoShift22SkippedUnsupportedOrder,
  DemoClosedShiftSnapshot,
  DemoShiftActivityItem,
  DemoShiftExpenseItem,
  DemoShiftOrderSnapshot,
  DemoShiftOrderPayoutSnapshotMember,
  DemoShiftSalaryBreakdown,
  DemoShiftSalaryBreakdownMember,
  DemoShiftStaffMember,
  DemoShiftState,
} from "@/features/shifts/types";
import { buildShiftMatrixPayout } from "@/features/shifts/payout-matrix";
import {
  buildStage22PayrollPreview,
  type Stage22PayrollPreviewExecutorInput,
  type Stage22PayrollPreviewShiftStaffInput,
} from "@/features/payroll/stage22-preview";
import type { Stage22PayrollUnsupportedReason } from "@/features/payroll/stage22-calculator";
import {
  buildCarLabel,
  decimalToNumber,
  formatDateTime,
  formatPaymentAccountDisplay,
  formatPaymentDisplay,
  formatPaymentMethodDisplay,
  formatPrice,
  getClientDisplayName,
  parseJsonValue,
  splitDateTimeLabel,
} from "@/server/repositories/operational-utils";
import {
  isOrderFinishedStatus,
  isOrderMarkedForDeletion,
} from "@/features/orders/lifecycle";

type ShiftRecord = Prisma.ShiftGetPayload<{
  include: {
    staff: {
      include: {
        employee: true;
      };
    };
    orders: {
      include: {
        lines: true;
        payments: true;
        executors: true;
      };
    };
  };
}>;

type FallbackShiftActivity = DemoShiftActivityItem & {
  sortValue: number;
};

function isFinishedOrder(status: string) {
  return isOrderFinishedStatus(status) || isOrderMarkedForDeletion(status);
}

function hasPaidPayment(order: Pick<ShiftRecord["orders"][number], "payments" | "paymentSnapshotJson">) {
  const payment = parseJsonValue<{ paymentStatus?: string | null }>(
    order.paymentSnapshotJson,
    {},
  );

  return order.payments.length > 0 || payment.paymentStatus === "Оплачен";
}

function getShiftWorkStatusLabel(status: string): DemoShiftOrderSnapshot["workStatusLabel"] {
  if (isOrderFinishedStatus(status) || isOrderMarkedForDeletion(status)) {
    return "Выполнен";
  }

  if (status === "Черновик") {
    return "Черновик";
  }

  return "В работе";
}

function sumPaymentRows(payments: Array<{ amount: Prisma.Decimal }>) {
  return payments.reduce(
    (total, payment) => total + (decimalToNumber(payment.amount) ?? 0),
    0,
  );
}

function getShiftOrderPaidAmount(order: Pick<
  ShiftRecord["orders"][number],
  "payments" | "paymentSnapshotJson" | "totalAmount"
>) {
  const paymentRowsTotal = sumPaymentRows(order.payments);

  if (paymentRowsTotal > 0) {
    return paymentRowsTotal;
  }

  const payment = parseJsonValue<{ paidAmount?: number | null }>(
    order.paymentSnapshotJson,
    {},
  );

  if (typeof payment.paidAmount === "number" && payment.paidAmount > 0) {
    return payment.paidAmount;
  }

  return decimalToNumber(order.totalAmount) ?? 0;
}

function getValidDate(value: string | Date | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  return Number.isFinite(date.getTime()) ? date : null;
}

function getLatestPaymentPaidAt(payments: Array<{ paidAt: Date }>) {
  return payments.reduce<Date | null>((latest, payment) => {
    if (!latest || payment.paidAt.getTime() > latest.getTime()) {
      return payment.paidAt;
    }

    return latest;
  }, null);
}

function getShiftOrderSortTime(order: ShiftRecord["orders"][number]) {
  const payment = parseJsonValue<{ paidAt?: string | null }>(
    order.paymentSnapshotJson,
    {},
  );
  const date =
    getLatestPaymentPaidAt(order.payments) ??
    getValidDate(payment.paidAt) ??
    getValidDate(order.completedAt) ??
    order.updatedAt ??
    order.createdAt;

  return date.getTime();
}

function compareShiftOrdersByRecency(
  left: ShiftRecord["orders"][number],
  right: ShiftRecord["orders"][number],
) {
  const timeDiff = getShiftOrderSortTime(right) - getShiftOrderSortTime(left);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  const numberDiff = right.number - left.number;

  if (numberDiff !== 0) {
    return numberDiff;
  }

  return right.id.localeCompare(left.id);
}

function mapShiftStaff(staff: ShiftRecord["staff"]): DemoShiftStaffMember[] {
  return staff.map((member) => {
    const workPercentSnapshot =
      decimalToNumber(member.workPercentSnapshot) ??
      decimalToNumber(member.employee?.workPercent) ??
      null;

    return {
      id: member.id,
      employeeId: member.employeeId,
      employeeNameSnapshot: member.employeeNameSnapshot,
      workPercentSnapshot,
      shiftMinimumSnapshot:
        decimalToNumber(member.shiftMinimumSnapshot) ??
        decimalToNumber(member.employee?.shiftMinimum) ??
        null,
      skillLevelSnapshot: resolveStage1EmployeeSkillLevel(
        member.skillLevelSnapshot ?? member.employee?.skillLevel ?? null,
        workPercentSnapshot,
      ),
      arrivedAt: member.arrivedAt?.toISOString() ?? null,
      leftAt: member.leftAt?.toISOString() ?? null,
    };
  });
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function getBreakdownMemberKey(employeeId: string | null, employeeName: string) {
  return employeeId ? `employee:${employeeId}` : `name:${employeeName}`;
}

function upsertBreakdownMember(
  membersMap: Map<string, DemoShiftSalaryBreakdownMember>,
  params: {
    employeeId: string | null;
    employeeName: string;
    sharePercent: number;
    basisLabel: string;
  },
) {
  const memberKey = getBreakdownMemberKey(params.employeeId, params.employeeName);
  const existingMember = membersMap.get(memberKey);

  if (existingMember) {
    return existingMember;
  }

  const nextMember: DemoShiftSalaryBreakdownMember = {
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    sharePercent: params.sharePercent,
    basisLabel: params.basisLabel,
    totalAmount: 0,
    orders: [],
  };

  membersMap.set(memberKey, nextMember);
  return nextMember;
}

function buildSalaryBreakdown(
  staff: DemoShiftStaffMember[],
  orders: DemoShiftOrderSnapshot[],
): DemoShiftSalaryBreakdown {
  const unresolvedOrders = orders.filter((order) => order.salaryAccrualAmount === null);

  if (unresolvedOrders.length > 0) {
    return {
      status: "unsupported",
      reasonLabel: "В смене есть заказ с услугой без подтверждённого правила начисления.",
      members: [],
    };
  }

  const membersMap = new Map<string, DemoShiftSalaryBreakdownMember>();
  const fallbackOrders = orders.filter(
    (order) => !order.payoutSnapshotMembers || order.payoutSnapshotMembers.length === 0,
  );

  for (const order of orders) {
    if (!order.payoutSnapshotMembers || order.payoutSnapshotMembers.length === 0) {
      continue;
    }

    order.payoutSnapshotMembers.forEach((snapshotMember) => {
      if (snapshotMember.employeeAmount <= 0) {
        return;
      }

      const orderFundAmount = order.salaryAccrualAmount ?? 0;

      const member = upsertBreakdownMember(membersMap, {
        employeeId: snapshotMember.employeeId,
        employeeName: snapshotMember.employeeName,
        sharePercent: snapshotMember.sharePercent,
        basisLabel: snapshotMember.basisLabel,
      });

      member.orders.push({
        orderId: order.id,
        orderNumber: order.number,
        orderFundAmount: roundMoney(orderFundAmount),
        employeeAmount: roundMoney(snapshotMember.employeeAmount),
      });
      member.totalAmount = roundMoney(member.totalAmount + snapshotMember.employeeAmount);
    });
  }

  if (fallbackOrders.length === 0) {
    return {
      status: "supported",
      mode: "shift_share",
      members: [...membersMap.values()],
    };
  }

  for (const fallbackOrder of fallbackOrders) {
    const orderFundAmount = fallbackOrder.salaryAccrualAmount ?? 0;
    const matrixPayout = buildShiftMatrixPayout(orderFundAmount, staff);

    if (matrixPayout.status === "unsupported") {
      return {
        status: "unsupported",
        reasonLabel: matrixPayout.reasonLabel,
        members: [...membersMap.values()],
      };
    }

    matrixPayout.members.forEach((memberPayout) => {
      if (memberPayout.employeeAmount <= 0) {
        return;
      }

      const member = upsertBreakdownMember(membersMap, {
        employeeId: memberPayout.employeeId,
        employeeName: memberPayout.employeeName,
        sharePercent: memberPayout.sharePercent,
        basisLabel: memberPayout.basisLabel,
      });

      member.orders.push({
        orderId: fallbackOrder.id,
        orderNumber: fallbackOrder.number,
        orderFundAmount: roundMoney(orderFundAmount),
        employeeAmount: roundMoney(memberPayout.employeeAmount),
      });
      member.totalAmount = roundMoney(member.totalAmount + memberPayout.employeeAmount);
    });
  }

  return {
    status: "supported",
    mode: "shift_share",
    members: [...membersMap.values()],
  };
}

function mapShift22Staff(
  staff: ShiftRecord["staff"],
): Stage22PayrollPreviewShiftStaffInput[] {
  return staff.map((member) => ({
    employeeId: member.employeeId,
    arrivedAt: member.arrivedAt?.toISOString() ?? null,
    leftAt: member.leftAt?.toISOString() ?? null,
  }));
}

function mapShift22OrderExecutors(
  order: ShiftRecord["orders"][number],
): {
  executors: Stage22PayrollPreviewExecutorInput[];
  hasPersistedExecutors: boolean;
} {
  if (order.executors.length > 0) {
    return {
      hasPersistedExecutors: true,
      executors: order.executors
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((executor) => ({
          employeeId: executor.employeeId,
          orderExecutorId: executor.id,
          skillLevelSnapshot: executor.skillLevelSnapshot,
          workPercentSnapshot: decimalToNumber(executor.workPercentSnapshot),
          employeeNameSnapshot: executor.employeeNameSnapshot,
        })),
    };
  }

  const executorSnapshot = parseJsonValue<{
    executorEmployeeId?: string | null;
    executorNameSnapshot?: string | null;
  }>(order.executorSnapshotJson, {});
  const legacyEmployeeId =
    executorSnapshot.executorEmployeeId ?? order.executorEmployeeId ?? null;
  const legacyName = executorSnapshot.executorNameSnapshot ?? null;

  if (!legacyEmployeeId && !legacyName) {
    return {
      hasPersistedExecutors: false,
      executors: [],
    };
  }

  return {
    hasPersistedExecutors: false,
    executors: [
      {
        employeeId: legacyEmployeeId,
        orderExecutorId: null,
        skillLevelSnapshot: null,
        workPercentSnapshot: null,
        employeeNameSnapshot: legacyName,
      },
    ],
  };
}

function getShift22MemberKey(employeeId: string | null, employeeName: string | null) {
  return employeeId ? `employee:${employeeId}` : `name:${employeeName ?? ""}`;
}

function upsertShift22Member(
  membersMap: Map<string, DemoShift22ExecutorPreview>,
  params: {
    employeeId: string | null;
    employeeName: string | null;
  },
) {
  const memberKey = getShift22MemberKey(params.employeeId, params.employeeName);
  const existingMember = membersMap.get(memberKey);

  if (existingMember) {
    return existingMember;
  }

  const nextMember: DemoShift22ExecutorPreview = {
    employeeId: params.employeeId,
    employeeName: params.employeeName,
    totalAmount: 0,
    orderCount: 0,
    orders: [],
  };

  membersMap.set(memberKey, nextMember);
  return nextMember;
}

function hasLegacyPayrollSnapshot(order: ShiftRecord["orders"][number]) {
  return (
    order.salaryAccrualTotal != null ||
    order.payoutBreakdownSnapshotJson != null ||
    order.lines.some(
      (line) =>
        line.salaryAccrualAmount != null ||
        line.salaryAccrualSnapshotJson != null,
    )
  );
}

function getShift22SkippedReasonCategoryLabel(
  category: DemoShift22SkippedReasonCategory,
) {
  switch (category) {
    case "old_data_transition":
      return "Сохранённый расчёт";
    case "missing_config":
      return "Нужна настройка";
    case "missing_rule":
      return "Нет правила";
    case "open_business_decision":
      return "Нужно правило";
    case "data_issue":
      return "Проверить данные";
    case "unsupported_case":
      return "Не поддержано";
  }
}

function buildShift22SkippedOrderExplanation(params: {
  reason: Stage22PayrollUnsupportedReason;
  order: ShiftRecord["orders"][number];
  hasPersistedExecutors: boolean;
}): Pick<
  DemoShift22SkippedUnsupportedOrder,
  "reasonCategory" | "reasonCategoryLabel" | "reasonLabel"
> {
  const hasLegacySnapshot = hasLegacyPayrollSnapshot(params.order);
  let reasonCategory: DemoShift22SkippedReasonCategory;
  let reasonLabel: string;

  switch (params.reason) {
    case "missing_salary_rule":
      if (hasLegacySnapshot) {
        reasonCategory = "old_data_transition";
        reasonLabel = "старый заказ без снимка зарплаты для новой формулы. Исторические суммы не пересчитывались.";
      } else {
        reasonCategory = "missing_rule";
        reasonLabel = "у услуги нет правила зарплаты для новой формулы.";
      }
      break;
    case "missing_profit_cost_price":
      reasonCategory = "missing_config";
      reasonLabel = "Не указана закупочная цена.";
      break;
    case "missing_executor_input":
      if (hasLegacySnapshot) {
        reasonCategory = "old_data_transition";
        reasonLabel = "старый заказ без данных исполнителя для новой формулы. Исторические суммы не пересчитывались.";
      } else {
        reasonCategory = "data_issue";
        reasonLabel = "не выбран исполнитель.";
      }
      break;
    case "duplicate_executor_input":
      reasonCategory = "data_issue";
      reasonLabel = "исполнитель указан повторно. Нужно проверить заказ.";
      break;
    case "missing_executor_skill_level":
      if (!params.hasPersistedExecutors || hasLegacySnapshot) {
        reasonCategory = "old_data_transition";
        reasonLabel = "старый заказ без уровня мастера для новой формулы. Исторические суммы не пересчитывались.";
      } else {
        reasonCategory = "missing_config";
        reasonLabel = "у исполнителя не указан уровень мастера.";
      }
      break;
    case "missing_matrix_row":
      reasonCategory = "open_business_decision";
      reasonLabel = "для такой комбинации уровней нет правила в матрице.";
      break;
    case "missing_four_plus_fund_percent":
      reasonCategory = "missing_config";
      reasonLabel = "не задан процент фонда для правила 4+.";
      break;
    case "unsupported_multi_executor_rule":
      reasonCategory = "open_business_decision";
      reasonLabel = "сценарий с несколькими исполнителями для этой услуги требует отдельного правила.";
      break;
    case "unsupported_rule":
      reasonCategory = "unsupported_case";
      reasonLabel = "у услуги неподдерживаемый тип правила зарплаты для новой формулы.";
      break;
    case "empty_order":
      reasonCategory = "data_issue";
      reasonLabel = "в заказе нет оплачиваемых строк для подробного расчёта.";
      break;
  }

  return {
    reasonCategory,
    reasonCategoryLabel: getShift22SkippedReasonCategoryLabel(reasonCategory),
    reasonLabel,
  };
}

export function buildShift22Preview(
  shift: ShiftRecord,
  orders: ShiftRecord["orders"],
): DemoShift22Preview {
  if (orders.length === 0) {
    return { status: "no_order_data" };
  }

  const paidOrders = orders.filter((order) => sumPaymentRows(order.payments) > 0);

  if (paidOrders.length === 0) {
    return {
      status: "not_due",
      reason: "no_paid_orders",
    };
  }

  const shiftStaff = mapShift22Staff(shift.staff);
  const membersMap = new Map<string, DemoShift22ExecutorPreview>();
  let calculatedOrderCount = 0;
  let notDueOrderCount = 0;
  let skippedUnsupportedOrderCount = 0;
  const skippedUnsupportedOrders: DemoShift22SkippedUnsupportedOrder[] = [];
  let firstNotDueReason: string | null = null;

  for (const order of paidOrders) {
    const { executors, hasPersistedExecutors } = mapShift22OrderExecutors(order);
    const preview = buildStage22PayrollPreview({
      id: order.id,
      subtotal: decimalToNumber(order.subtotal) ?? 0,
      discount: decimalToNumber(order.discount) ?? 0,
      total: decimalToNumber(order.totalAmount) ?? 0,
      legacyAccrualTotal: decimalToNumber(order.salaryAccrualTotal),
      lines: order.lines
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((line) => ({
          id: line.id,
          label: line.serviceNameSnapshot,
          unitPrice: decimalToNumber(line.unitPrice) ?? 0,
          quantity: decimalToNumber(line.quantity) ?? 0,
          costPriceSnapshot: decimalToNumber(line.costPriceSnapshot),
          salaryRuleSnapshotJson: line.salaryRuleSnapshotJson,
        })),
      payments: order.payments.map((payment) => ({
        amount: decimalToNumber(payment.amount) ?? 0,
      })),
      executors: executors.map((executor) => ({
        employeeId: executor.employeeId,
        orderExecutorId: hasPersistedExecutors ? executor.orderExecutorId : null,
        skillLevelSnapshot: executor.skillLevelSnapshot,
        workPercentSnapshot: executor.workPercentSnapshot,
        employeeNameSnapshot: executor.employeeNameSnapshot,
      })),
      shiftStaff,
    });

    if (preview.result.status === "unsupported") {
      const skippedExplanation = buildShift22SkippedOrderExplanation({
        reason: preview.result.reason,
        order,
        hasPersistedExecutors,
      });

      skippedUnsupportedOrderCount += 1;
      skippedUnsupportedOrders.push({
        orderId: order.id,
        orderNumber: String(order.number),
        ...(preview.result.reason === "missing_four_plus_fund_percent"
          ? { requiresFourPlusFundPercentSetup: true }
          : {}),
        ...skippedExplanation,
      });
      continue;
    }

    if (preview.result.status === "not_due") {
      notDueOrderCount += 1;
      firstNotDueReason = firstNotDueReason ?? preview.result.reason;
      continue;
    }

    calculatedOrderCount += 1;

    preview.result.executors.forEach((executor) => {
      const member = upsertShift22Member(membersMap, {
        employeeId: executor.employeeId,
        employeeName: executor.name,
      });

      member.orders.push({
        orderId: order.id,
        orderNumber: String(order.number),
        amount: roundMoney(executor.amount),
      });
      member.orderCount = member.orders.length;
      member.totalAmount = roundMoney(member.totalAmount + executor.amount);
    });
  }

  const members = [...membersMap.values()].sort((left, right) => {
    const amountDiff = right.totalAmount - left.totalAmount;

    if (amountDiff !== 0) {
      return amountDiff;
    }

    return (left.employeeName ?? "").localeCompare(right.employeeName ?? "", "ru");
  });

  if (calculatedOrderCount === 0 || members.length === 0) {
    if (skippedUnsupportedOrderCount > 0) {
      return {
        status: "unsupported",
        skippedUnsupportedOrderCount,
        skippedUnsupportedOrders,
        notDueOrderCount,
      };
    }

    return {
      status: "not_due",
      reason: firstNotDueReason ?? "no_remaining_paid_base",
    };
  }

  return {
    status: "supported",
    totalAmount: roundMoney(members.reduce((total, member) => total + member.totalAmount, 0)),
    orderCount: calculatedOrderCount,
    notDueOrderCount,
    skippedUnsupportedOrderCount,
    skippedUnsupportedOrders,
    members,
  };
}

function mapExpenses(itemsJson: Prisma.JsonValue | null | undefined): DemoShiftExpenseItem[] {
  const items = parseJsonValue<Array<DemoShiftExpenseItem>>(itemsJson, []);
  return Array.isArray(items) ? items : [];
}

function mapShiftOrderSnapshot(
  order: ShiftRecord["orders"][number],
): DemoShiftOrderSnapshot {
  const client = parseJsonValue<{
    anonymous?: boolean;
    name?: string;
    label?: string;
    phone?: string;
    carBrand?: string;
    carModel?: string;
    plateNumber?: string;
  }>(order.clientSnapshotJson, {});
  const payment = parseJsonValue<{
    paymentStatus?: string | null;
    paymentMethod?: string | null;
    paymentLabel?: string | null;
    accountId?: string | null;
    accountNameSnapshot?: string | null;
    paidAt?: string | null;
    paidAmount?: number | null;
  }>(order.paymentSnapshotJson, {});
  const executor = parseJsonValue<{ executorNameSnapshot?: string | null }>(
    order.executorSnapshotJson,
    {},
  );
  const payoutSnapshotMembers =
    parseJsonValue<DemoShiftOrderPayoutSnapshotMember[] | null>(
      order.payoutBreakdownSnapshotJson,
      null,
    ) ?? null;
  const dateTime = formatDateTime(payment.paidAt ?? order.completedAt ?? order.updatedAt);
  const isPaid = hasPaidPayment(order);
  const totalAmount = decimalToNumber(order.totalAmount) ?? 0;
  const paidAmount = isPaid ? getShiftOrderPaidAmount(order) : 0;
  const paymentStatusLabel = isPaid ? "Оплачено" : "Не оплачено";

  return {
    id: order.id,
    number: String(order.number),
    car: buildCarLabel({
      brand: client.carBrand,
      model: client.carModel,
      plateNumber: client.plateNumber,
    }),
    clientLabel: getClientDisplayName(client),
    amount: isPaid ? paidAmount : totalAmount,
    paidAmount,
    totalAmount,
    salaryAccrualAmount: decimalToNumber(order.salaryAccrualTotal),
    paymentMethod: (payment.paymentMethod as DemoShiftOrderSnapshot["paymentMethod"]) ?? null,
    accountId: payment.accountId ?? null,
    accountName: payment.accountNameSnapshot ?? null,
    status: order.status,
    workStatusLabel: getShiftWorkStatusLabel(order.status),
    paymentStatusLabel,
    paymentAccountLabel: formatPaymentAccountDisplay(payment),
    isPaid,
    isCompletedUnpaid:
      (order.status === "Выполнен" || isOrderMarkedForDeletion(order.status)) && !isPaid,
    executorLabel:
      order.executors.length > 0
        ? order.executors
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((ex) => ex.employeeNameSnapshot)
            .filter((name) => name.trim() !== "")
            .join(", ") || "—"
        : (executor.executorNameSnapshot ?? "—"),
    paymentSubLabel: isPaid ? formatPaymentMethodDisplay(payment) : "Не оплачено",
    dateTime,
    payoutSnapshotMembers,
    ...splitDateTimeLabel(dateTime),
  };
}

function getMoneySummary(shift: ShiftRecord) {
  const visibleOrders = shift.orders
    .filter((order) => isFinishedOrder(order.status))
    .sort(compareShiftOrdersByRecency);
  const orderSnapshots = visibleOrders.map(mapShiftOrderSnapshot);
  const paidOrderSnapshots = orderSnapshots.filter((order) => order.isPaid);
  const completedUnpaidOrderSnapshots = orderSnapshots.filter(
    (order) => order.isCompletedUnpaid,
  );
  const expensesItems = mapExpenses(shift.expensesItemsJson);
  const expenses = expensesItems.reduce((total, item) => total + item.amount, 0);
  const revenue = paidOrderSnapshots.reduce((total, order) => total + order.paidAmount, 0);
  const completedUnpaidTotal = completedUnpaidOrderSnapshots.reduce(
    (total, order) => total + order.totalAmount,
    0,
  );
  const hasUnresolvedSalary = paidOrderSnapshots.some((order) => order.salaryAccrualAmount === null);
  const salaryAccrualTotal = hasUnresolvedSalary
    ? null
    : paidOrderSnapshots.reduce((total, order) => total + (order.salaryAccrualAmount ?? 0), 0);
  const cashRevenue = orderSnapshots.reduce(
    (total, order) => (order.isPaid && order.paymentMethod === "cash" ? total + order.paidAmount : total),
    0,
  );
  const cashlessRevenue = Math.max(0, revenue - cashRevenue);
  const accountBreakdownMap = new Map<string, DemoShiftAccountBreakdownItem>();

  paidOrderSnapshots.forEach((order) => {
    const accountId = order.accountId ?? order.paymentMethod ?? "unknown";
    const accountName = order.accountName ?? (order.paymentSubLabel || "Не указан");
    const existing = accountBreakdownMap.get(accountId);

    if (existing) {
      existing.amount += order.paidAmount;
      return;
    }

    accountBreakdownMap.set(accountId, {
      accountId,
      accountName,
      amount: order.paidAmount,
      isArchived: false,
    });
  });

  return {
    expenses,
    expensesItems,
    visibleOrders,
    orderSnapshots,
    paidOrderSnapshots,
    revenue,
    salaryAccrualTotal,
    cashRevenue,
    cashlessRevenue,
    paidOrdersCount: paidOrderSnapshots.length,
    completedUnpaidCount: completedUnpaidOrderSnapshots.length,
    completedUnpaidTotal,
    accountBreakdown: [...accountBreakdownMap.values()],
  };
}

function mapCurrentShift(shift: ShiftRecord): DemoShiftState["currentShift"] {
  const summary = getMoneySummary(shift);
  const staff = mapShiftStaff(shift.staff);

  return {
    id: shift.id,
    number: shift.number,
    openedAt: shift.openedAt.toISOString(),
    isOpen: shift.status === "open",
    expenses: summary.expenses,
    expensesItems: summary.expensesItems,
    staff,
    staffLabel:
      shift.staffLabelSnapshot ??
      (staff.length > 0 ? staff.map((member) => member.employeeNameSnapshot).join(", ") : "—"),
    revenue: summary.revenue,
    salaryAccrualTotal: summary.salaryAccrualTotal,
    cashRevenue: summary.cashRevenue,
    cashlessRevenue: summary.cashlessRevenue,
    paidOrdersCount: summary.paidOrdersCount,
    completedUnpaidCount: summary.completedUnpaidCount,
    completedUnpaidTotal: summary.completedUnpaidTotal,
    ordersCount: summary.orderSnapshots.length,
    orders: summary.orderSnapshots,
    salaryBreakdown: buildSalaryBreakdown(staff, summary.paidOrderSnapshots),
    stage22Preview: buildShift22Preview(shift, summary.visibleOrders),
    accountBreakdown:
      parseJsonValue<DemoShiftAccountBreakdownItem[] | null>(
        shift.accountBreakdownSnapshotJson,
        null,
      ) ?? summary.accountBreakdown,
  };
}

function mapClosedShift(shift: ShiftRecord): DemoClosedShiftSnapshot {
  const summary = getMoneySummary(shift);
  const staff = mapShiftStaff(shift.staff);
  const hasResolvedOrders = summary.orderSnapshots.length > 0;

  return {
    id: shift.id,
    number: shift.number,
    openedAt: shift.openedAt.toISOString(),
    closedAt: shift.closedAt?.toISOString() ?? shift.updatedAt.toISOString(),
    revenue: hasResolvedOrders
      ? summary.revenue
      : decimalToNumber(shift.revenueTotalSnapshot) ?? summary.revenue,
    expenses: decimalToNumber(shift.expensesTotalSnapshot) ?? summary.expenses,
    expensesItems: summary.expensesItems,
    staff,
    staffLabel:
      shift.staffLabelSnapshot ??
      (staff.length > 0 ? staff.map((member) => member.employeeNameSnapshot).join(", ") : "—"),
    ordersCount: hasResolvedOrders
      ? summary.orderSnapshots.length
      : shift.ordersCountSnapshot ?? summary.orderSnapshots.length,
    orders: summary.orderSnapshots,
    accountBreakdown: hasResolvedOrders
      ? summary.accountBreakdown
      : parseJsonValue<DemoShiftAccountBreakdownItem[] | null>(
          shift.accountBreakdownSnapshotJson,
          null,
        ) ?? summary.accountBreakdown,
    salaryAccrualTotal: hasResolvedOrders
      ? summary.salaryAccrualTotal
      : decimalToNumber(shift.salaryFundTotalSnapshot) ?? summary.salaryAccrualTotal,
    cashRevenue: hasResolvedOrders
      ? summary.cashRevenue
      : decimalToNumber(shift.cashTotalSnapshot) ?? summary.cashRevenue,
    cashlessRevenue: hasResolvedOrders
      ? summary.cashlessRevenue
      : decimalToNumber(shift.cashlessTotalSnapshot) ?? summary.cashlessRevenue,
    paidOrdersCount: hasResolvedOrders
      ? summary.paidOrdersCount
      : shift.ordersCountSnapshot ?? summary.paidOrdersCount,
    completedUnpaidCount: hasResolvedOrders ? summary.completedUnpaidCount : 0,
    completedUnpaidTotal: hasResolvedOrders ? summary.completedUnpaidTotal : 0,
    salaryBreakdown: hasResolvedOrders
      ? buildSalaryBreakdown(staff, summary.paidOrderSnapshots)
      : {
          status: "unsupported",
          reasonLabel: "Для этой смены нет достаточных данных по заказам для распределения.",
          members: [],
        },
    stage22Preview: hasResolvedOrders
      ? buildShift22Preview(shift, summary.visibleOrders)
      : { status: "no_order_data" },
  };
}

function mapActivityType(
  eventType: string,
): DemoShiftActivityItem["type"] | null {
  switch (eventType) {
    case "shift.opened":
      return "shift_opened";
    case "shift.closed":
      return "shift_closed";
    case "shift.expense_added":
      return "expense_added";
    case "shift.staff_updated":
      return "staff_updated";
    case "shift.staff_arrived":
    case "shift.staff_left":
      return "staff_attendance";
    case "order.payment":
      return "order_finished";
    default:
      return null;
  }
}

function mapActivity(event: {
  id: string;
  eventType: string;
  createdAt: Date;
  payloadJson: Prisma.JsonValue;
}): DemoShiftActivityItem | null {
  const type = mapActivityType(event.eventType);

  if (!type) {
    return null;
  }

  const payload = parseJsonValue<{
    actionLabel?: string;
    actionDetails?: string;
    dateTime?: string;
  }>(event.payloadJson, {});
  const dateTime = formatDateTime(payload.dateTime ?? event.createdAt);

  return {
    id: event.id,
    type,
    actionLabel: payload.actionLabel ?? "Действие по смене",
    actionDetails:
      payload.actionDetails ??
      (type === "order_finished" ? `Заказ завершён · ${formatPrice(0)}` : "—"),
    dateTime,
    ...splitDateTimeLabel(dateTime),
  };
}

function buildFallbackOrderActivity(order: {
  id: string;
  number: number;
  status: string;
  totalAmount: Prisma.Decimal;
  completedAt: Date | null;
  updatedAt: Date;
  paymentSnapshotJson: Prisma.JsonValue | null;
}) {
  if (!isFinishedOrder(order.status)) {
    return null;
  }

  const payment = parseJsonValue<{
    paymentLabel?: string | null;
    accountNameSnapshot?: string | null;
    paidAt?: string | null;
  }>(order.paymentSnapshotJson, {});
  const dateTime = formatDateTime(payment.paidAt ?? order.completedAt ?? order.updatedAt);
  const paymentLabel = formatPaymentDisplay(payment);

  return {
    sortValue: new Date(payment.paidAt ?? order.completedAt ?? order.updatedAt).getTime(),
    id: `fallback-order-${order.id}`,
    type: "order_finished" as const,
    actionLabel: "Завершён заказ",
    actionDetails: `Заказ №${order.number} · ${formatPrice(decimalToNumber(order.totalAmount) ?? 0)}${paymentLabel && paymentLabel !== "Не оплачено" ? ` · ${paymentLabel}` : ""}`,
    dateTime,
    ...splitDateTimeLabel(dateTime),
  };
}

function buildFallbackShiftActivity(shift: {
  id: string;
  number: number;
  status: string;
  openedAt: Date;
  closedAt: Date | null;
  updatedAt: Date;
  revenueTotalSnapshot: Prisma.Decimal | null;
}) {
  if (shift.status === "open") {
    const dateTime = formatDateTime(shift.openedAt);

    return {
      sortValue: shift.openedAt.getTime(),
      id: `fallback-shift-open-${shift.id}`,
      type: "shift_opened" as const,
      actionLabel: "Открыта смена",
      actionDetails: `Смена №${shift.number}`,
      dateTime,
      ...splitDateTimeLabel(dateTime),
    };
  }

  const revenue = decimalToNumber(shift.revenueTotalSnapshot) ?? 0;
  const dateTime = formatDateTime(shift.closedAt ?? shift.updatedAt);

  return {
    sortValue: (shift.closedAt ?? shift.updatedAt).getTime(),
    id: `fallback-shift-closed-${shift.id}`,
    type: "shift_closed" as const,
    actionLabel: "Закрыта смена",
    actionDetails: `Смена №${shift.number} · выручка ${formatPrice(revenue)}`,
    dateTime,
    ...splitDateTimeLabel(dateTime),
  };
}

export async function getShiftCurrentState(branchId: string): Promise<DemoShiftState["currentShift"]> {
  const shift = await prisma.shift.findFirst({
    where: { branchId, status: "open" },
    include: {
      staff: {
        include: {
          employee: true,
        },
      },
      orders: {
        include: {
          lines: true,
          payments: true,
          executors: true,
        },
      },
    },
    orderBy: { openedAt: "desc" },
  });

  return shift ? mapCurrentShift(shift) : null;
}

export async function listShiftHistory(branchId: string) {
  const shifts = await prisma.shift.findMany({
    where: { branchId, status: "closed" },
    include: {
      staff: {
        include: {
          employee: true,
        },
      },
      orders: {
        include: {
          lines: true,
          payments: true,
          executors: true,
        },
      },
    },
    orderBy: { closedAt: "desc" },
  });

  return {
    history: shifts.map(mapClosedShift),
  };
}

export async function listShiftActivity(branchId: string) {
  const events = await prisma.auditEvent.findMany({
    where: {
      branchId,
      eventType: {
        in: [
          "shift.opened",
          "shift.closed",
          "shift.expense_added",
          "shift.staff_updated",
          "shift.staff_arrived",
          "shift.staff_left",
          "order.payment",
        ],
      },
    },
    orderBy: { createdAt: "desc" },
    take: 30,
  });

  const activityFromAudit = events
    .map(mapActivity)
    .filter((item): item is DemoShiftActivityItem => Boolean(item));

  if (activityFromAudit.length > 0) {
    return {
      activity: activityFromAudit,
    };
  }

  const [shifts, orders] = await Promise.all([
    prisma.shift.findMany({
      where: { branchId },
      select: {
        id: true,
        number: true,
        status: true,
        openedAt: true,
        closedAt: true,
        updatedAt: true,
        revenueTotalSnapshot: true,
      },
      orderBy: [{ openedAt: "desc" }],
      take: 10,
    }),
    prisma.order.findMany({
      where: { branchId, status: "Оплачен" },
      select: {
        id: true,
        number: true,
        status: true,
        totalAmount: true,
        completedAt: true,
        updatedAt: true,
        paymentSnapshotJson: true,
      },
      orderBy: [{ completedAt: "desc" }, { updatedAt: "desc" }],
      take: 20,
    }),
  ]);

  const fallbackActivity: FallbackShiftActivity[] = [];

  for (const order of orders) {
    const nextItem = buildFallbackOrderActivity(order);

    if (nextItem) {
      fallbackActivity.push(nextItem);
    }
  }

  for (const shift of shifts) {
    const nextItem = buildFallbackShiftActivity(shift);

    if (nextItem) {
      fallbackActivity.push(nextItem);
    }
  }

  const activity = fallbackActivity
    .sort((left, right) => right.sortValue - left.sortValue)
    .map<DemoShiftActivityItem>((item) => ({
      id: item.id,
      type: item.type,
      actionLabel: item.actionLabel,
      actionDetails: item.actionDetails,
      dateTime: item.dateTime,
      dateLabel: item.dateLabel,
      timeLabel: item.timeLabel,
    }))
    .slice(0, 30);

  return {
    activity,
  };
}

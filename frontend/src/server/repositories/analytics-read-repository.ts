import type { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import type {
  AnalyticsEmployeeRow,
  AnalyticsOrderRow,
  AnalyticsPayoutCoverage,
  AnalyticsServiceRow,
  AnalyticsShiftRow,
  BranchBasicAnalytics,
} from "@/features/analytics/types";
import type { DemoClosedShiftSnapshot, DemoShiftState } from "@/features/shifts/types";
import {
  buildCarLabel,
  decimalToNumber,
  formatDateOnly,
  formatDateTime,
  formatPaymentDisplay,
  getClientDisplayName,
  parseJsonValue,
} from "@/server/repositories/operational-utils";
import { getShiftCurrentState, listShiftHistory } from "@/server/repositories/shift-read-repository";

type AnalyticsOrderRecord = Prisma.OrderGetPayload<{
  include: {
    lines: true;
  };
}>;

const FINISHED_ORDER_STATUSES = new Set(["Оплачен", "Выполнен"]);
type AnalyticsShiftSource = NonNullable<DemoShiftState["currentShift"]> | DemoClosedShiftSnapshot;

function getAnalyticsOrderStatusLabel(status: string) {
  if (status === "Выполнен") {
    return "Оплачен";
  }

  return status;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}

function getLocalDateKey(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat("sv-SE").format(date);
}

function isDateKeyInRange(dateKey: string | null, from: string, to: string) {
  if (!dateKey) {
    return false;
  }

  return dateKey >= from && dateKey <= to;
}

function getOrderOperationalDate(order: AnalyticsOrderRecord) {
  const payment = parseJsonValue<{
    paidAt?: string | null;
  }>(order.paymentSnapshotJson, {});

  return payment.paidAt ?? order.completedAt?.toISOString() ?? order.createdAt.toISOString();
}

function mapAnalyticsOrder(order: AnalyticsOrderRecord): AnalyticsOrderRow {
  const client = parseJsonValue<{
    anonymous?: boolean;
    name?: string;
    label?: string;
    carBrand?: string | null;
    carModel?: string | null;
    plateNumber?: string | null;
  }>(order.clientSnapshotJson, {});
  const payment = parseJsonValue<{
    paymentLabel?: string | null;
    accountNameSnapshot?: string | null;
  }>(order.paymentSnapshotJson, {});

  return {
    id: order.id,
    number: String(order.number),
    dateTime: formatDateTime(getOrderOperationalDate(order)),
    clientLabel: getClientDisplayName(client),
    carLabel: buildCarLabel({
      brand: client.carBrand,
      model: client.carModel,
      plateNumber: client.plateNumber,
    }),
    amount: decimalToNumber(order.totalAmount) ?? 0,
    status: getAnalyticsOrderStatusLabel(order.status),
    paymentLabel: formatPaymentDisplay(payment),
    salaryAccrualTotal: decimalToNumber(order.salaryAccrualTotal),
  };
}

function matchesOrderHistoryFilter(
  order: AnalyticsOrderRow,
  filters: {
    search: string;
    status: string;
  },
) {
  if (filters.status !== "all" && order.status !== filters.status) {
    return false;
  }

  if (!filters.search) {
    return true;
  }

  const normalizedSearch = normalizeSearchValue(filters.search);
  const haystack = normalizeSearchValue(
    [order.number, order.clientLabel, order.carLabel, order.paymentLabel].join(" "),
  );

  return haystack.includes(normalizedSearch);
}

function getShiftDateKey(shift: AnalyticsShiftSource) {
  if ("closedAt" in shift) {
    return getLocalDateKey(shift.closedAt);
  }

  return getLocalDateKey(shift.openedAt);
}

function getShiftPayoutTotal(shift: AnalyticsShiftSource) {
  if (shift.ordersCount === 0) {
    return 0;
  }

  if (!shift.salaryBreakdown || shift.salaryBreakdown.status === "unsupported") {
    return null;
  }

  return shift.salaryBreakdown.members.reduce((total, member) => total + member.totalAmount, 0);
}

function getBlockingPayrollReason(shift: AnalyticsShiftSource) {
  if (
    shift.ordersCount > 0 &&
    shift.salaryBreakdown &&
    shift.salaryBreakdown.status === "unsupported"
  ) {
    return shift.salaryBreakdown.reasonLabel;
  }

  return null;
}

function mapShiftRow(shift: AnalyticsShiftSource, statusLabel: string): AnalyticsShiftRow {
  return {
    shiftId: shift.id,
    shiftNumber: shift.number,
    statusLabel,
    dateLabel: formatDateOnly("closedAt" in shift ? shift.closedAt : shift.openedAt),
    staffLabel: shift.staffLabel,
    ordersCount: shift.ordersCount,
    revenue: shift.revenue,
    salaryPayoutTotal: getShiftPayoutTotal(shift),
  };
}

function getOldOrderTransitionSkippedOrdersCount(shift: AnalyticsShiftSource) {
  const preview = shift.stage22Preview;

  if (!preview || (preview.status !== "supported" && preview.status !== "unsupported")) {
    return 0;
  }

  return preview.skippedUnsupportedOrders.filter(
    (order) => order.reasonCategory === "old_data_transition",
  ).length;
}

function buildEmployeeRows(shifts: AnalyticsShiftSource[]) {
  const coverage: AnalyticsPayoutCoverage = {
    supportedShiftsCount: 0,
    excludedShiftsCount: 0,
    excludedOrdersCount: 0,
    oldOrderTransitionOrdersCount: 0,
    unsupportedReason: null,
    isPartial: false,
  };

  const employeesMap = new Map<string, AnalyticsEmployeeRow>();

  for (const shift of shifts) {
    coverage.oldOrderTransitionOrdersCount += getOldOrderTransitionSkippedOrdersCount(shift);

    if (!shift.salaryBreakdown || shift.salaryBreakdown.status !== "supported") {
      if (shift.ordersCount > 0) {
        coverage.excludedShiftsCount += 1;
        coverage.excludedOrdersCount += shift.ordersCount;
        coverage.unsupportedReason ||= getBlockingPayrollReason(shift);
      }
      continue;
    }

    coverage.supportedShiftsCount += 1;

    shift.salaryBreakdown.members.forEach((member) => {
      const key = member.employeeId ?? member.employeeName;
      const existing = employeesMap.get(key);
      const ordersCount = member.orders.length;

      if (existing) {
        existing.shiftsCount += 1;
        existing.ordersCount += ordersCount;
        existing.totalAmount += member.totalAmount;
        return;
      }

      employeesMap.set(key, {
        employeeKey: key,
        employeeName: member.employeeName,
        shiftsCount: 1,
        ordersCount,
        totalAmount: member.totalAmount,
      });
    });
  }

  const rows = [...employeesMap.values()].sort((left, right) => right.totalAmount - left.totalAmount);
  coverage.isPartial = coverage.excludedShiftsCount > 0 && coverage.supportedShiftsCount > 0;

  return {
    rows,
    coverage,
    totalAmount:
      rows.length > 0 ? rows.reduce((total, row) => total + row.totalAmount, 0) : null,
  };
}

function buildServiceRows(orders: AnalyticsOrderRecord[]) {
  const servicesMap = new Map<string, AnalyticsServiceRow>();

  for (const order of orders) {
    for (const line of order.lines) {
      const serviceName = line.serviceNameSnapshot || "Услуга без названия";
      const categoryLabel = line.serviceCategorySnapshot?.trim() || "Без категории";
      const key = `${categoryLabel}::${serviceName}`;
      const quantity = decimalToNumber(line.quantity) ?? 0;
      const revenue = decimalToNumber(line.lineTotal) ?? 0;
      const existing = servicesMap.get(key);

      if (existing) {
        existing.quantity += quantity;
        existing.revenue += revenue;
        existing.ordersCount += 1;
        continue;
      }

      servicesMap.set(key, {
        serviceKey: key,
        serviceName,
        categoryLabel,
        quantity,
        ordersCount: 1,
        revenue,
      });
    }
  }

  return [...servicesMap.values()].sort((left, right) => {
    if (right.revenue !== left.revenue) {
      return right.revenue - left.revenue;
    }

    return left.serviceName.localeCompare(right.serviceName, "ru");
  });
}

export async function getBranchBasicAnalytics(
  branchId: string,
  filters: {
    from: string;
    to: string;
    orderSearch: string;
    orderStatus: string;
  },
): Promise<BranchBasicAnalytics> {
  const [currentShift, shiftHistoryState, orders] = await Promise.all([
    getShiftCurrentState(branchId),
    listShiftHistory(branchId),
    prisma.order.findMany({
      where: { branchId },
      include: { lines: true },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  const periodOrders = orders.filter((order) =>
    isDateKeyInRange(getLocalDateKey(getOrderOperationalDate(order)), filters.from, filters.to),
  );
  const finishedOrders = periodOrders.filter((order) => FINISHED_ORDER_STATUSES.has(order.status));
  const mappedOrders = periodOrders.map(mapAnalyticsOrder);
  const filteredOrderHistory = mappedOrders.filter((order) =>
    matchesOrderHistoryFilter(order, {
      search: filters.orderSearch,
      status: filters.orderStatus,
    }),
  );

  const includedShifts = [
    ...(currentShift && isDateKeyInRange(getShiftDateKey(currentShift), filters.from, filters.to)
      ? [currentShift]
      : []),
    ...shiftHistoryState.history.filter((shift) =>
      isDateKeyInRange(getShiftDateKey(shift), filters.from, filters.to),
    ),
  ];

  const employeeSummary = buildEmployeeRows(includedShifts);

  return {
    summary: {
      revenueTotal: finishedOrders.reduce(
        (total, order) => total + (decimalToNumber(order.totalAmount) ?? 0),
        0,
      ),
      ordersCount: periodOrders.length,
      salaryPayoutTotal: employeeSummary.totalAmount,
    },
    payoutCoverage: employeeSummary.coverage,
    shifts: includedShifts
      .map((shift) => mapShiftRow(shift, "closedAt" in shift ? "Закрыта" : "Открыта"))
      .sort((left, right) => right.dateLabel.localeCompare(left.dateLabel, "ru")),
    employees: employeeSummary.rows,
    services: buildServiceRows(finishedOrders),
    orders: filteredOrderHistory,
  };
}

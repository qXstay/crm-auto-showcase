import type { Prisma } from "@/server/db/prisma-client";
import { prisma } from "@/server/db/prisma";
import type { CartItem } from "@/features/cashier/types";
import type {
  DemoOrder,
  DemoOrderClientSnapshot,
  DemoOrderDetail,
  DemoOrderListItem,
  DemoOrderPaymentSnapshot,
  OrderPersistedPayrollSummary,
  DemoOrderTotals,
  OrderExecutorItem,
} from "@/features/orders/types";
import { buildStage22PayrollPreview } from "@/features/payroll/stage22-preview";
import {
  CLIENT_NAME_FALLBACK,
  buildVehicleIdentityLabel,
  formatPlateForDisplay,
  normalizePhone,
  normalizePlate,
  sanitizeClientKind,
} from "@/features/clients/client-contract";
import {
  isOrderMarkedForDeletion,
  ORDER_MARKED_FOR_DELETION_STATUS,
} from "@/features/orders/lifecycle";
import { inferOrderDiscountPercent } from "@/features/orders/totals";
import {
  buildCarLabel,
  buildWorkSummary,
  decimalToNumber,
  formatDateTime,
  formatDurationLabel,
  formatPaymentAccountDisplay,
  formatPaymentMethodDisplay,
  formatShiftLabel,
  getClientDisplayName,
  getVehicleTypeLabel,
  parseJsonValue,
} from "@/server/repositories/operational-utils";

type OrderRecord = Prisma.OrderGetPayload<{
  include: {
    lines: true;
    payments: {
      include: {
        account: true;
      };
    };
    shift: true;
    executors: true;
  };
}>;

type ListOrderRecord = Prisma.OrderGetPayload<{
  select: {
    id: true;
    number: true;
    createdAt: true;
    status: true;
    clientId: true;
    totalAmount: true;
    clientSnapshotJson: true;
    paymentSnapshotJson: true;
    payments: {
      select: {
        id: true;
        accountId: true;
        amount: true;
        paidAt: true;
        createdAt: true;
        paymentSnapshotJson: true;
        account: {
          select: {
            name: true;
          };
        };
      };
    };
    executors: {
      select: {
        id: true;
        employeeNameSnapshot: true;
        sortOrder: true;
      };
    };
  };
}>;

type DetailOrderRecord = Prisma.OrderGetPayload<{
  include: {
    lines: true;
    payments: {
      include: {
        account: true;
      };
    };
    shift: {
      include: {
        staff: {
          select: {
            employeeId: true;
            arrivedAt: true;
            leftAt: true;
          };
        };
      };
    };
    executors: true;
    payrollAccruals: {
      select: {
        status: true;
        statusReason: true;
        payrollBaseAmount: true;
        salaryFundAmount: true;
        createdAt: true;
        payouts: {
          select: {
            employeeId: true;
            employeeNameSnapshot: true;
            skillLevelSnapshot: true;
            amount: true;
          };
        };
      };
    };
  };
}>;

const ORDER_LIST_PAGE_SIZE = 50;

type OrderClientSnapshotSource = Pick<OrderRecord, "clientId" | "clientSnapshotJson">;

type OrderPaymentSnapshotSource = {
  paymentSnapshotJson: Prisma.JsonValue | null;
  payments: Array<{
    id: string;
    accountId: string | null;
    amount: Prisma.Decimal | { toString(): string } | number | null;
    paidAt: Date;
    createdAt: Date;
    paymentSnapshotJson: Prisma.JsonValue;
    account: { name: string } | null;
  }>;
  totalAmount: Prisma.Decimal | { toString(): string } | number | null;
};

type PersistedPayrollAccrualForSummary = {
  status: string;
  statusReason?: string | null;
  payrollBaseAmount: Prisma.Decimal | { toString(): string } | number | null;
  salaryFundAmount: Prisma.Decimal | { toString(): string } | number | null;
  createdAt?: Date | null;
  payouts: Array<{
    employeeId: string | null;
    employeeNameSnapshot: string;
    skillLevelSnapshot: string | null;
    amount: Prisma.Decimal | { toString(): string } | number | null;
  }>;
};

function mapOrderClientSnapshot(record: OrderClientSnapshotSource): DemoOrderClientSnapshot {
  const snapshot = parseJsonValue<Partial<DemoOrderClientSnapshot>>(record.clientSnapshotJson, {});
  const clientKind = sanitizeClientKind(snapshot.clientKind);
  const organizationName = snapshot.organizationName?.trim() ?? "";
  const plateNumber = normalizePlate(snapshot.plateNumber);
  const nameKey = (snapshot.name?.trim() || snapshot.label?.trim() || "")
    .normalize("NFKC")
    .replace(/[\s·\-\[\]]+/g, "")
    .toLocaleUpperCase("ru-RU");
  const vehicleKey = buildVehicleIdentityLabel({
    carBrand: snapshot.carBrand,
    carModel: snapshot.carModel,
    plateNumber,
  })
    .normalize("NFKC")
    .replace(/[\s·\-\[\]]+/g, "")
    .toLocaleUpperCase("ru-RU");
  const vehicleDerivedName = Boolean(
    nameKey &&
      ((vehicleKey && nameKey === vehicleKey) ||
        (plateNumber && nameKey.includes(plateNumber))),
  );
  const displayName =
    clientKind === "legal"
      ? organizationName || snapshot.name?.trim() || snapshot.label?.trim() || "Юридическое лицо"
      : vehicleDerivedName
        ? CLIENT_NAME_FALLBACK
        : snapshot.name?.trim() || snapshot.label?.trim() || CLIENT_NAME_FALLBACK;

  return {
    mode: snapshot.mode ?? (snapshot.anonymous ? "anonymous" : "existing"),
    clientId: snapshot.clientId ?? record.clientId ?? "anonymous",
    clientKind,
    inn: snapshot.inn?.trim() || undefined,
    organizationName: organizationName || undefined,
    contractNumber: snapshot.contractNumber?.trim() || undefined,
    label: vehicleDerivedName ? displayName : snapshot.label?.trim() || displayName,
    details: snapshot.details ?? snapshot.phone ?? "",
    name: displayName,
    phone: normalizePhone(snapshot.phone),
    carBrand: snapshot.carBrand ?? "",
    carModel: snapshot.carModel ?? "",
    plateNumber,
    preferredRadius: (snapshot.preferredRadius as DemoOrder["radius"] | "") ?? "",
    anonymous: Boolean(snapshot.anonymous),
  };
}

function mapOrderPaymentSnapshot(record: OrderPaymentSnapshotSource): DemoOrderPaymentSnapshot {
  const snapshot = parseJsonValue<Partial<DemoOrderPaymentSnapshot>>(
    record.paymentSnapshotJson,
    {},
  );
  const payments = record.payments
    .slice()
    .sort((left, right) => {
      const paidAtDiff = left.paidAt.getTime() - right.paidAt.getTime();

      if (paidAtDiff !== 0) {
        return paidAtDiff;
      }

      const createdAtDiff = left.createdAt.getTime() - right.createdAt.getTime();

      return createdAtDiff !== 0 ? createdAtDiff : left.id.localeCompare(right.id);
    });
  const latestPayment = payments.at(-1) ?? null;
  const latestPaymentSnapshot = parseJsonValue<Partial<DemoOrderPaymentSnapshot>>(
    latestPayment?.paymentSnapshotJson,
    {},
  );
  const paidTotal = Math.round(
    payments.reduce((sum, payment) => sum + (decimalToNumber(payment.amount) ?? 0), 0) * 100,
  ) / 100;
  const orderTotal = decimalToNumber(record.totalAmount) ?? 0;
  const remainingAmount = Math.max(0, Math.round((orderTotal - paidTotal) * 100) / 100);
  const computedStatus =
    paidTotal > 0
      ? Math.round(remainingAmount * 100) === 0
        ? "Оплачен"
        : "Не оплачено"
      : snapshot.paymentStatus ?? "Не оплачено";

  return {
    paymentStatus: computedStatus,
    paymentMethod: snapshot.paymentMethod ?? latestPaymentSnapshot.paymentMethod ?? null,
    paymentLabel: snapshot.paymentLabel ?? latestPaymentSnapshot.paymentLabel ?? null,
    accountId: snapshot.accountId ?? latestPayment?.accountId ?? null,
    accountNameSnapshot:
      snapshot.accountNameSnapshot ?? latestPayment?.account?.name ?? null,
    paidAt: snapshot.paidAt ?? latestPayment?.paidAt.toISOString() ?? null,
    paidAmount: snapshot.paidAmount ?? (paidTotal > 0 ? paidTotal : null),
    paidTotal,
    remainingAmount,
    note: snapshot.note ?? null,
    internalComment: snapshot.internalComment ?? latestPaymentSnapshot.internalComment ?? null,
  };
}

function mapOrderTotals(record: OrderRecord): DemoOrderTotals {
  const snapshot = parseJsonValue<Partial<DemoOrderTotals>>(record.totalsSnapshotJson, {});
  const subtotal = snapshot.subtotal ?? decimalToNumber(record.subtotal) ?? 0;
  const discount = snapshot.discount ?? decimalToNumber(record.discount) ?? 0;

  return {
    servicesCount: snapshot.servicesCount ?? record.servicesCount,
    subtotal,
    discount,
    discountPercent:
      snapshot.discountPercent ??
      inferOrderDiscountPercent({
        subtotal,
        discount,
      }),
    total: snapshot.total ?? decimalToNumber(record.totalAmount) ?? 0,
  };
}

function mapOrderLines(record: OrderRecord): CartItem[] {
  return record.lines
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((line) => ({
      key: line.id,
      serviceId: line.serviceId ?? `manual-${line.id}`,
      serviceName: line.serviceNameSnapshot,
      serviceNameSnapshot: line.serviceNameSnapshot,
      vehicleType: record.vehicleType as CartItem["vehicleType"],
      vehicleLabel: getVehicleTypeLabel(record.vehicleType),
      radius: record.radius as CartItem["radius"],
      lowProfile: record.lowProfile,
      runflat: record.runflat,
      unitPrice: decimalToNumber(line.unitPrice) ?? 0,
      quantity: decimalToNumber(line.quantity) ?? 0,
      pricingSnapshot: parseJsonValue(line.pricingSnapshotJson, {
        source: "services_admin",
        priceType: "fixed",
        pricingMode: "service",
        inputKind: "none",
        selectionMode: "automatic",
        vehicleType: null,
        radius: null,
        lowProfile: false,
        runflat: false,
        appliedModifiers: [],
        baseUnitPrice: null,
        resolvedUnitPrice: null,
        displayLabel: "",
        selectedOptionLabel: null,
        operatorNote: null,
        priceOptions: [],
      }),
      salaryRuleSnapshot: parseJsonValue(line.salaryRuleSnapshotJson, null),
      costPrice: decimalToNumber(line.costPriceSnapshot),
      salaryAccrualSnapshot: parseJsonValue(line.salaryAccrualSnapshotJson, null),
    }));
}

function normalizeOrderStatusForEditor(status: string): DemoOrder["status"] {
  return status as DemoOrder["status"];
}

function mapOrderExecutors(record: OrderRecord): OrderExecutorItem[] {
  if (record.executors.length > 0) {
    return record.executors
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((ex) => ({
        id: ex.id,
        employeeId: ex.employeeId,
        employeeNameSnapshot: ex.employeeNameSnapshot,
        skillLevelSnapshot: ex.skillLevelSnapshot,
        workPercentSnapshot: decimalToNumber(ex.workPercentSnapshot),
        sortOrder: ex.sortOrder,
      }));
  }

  const executorSnapshot = parseJsonValue<{
    executorEmployeeId?: string | null;
    executorNameSnapshot?: string | null;
  }>(record.executorSnapshotJson, {});
  const legacyEmployeeId =
    executorSnapshot.executorEmployeeId ?? record.executorEmployeeId ?? null;
  const legacyName = executorSnapshot.executorNameSnapshot ?? null;

  if (!legacyEmployeeId && !legacyName) {
    return [];
  }

  return [
    {
      id: `legacy-executor-${record.id}`,
      employeeId: legacyEmployeeId,
      employeeNameSnapshot: legacyName ?? "",
      skillLevelSnapshot: null,
      workPercentSnapshot: null,
      sortOrder: 0,
    },
  ];
}

function mapOrder(record: OrderRecord): DemoOrder {
  const client = mapOrderClientSnapshot(record);
  const payment = mapOrderPaymentSnapshot(record);
  const totals = mapOrderTotals(record);
  const executorSnapshot = parseJsonValue<{
    executorEmployeeId?: string | null;
    executorNameSnapshot?: string | null;
  }>(record.executorSnapshotJson, {});
  const shiftSnapshot = parseJsonValue<{
    shiftLabelSnapshot?: string | null;
    shiftOpenedAtSnapshot?: string | null;
  }>(record.shiftSnapshotJson, {});

  return {
    id: record.id,
    number: String(record.number),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    status: normalizeOrderStatusForEditor(record.status),
    client,
    vehicleType: record.vehicleType as DemoOrder["vehicleType"],
    radius: record.radius as DemoOrder["radius"],
    lowProfile: record.lowProfile,
    runflat: record.runflat,
    executorEmployeeId: record.executorEmployeeId,
    executorNameSnapshot: executorSnapshot.executorNameSnapshot ?? null,
    shiftId: record.shiftId,
    shiftLabelSnapshot:
      shiftSnapshot.shiftLabelSnapshot ??
      (record.shift ? formatShiftLabel(record.shift.number, record.shift.openedAt) : null),
    shiftOpenedAtSnapshot:
      shiftSnapshot.shiftOpenedAtSnapshot ?? record.shift?.openedAt.toISOString() ?? null,
    lines: mapOrderLines(record),
    salaryAccrualTotal: decimalToNumber(record.salaryAccrualTotal),
    totals,
    note: record.note ?? "",
    payment,
    executors: mapOrderExecutors(record),
  };
}

function mapOrderListItem(record: ListOrderRecord): DemoOrderListItem {
  const client = mapOrderClientSnapshot(record);
  const amount = decimalToNumber(record.totalAmount) ?? 0;
  const payment = mapOrderPaymentSnapshot(record);

  const executors = record.executors ?? [];
  const executorLabel =
    executors.length > 0
      ? executors
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((ex) => ex.employeeNameSnapshot)
          .filter((name) => name.trim() !== "")
          .join(", ") || "—"
      : "—";

  return {
    id: record.id,
    number: String(record.number),
    dateTime: formatDateTime(record.createdAt),
    createdAtIso: record.createdAt.toISOString(),
    client: getClientDisplayName(client),
    car: buildCarLabel({
      brand: client.carBrand,
      model: client.carModel,
      plateNumber: client.plateNumber,
    }),
    plateNumber: formatPlateForDisplay(client.plateNumber) || "Не указан",
    amount,
    paymentLabel: formatPaymentMethodDisplay(payment),
    paymentAccountLabel: formatPaymentAccountDisplay(payment),
    paymentStatus: payment.paymentStatus,
    status: record.status as DemoOrderListItem["status"],
    executorLabel,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function buildPersistedOrderPayrollSummary(
  accruals: PersistedPayrollAccrualForSummary[],
): OrderPersistedPayrollSummary | null {
  if (accruals.length === 0) {
    return null;
  }

  const latestAccrual = accruals
    .slice()
    .sort((left, right) => {
      const leftTime = left.createdAt?.getTime() ?? 0;
      const rightTime = right.createdAt?.getTime() ?? 0;

      return rightTime - leftTime;
    })[0];
  const supportedAccruals = accruals.filter((accrual) => accrual.status === "supported");
  const payoutRows = supportedAccruals.flatMap((accrual) => accrual.payouts);

  const payoutsByEmployee = new Map<
    string,
    {
      employeeId: string | null;
      employeeNameSnapshot: string;
      skillLevelSnapshot: string | null;
      amount: number;
    }
  >();

  for (const payout of payoutRows) {
    const employeeNameSnapshot = payout.employeeNameSnapshot.trim() || "Исполнитель без имени";
    const key = payout.employeeId ?? `${employeeNameSnapshot}:${payout.skillLevelSnapshot ?? ""}`;
    const current = payoutsByEmployee.get(key);
    const amount = decimalToNumber(payout.amount) ?? 0;

    if (current) {
      current.amount = roundMoney(current.amount + amount);
      continue;
    }

    payoutsByEmployee.set(key, {
      employeeId: payout.employeeId,
      employeeNameSnapshot,
      skillLevelSnapshot: payout.skillLevelSnapshot,
      amount: roundMoney(amount),
    });
  }

  const payouts = [...payoutsByEmployee.values()].sort((left, right) => {
    const amountDiff = right.amount - left.amount;

    return amountDiff !== 0
      ? amountDiff
      : left.employeeNameSnapshot.localeCompare(right.employeeNameSnapshot, "ru");
  });

  return {
    accrualCount: accruals.length,
    payoutCount: payoutRows.length,
    status: latestAccrual.status,
    statusReason: latestAccrual.statusReason ?? null,
    paidBaseAmount: roundMoney(
      accruals.reduce(
        (sum, accrual) => sum + (decimalToNumber(accrual.payrollBaseAmount) ?? 0),
        0,
      ),
    ),
    salaryFundAmount: roundMoney(
      supportedAccruals.reduce(
        (sum, accrual) => sum + (decimalToNumber(accrual.salaryFundAmount) ?? 0),
        0,
      ),
    ),
    payoutAmount: roundMoney(payouts.reduce((sum, payout) => sum + payout.amount, 0)),
    payouts,
  };
}

function mapOrderDetail(record: DetailOrderRecord): DemoOrderDetail {
  const client = mapOrderClientSnapshot(record);
  const payment = mapOrderPaymentSnapshot(record);
  const lines = mapOrderLines(record);
  const executors = mapOrderExecutors(record);
  const hasPersistedExecutors = record.executors.length > 0;
  const salaryAccrualTotal = decimalToNumber(record.salaryAccrualTotal);
  const shiftLabel =
    parseJsonValue<{ shiftLabelSnapshot?: string | null }>(record.shiftSnapshotJson, {})
      .shiftLabelSnapshot ??
    (record.shift ? formatShiftLabel(record.shift.number, record.shift.openedAt) : "—");
  const payrollPreview = buildStage22PayrollPreview({
    id: record.id,
    subtotal: decimalToNumber(record.subtotal) ?? 0,
    discount: decimalToNumber(record.discount) ?? 0,
    total: decimalToNumber(record.totalAmount) ?? 0,
    legacyAccrualTotal: salaryAccrualTotal,
    alreadyAccruedPaidBase: record.payrollAccruals.reduce(
      (sum, accrual) => sum + (decimalToNumber(accrual.payrollBaseAmount) ?? 0),
      0,
    ),
    lines: record.lines
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
    payments: record.payments.map((paymentRow) => ({
      amount: decimalToNumber(paymentRow.amount) ?? 0,
    })),
    executors: executors.map((executor) => ({
      employeeId: executor.employeeId,
      orderExecutorId: hasPersistedExecutors ? executor.id : null,
      skillLevelSnapshot: executor.skillLevelSnapshot,
      workPercentSnapshot: executor.workPercentSnapshot,
      employeeNameSnapshot: executor.employeeNameSnapshot,
    })),
    shiftStaff: record.shift?.staff.map((staff) => ({
      employeeId: staff.employeeId,
      arrivedAt: staff.arrivedAt?.toISOString() ?? null,
      leftAt: staff.leftAt?.toISOString() ?? null,
    })),
  });
  const persistedPayroll = buildPersistedOrderPayrollSummary(record.payrollAccruals);

  return {
    id: record.id,
    number: String(record.number),
    shiftLabel,
    createdAt: formatDateTime(record.createdAt),
    completedAt: formatDateTime(record.completedAt ?? payment.paidAt ?? record.updatedAt),
    durationLabel: formatDurationLabel(record.createdAt, record.completedAt ?? payment.paidAt),
    workSummary: buildWorkSummary(
      lines.map((line) => ({
        serviceNameSnapshot: line.serviceNameSnapshot,
        quantity: line.quantity,
        lineTotal: line.unitPrice * line.quantity,
      })),
    ),
    paymentLabel: formatPaymentMethodDisplay(payment),
    paymentAccountLabel: formatPaymentAccountDisplay(payment),
    paymentStatus: payment.paymentStatus,
    carLabel: buildCarLabel({
      brand: client.carBrand,
      model: client.carModel,
      plateNumber: client.plateNumber,
    }),
    clientLabel: getClientDisplayName(client),
    clientPhone: client.phone || undefined,
    executorLabel:
      executors.length > 0
        ? executors
            .map((ex) => ex.employeeNameSnapshot)
            .filter((name) => name.trim() !== "")
            .join(", ") || "—"
        : (parseJsonValue<{ executorNameSnapshot?: string | null }>(record.executorSnapshotJson, {})
            .executorNameSnapshot ?? "—"),
    amount: decimalToNumber(record.totalAmount) ?? 0,
    salaryAccrualTotal,
    status: record.status as DemoOrderDetail["status"],
    executors,
    persistedPayroll,
    payrollPreview,
  };
}

export async function listOrdersForBranch(
  branchId: string,
  options: { page?: number; pageSize?: number } = {},
) {
  const pageSize = options.pageSize ?? ORDER_LIST_PAGE_SIZE;
  const totalCount = await prisma.order.count({
    where: {
      branchId,
      NOT: {
        status: ORDER_MARKED_FOR_DELETION_STATUS,
      },
    },
  });
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const requestedPage = Number.isFinite(options.page) ? Math.trunc(options.page ?? 1) : 1;
  const page = Math.min(Math.max(requestedPage, 1), totalPages);
  const skip = (page - 1) * pageSize;

  const orders = await prisma.order.findMany({
    where: {
      branchId,
      NOT: {
        status: ORDER_MARKED_FOR_DELETION_STATUS,
      },
    },
    select: {
      id: true,
      number: true,
      createdAt: true,
      status: true,
      clientId: true,
      totalAmount: true,
      clientSnapshotJson: true,
      paymentSnapshotJson: true,
      payments: {
        select: {
          id: true,
          accountId: true,
          amount: true,
          paidAt: true,
          createdAt: true,
          paymentSnapshotJson: true,
          account: {
            select: {
              name: true,
            },
          },
        },
      },
      executors: {
        select: {
          id: true,
          employeeNameSnapshot: true,
          sortOrder: true,
        },
      },
    },
    orderBy: [{ number: "desc" }],
    skip,
    take: pageSize,
  });
  const from = totalCount === 0 ? 0 : skip + 1;
  const to = skip + orders.length;

  return {
    orders: orders
      .filter((order) => !isOrderMarkedForDeletion(order.status))
      .map(mapOrderListItem),
    pagination: {
      page,
      pageSize,
      totalCount,
      totalPages,
      from,
      to,
      hasPreviousPage: page > 1,
      hasNextPage: page < totalPages,
    },
  };
}

export async function getOrderByIdForBranch(branchId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: {
      id: orderId,
      branchId,
    },
    include: {
      lines: true,
      payments: {
        include: {
          account: true,
        },
      },
      shift: {
        include: {
          staff: {
            select: {
              employeeId: true,
              arrivedAt: true,
              leftAt: true,
            },
          },
        },
      },
      executors: true,
      payrollAccruals: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          status: true,
          statusReason: true,
          payrollBaseAmount: true,
          salaryFundAmount: true,
          createdAt: true,
          payouts: {
            select: {
              employeeId: true,
              employeeNameSnapshot: true,
              skillLevelSnapshot: true,
              amount: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  return {
    order: mapOrder(order),
    detail: mapOrderDetail(order),
  };
}

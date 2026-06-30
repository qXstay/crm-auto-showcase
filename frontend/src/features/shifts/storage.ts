"use client";

import { formatPrice } from "@/features/pricing/config";
import {
  formatDemoOrderCarLabel,
  getDemoOrderClientDisplayName,
  formatDemoOrderDateTime,
  getDemoOrderPaymentMethodLabel,
  getStoredDemoOrders,
  isFinishedDemoOrderStatus,
} from "@/features/orders/storage";
import type { DemoOrder } from "@/features/orders/types";
import {
  getDemoAccountBreakdownFromItems,
  loadDemoAccountsStore,
  resolveDemoPaymentAccount,
} from "@/features/settings-accounts/storage";
import {
  formatEmployeeDisplayName,
  formatEmployeeShortName,
  getActiveEmployees,
  loadDemoEmployeesStore,
} from "@/features/settings-employees/storage";
import type { DemoEmployeeRecord } from "@/features/settings-employees/types";
import type {
  DemoShiftAccountBreakdownItem,
  DemoClosedShiftSnapshot,
  DemoCurrentShift,
  DemoShiftActivityItem,
  DemoShiftExpenseItem,
  DemoShiftOrderSnapshot,
  DemoShiftState,
  DemoShiftStaffMember,
  DemoShiftStore,
} from "@/features/shifts/types";

const DEMO_SHIFT_STORE_KEY = "pegas-demo-shift-store";

function canUseStorage() {
  return typeof window !== "undefined";
}

function splitDateTimeLabel(value: string) {
  if (value.includes(" г. в ")) {
    const [date, time] = value.split(" г. в ");

    return {
      dateLabel: `${date} г.`,
      timeLabel: time ?? "",
    };
  }

  if (value.includes(", ")) {
    const [date, time] = value.split(", ");

    return {
      dateLabel: date ?? value,
      timeLabel: time ?? "",
    };
  }

  return {
    dateLabel: value,
    timeLabel: "",
  };
}

function getShiftDisplayStatus(status: string) {
  return status === "Оплачен" || status === "Выполнен" ? "Выполнен" : status;
}

function getShiftWorkStatusLabel(status: string): DemoShiftOrderSnapshot["workStatusLabel"] {
  if (status === "Оплачен" || status === "Выполнен") {
    return "Выполнен";
  }

  if (status === "Черновик") {
    return "Черновик";
  }

  return "В работе";
}

function getUnsupportedSalaryBreakdown(reasonLabel: string) {
  return {
    status: "unsupported" as const,
    reasonLabel,
    members: [],
  };
}

function inferShiftOrderPaymentMethod(
  order: Pick<DemoShiftOrderSnapshot, "paymentMethod" | "paymentSubLabel">,
) {
  if (order.paymentMethod) {
    return order.paymentMethod;
  }

  const normalizedLabel = order.paymentSubLabel.trim().toLowerCase();

  if (normalizedLabel.includes("налич")) {
    return "cash" as const;
  }

  if (normalizedLabel.includes("карт") || normalizedLabel.includes("перев")) {
    return "card" as const;
  }

  return null;
}

function getShiftMoneySummary(
  orders: DemoShiftOrderSnapshot[],
  expenses: number,
  accountsStore = loadDemoAccountsStore(),
) {
  const paidOrders = orders.filter((order) => order.isPaid);
  const completedUnpaidOrders = orders.filter((order) => order.isCompletedUnpaid);
  const revenue = paidOrders.reduce((total, order) => total + order.paidAmount, 0);
  const salaryAccrualTotal = paidOrders.reduce(
    (total, order) => total + (order.salaryAccrualAmount ?? 0),
    0,
  );
  const cashRevenue = paidOrders.reduce((total, order) => {
    return inferShiftOrderPaymentMethod(order) === "cash" ? total + order.paidAmount : total;
  }, 0);
  const cashlessRevenue = Math.max(0, revenue - cashRevenue);
  const accountBreakdown = getDemoAccountBreakdownFromItems(
    paidOrders,
    accountsStore,
  ) as DemoShiftAccountBreakdownItem[];
  const completedUnpaidTotal = completedUnpaidOrders.reduce(
    (total, order) => total + order.totalAmount,
    0,
  );

  return {
    revenue,
    salaryAccrualTotal,
    cashRevenue,
    cashlessRevenue,
    expenses,
    ordersCount: orders.length,
    paidOrdersCount: paidOrders.length,
    completedUnpaidCount: completedUnpaidOrders.length,
    completedUnpaidTotal,
    accountBreakdown,
  };
}

function normalizeStaffLookupValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function findEmployeeById(employees: DemoEmployeeRecord[], employeeId: string | null | undefined) {
  if (!employeeId) {
    return null;
  }

  return employees.find((employee) => employee.id === employeeId) ?? null;
}

function getEmployeeStaffLabels(employee: DemoEmployeeRecord) {
  return [
    formatEmployeeShortName(employee),
    formatEmployeeDisplayName(employee),
    employee.phone,
  ]
    .filter(Boolean)
    .map((value) => normalizeStaffLookupValue(value));
}

function findEmployeeByStaffName(
  employeeName: string,
  employees: DemoEmployeeRecord[],
) {
  const normalizedName = normalizeStaffLookupValue(employeeName);

  return (
    employees.find((employee) =>
      getEmployeeStaffLabels(employee).includes(normalizedName),
    ) ?? null
  );
}

function buildShiftStaffMember(employee: DemoEmployeeRecord): DemoShiftStaffMember {
  return {
    employeeId: employee.id,
    employeeNameSnapshot: formatEmployeeShortName(employee),
  };
}

function getDefaultShiftStaff() {
  const employeesStore = loadDemoEmployeesStore();
  const activeEmployees = getActiveEmployees(employeesStore);
  const defaultEmployee = activeEmployees[0] ?? employeesStore.employees[0] ?? null;

  return defaultEmployee
    ? [buildShiftStaffMember(defaultEmployee)]
    : [{ employeeId: null, employeeNameSnapshot: "Сотрудник" }];
}

function normalizeShiftStaffMember(
  staffMember: Partial<DemoShiftStaffMember>,
  employees: DemoEmployeeRecord[],
) {
  const employee =
    findEmployeeById(employees, staffMember.employeeId) ??
    (staffMember.employeeNameSnapshot
      ? findEmployeeByStaffName(staffMember.employeeNameSnapshot, employees)
      : null);

  return {
    employeeId: employee?.id ?? null,
    employeeNameSnapshot:
      staffMember.employeeNameSnapshot?.trim() ||
      (employee ? formatEmployeeShortName(employee) : "Сотрудник"),
  } satisfies DemoShiftStaffMember;
}

function normalizeShiftStaff(
  staff: DemoShiftStaffMember[] | undefined,
  legacyStaffMembers: string[] | undefined,
  legacyStaffLabel: string | undefined,
) {
  const employees = loadDemoEmployeesStore().employees;

  if (Array.isArray(staff) && staff.length > 0) {
    return staff.map((staffMember) => normalizeShiftStaffMember(staffMember, employees));
  }

  const legacyNames =
    Array.isArray(legacyStaffMembers) && legacyStaffMembers.length > 0
      ? legacyStaffMembers
      : legacyStaffLabel && legacyStaffLabel !== "—"
        ? legacyStaffLabel.split(", ").map((item) => item.trim()).filter(Boolean)
        : [];

  if (legacyNames.length > 0) {
    return legacyNames.map((employeeNameSnapshot) =>
      normalizeShiftStaffMember({ employeeNameSnapshot }, employees),
    );
  }

  return getDefaultShiftStaff();
}

function buildShiftStaffFromEmployeeIds(employeeIds: string[] | undefined) {
  if (!employeeIds) {
    return getDefaultShiftStaff();
  }

  const employees = loadDemoEmployeesStore().employees;

  return employeeIds
    .map((employeeId) => findEmployeeById(employees, employeeId))
    .filter((employee): employee is DemoEmployeeRecord => Boolean(employee))
    .map(buildShiftStaffMember);
}

function formatStaffLabel(staff: DemoShiftStaffMember[]) {
  const labels = staff
    .map((staffMember) => staffMember.employeeNameSnapshot.trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.join(", ") : "—";
}

function createCurrentShift(number = 1, staff = getDefaultShiftStaff()): DemoCurrentShift {
  const normalizedStaff = staff.length > 0 ? staff : getDefaultShiftStaff();

  return {
    id: `shift-${number}`,
    number,
    openedAt: new Date().toISOString(),
    isOpen: true,
    expenses: 0,
    expensesItems: [],
    staff: normalizedStaff,
    staffLabel: formatStaffLabel(normalizedStaff),
  };
}

function createDefaultShiftStore(): DemoShiftStore {
  const currentShift = createCurrentShift(1);

  return {
    currentShift,
    history: [],
    activity: [
      buildActivityItem(
        `shift-opened:${currentShift.id}:${currentShift.openedAt}`,
        "shift_opened",
        "Открыта смена",
        `Смена №${currentShift.number}`,
        currentShift.openedAt,
      ),
    ],
  };
}

function getDemoShiftOrderSortTime(order: DemoOrder) {
  const sortTime = Date.parse(order.payment.paidAt ?? order.updatedAt ?? order.createdAt);

  return Number.isFinite(sortTime) ? sortTime : 0;
}

function getDemoShiftOrderNumberSortValue(order: DemoOrder) {
  const orderNumber = Number.parseInt(order.number, 10);

  return Number.isFinite(orderNumber) ? orderNumber : 0;
}

function compareDemoShiftOrdersByRecency(left: DemoOrder, right: DemoOrder) {
  const timeDiff = getDemoShiftOrderSortTime(right) - getDemoShiftOrderSortTime(left);

  if (timeDiff !== 0) {
    return timeDiff;
  }

  const numberDiff = getDemoShiftOrderNumberSortValue(right) - getDemoShiftOrderNumberSortValue(left);

  if (numberDiff !== 0) {
    return numberDiff;
  }

  return right.id.localeCompare(left.id);
}

function getFinishedOrdersForShift(shiftId: string) {
  const accountsStore = loadDemoAccountsStore();

  return getStoredDemoOrders()
    .filter(
      (order) => isFinishedDemoOrderStatus(order.status) && order.shiftId === shiftId,
    )
    .sort(compareDemoShiftOrdersByRecency)
    .map((order) => buildShiftOrderSnapshotFromStoredOrder(order, accountsStore));
}

function buildShiftOrderSnapshotFromStoredOrder(
  order: DemoOrder,
  accountsStore = loadDemoAccountsStore(),
): DemoShiftOrderSnapshot {
  const dateTime = formatDemoOrderDateTime(order.payment.paidAt ?? order.updatedAt);
  const resolvedAccount = resolveDemoPaymentAccount(order.payment, accountsStore);
  const isPaid = order.payment.paymentStatus === "Оплачен";
  const paidAmount = isPaid ? order.payment.paidAmount ?? order.totals.total : 0;
  const totalAmount = order.totals.total;
  const paymentSubLabel = isPaid
    ? getDemoOrderPaymentMethodLabel(order.payment.paymentMethod) ?? "Оплачено"
    : "Не оплачено";

  return {
    id: order.id,
    number: order.number,
    car: formatDemoOrderCarLabel(order),
    clientLabel: getDemoOrderClientDisplayName(order.client),
    amount: isPaid ? paidAmount : totalAmount,
    paidAmount,
    totalAmount,
    salaryAccrualAmount: order.salaryAccrualTotal ?? 0,
    paymentMethod: order.payment.paymentMethod,
    accountId: resolvedAccount?.accountId ?? null,
    accountName: resolvedAccount?.accountName ?? null,
    status: getShiftDisplayStatus(
      order.payment.paymentStatus === "Оплачен" ? "Оплачен" : order.status,
    ),
    workStatusLabel: getShiftWorkStatusLabel(order.status),
    paymentStatusLabel: isPaid ? "Оплачено" : "Не оплачено",
    paymentAccountLabel:
      isPaid && resolvedAccount?.accountName && resolvedAccount.accountName !== paymentSubLabel
        ? resolvedAccount.accountName
        : null,
    isPaid,
    isCompletedUnpaid: order.status === "Выполнен" && !isPaid,
    executorLabel: order.executorNameSnapshot ?? "—",
    paymentSubLabel,
    dateTime,
    ...splitDateTimeLabel(dateTime),
  };
}

function buildActivityItem(
  id: string,
  type: DemoShiftActivityItem["type"],
  actionLabel: string,
  actionDetails: string,
  dateTime: string,
): DemoShiftActivityItem {
  return {
    id,
    type,
    actionLabel,
    actionDetails,
    dateTime,
    ...splitDateTimeLabel(formatDemoOrderDateTime(dateTime)),
  };
}

function normalizeExpenseItems(items: DemoShiftExpenseItem[] | undefined) {
  return Array.isArray(items) ? items : [];
}

function normalizeShiftOrderSnapshot(
  order: Partial<DemoShiftOrderSnapshot>,
): DemoShiftOrderSnapshot | null {
  if (
    typeof order.id !== "string" ||
    typeof order.number !== "string" ||
    typeof order.car !== "string" ||
    typeof order.clientLabel !== "string" ||
    typeof order.amount !== "number" ||
    typeof order.status !== "string" ||
    typeof order.executorLabel !== "string" ||
    typeof order.paymentSubLabel !== "string" ||
    typeof order.dateTime !== "string" ||
    typeof order.dateLabel !== "string" ||
    typeof order.timeLabel !== "string"
  ) {
    return null;
  }

  return {
    id: order.id,
    number: order.number,
    car: order.car,
    clientLabel: order.clientLabel,
    amount: order.amount,
    paidAmount: typeof order.paidAmount === "number" ? order.paidAmount : order.amount,
    totalAmount: typeof order.totalAmount === "number" ? order.totalAmount : order.amount,
    salaryAccrualAmount:
      typeof order.salaryAccrualAmount === "number" ? order.salaryAccrualAmount : 0,
    paymentMethod:
      order.paymentMethod === "cash" ||
      order.paymentMethod === "card" ||
      order.paymentMethod === "transfer" ||
      order.paymentMethod === "ildar" ||
      order.paymentMethod === "bank_account"
        ? order.paymentMethod
        : null,
    accountId: typeof order.accountId === "string" ? order.accountId : null,
    accountName: typeof order.accountName === "string" ? order.accountName : null,
    status: order.status,
    workStatusLabel:
      order.workStatusLabel === "Черновик" ||
      order.workStatusLabel === "В работе" ||
      order.workStatusLabel === "Выполнен"
        ? order.workStatusLabel
        : getShiftWorkStatusLabel(order.status),
    paymentStatusLabel:
      order.paymentStatusLabel === "Оплачено" || order.paymentStatusLabel === "Не оплачено"
        ? order.paymentStatusLabel
        : "Оплачено",
    paymentAccountLabel:
      typeof order.paymentAccountLabel === "string" ? order.paymentAccountLabel : null,
    isPaid: typeof order.isPaid === "boolean" ? order.isPaid : true,
    isCompletedUnpaid:
      typeof order.isCompletedUnpaid === "boolean" ? order.isCompletedUnpaid : false,
    executorLabel: order.executorLabel,
    paymentSubLabel: order.paymentSubLabel,
    dateTime: order.dateTime,
    dateLabel: order.dateLabel,
    timeLabel: order.timeLabel,
  };
}

function buildResolvedClosedShiftSnapshot(
  shift: DemoClosedShiftSnapshot,
  accountsStore: ReturnType<typeof loadDemoAccountsStore>,
) {
  const snapshotOrders = Array.isArray(shift.orders)
    ? shift.orders
        .map((order) => normalizeShiftOrderSnapshot(order))
        .filter((order): order is DemoShiftOrderSnapshot => Boolean(order))
    : [];
  const storedOrders = getFinishedOrdersForShift(shift.id);
  const resolvedOrders = storedOrders.length > 0 ? storedOrders : snapshotOrders;
  const summary =
    resolvedOrders.length > 0
      ? getShiftMoneySummary(resolvedOrders, shift.expenses, accountsStore)
      : {
          revenue: typeof shift.revenue === "number" ? shift.revenue : 0,
          salaryAccrualTotal:
            typeof shift.salaryAccrualTotal === "number" ? shift.salaryAccrualTotal : 0,
          cashRevenue:
            typeof shift.cashRevenue === "number" ? shift.cashRevenue : 0,
          cashlessRevenue:
            typeof shift.cashlessRevenue === "number" ? shift.cashlessRevenue : 0,
          expenses: typeof shift.expenses === "number" ? shift.expenses : 0,
          ordersCount: typeof shift.ordersCount === "number" ? shift.ordersCount : 0,
          paidOrdersCount:
            typeof shift.paidOrdersCount === "number" ? shift.paidOrdersCount : 0,
          completedUnpaidCount:
            typeof shift.completedUnpaidCount === "number" ? shift.completedUnpaidCount : 0,
          completedUnpaidTotal:
            typeof shift.completedUnpaidTotal === "number" ? shift.completedUnpaidTotal : 0,
          accountBreakdown: Array.isArray(shift.accountBreakdown)
            ? shift.accountBreakdown
            : [],
        };

  return {
    ...shift,
    expenses: summary.expenses,
    orders: resolvedOrders,
    accountBreakdown: summary.accountBreakdown,
    revenue: summary.revenue,
    salaryAccrualTotal: summary.salaryAccrualTotal,
    cashRevenue: summary.cashRevenue,
    cashlessRevenue: summary.cashlessRevenue,
    ordersCount: summary.ordersCount,
    paidOrdersCount: summary.paidOrdersCount,
    completedUnpaidCount: summary.completedUnpaidCount,
    completedUnpaidTotal: summary.completedUnpaidTotal,
    staff: normalizeShiftStaff(shift.staff, shift.staffMembers, shift.staffLabel),
    staffLabel: formatStaffLabel(
      normalizeShiftStaff(shift.staff, shift.staffMembers, shift.staffLabel),
    ),
  } satisfies DemoClosedShiftSnapshot;
}

function normalizeShiftStore(store: DemoShiftStore | null): DemoShiftStore {
  if (!store) {
    return createDefaultShiftStore();
  }

  const accountsStore = loadDemoAccountsStore();

  return {
    currentShift: store.currentShift
      ? {
          ...store.currentShift,
          expensesItems: normalizeExpenseItems(store.currentShift.expensesItems),
          salaryAccrualTotal:
            typeof store.currentShift.salaryAccrualTotal === "number"
              ? store.currentShift.salaryAccrualTotal
              : 0,
          cashRevenue:
            typeof store.currentShift.cashRevenue === "number"
              ? store.currentShift.cashRevenue
              : 0,
          cashlessRevenue:
            typeof store.currentShift.cashlessRevenue === "number"
              ? store.currentShift.cashlessRevenue
              : 0,
          paidOrdersCount:
            typeof store.currentShift.paidOrdersCount === "number"
              ? store.currentShift.paidOrdersCount
              : 0,
          completedUnpaidCount:
            typeof store.currentShift.completedUnpaidCount === "number"
              ? store.currentShift.completedUnpaidCount
              : 0,
          completedUnpaidTotal:
            typeof store.currentShift.completedUnpaidTotal === "number"
              ? store.currentShift.completedUnpaidTotal
              : 0,
          staff: normalizeShiftStaff(
            store.currentShift.staff,
            store.currentShift.staffMembers,
            store.currentShift.staffLabel,
          ),
          staffLabel: formatStaffLabel(
            normalizeShiftStaff(
              store.currentShift.staff,
              store.currentShift.staffMembers,
              store.currentShift.staffLabel,
            ),
          ),
        }
      : null,
    history: Array.isArray(store.history)
      ? store.history.map((shift) =>
          buildResolvedClosedShiftSnapshot(
            {
              ...shift,
              expensesItems: normalizeExpenseItems(shift.expensesItems),
            },
            accountsStore,
          ),
        )
      : [],
    activity: Array.isArray(store.activity) ? store.activity : [],
  };
}

function loadShiftStore(): DemoShiftStore {
  if (!canUseStorage()) {
    return createDefaultShiftStore();
  }

  const rawValue = window.localStorage.getItem(DEMO_SHIFT_STORE_KEY);

  if (!rawValue) {
    const defaultStore = createDefaultShiftStore();
    saveShiftStore(defaultStore);
    return defaultStore;
  }

  try {
    const normalizedStore = normalizeShiftStore(JSON.parse(rawValue) as DemoShiftStore);
    const normalizedRawValue = JSON.stringify(normalizedStore);

    if (normalizedRawValue !== rawValue) {
      window.localStorage.setItem(DEMO_SHIFT_STORE_KEY, normalizedRawValue);
    }

    return normalizedStore;
  } catch {
    const defaultStore = createDefaultShiftStore();
    saveShiftStore(defaultStore);
    return defaultStore;
  }
}

function saveShiftStore(store: DemoShiftStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(DEMO_SHIFT_STORE_KEY, JSON.stringify(store));
}

function syncActivityWithOrders(
  activity: DemoShiftActivityItem[],
  orders: DemoShiftOrderSnapshot[],
) {
  const nextActivity = [...activity];
  const existingOrderEventIndexes = new Map<string, number>();

  nextActivity.forEach((item, index) => {
    if (item.type === "order_finished") {
      existingOrderEventIndexes.set(item.id, index);
    }
  });

  orders.forEach((order) => {
    const eventId = `order-finished:${order.id}:${order.dateTime}`;
    const actionDetails = [order.car, formatPrice(order.amount), order.paymentSubLabel]
      .filter(Boolean)
      .join(" · ");
    const existingIndex = existingOrderEventIndexes.get(eventId);

    if (existingIndex !== undefined) {
      nextActivity[existingIndex] = {
        ...nextActivity[existingIndex],
        actionLabel: `Заказ №${order.number} завершён`,
        actionDetails,
        dateTime: order.dateTime,
        dateLabel: order.dateLabel,
        timeLabel: order.timeLabel,
      };
      return;
    }

    nextActivity.unshift({
      id: eventId,
      type: "order_finished",
      actionLabel: `Заказ №${order.number} завершён`,
      actionDetails,
      dateTime: order.dateTime,
      dateLabel: order.dateLabel,
      timeLabel: order.timeLabel,
    });
  });

  return nextActivity;
}

export function getDemoShiftState(): DemoShiftState {
  const store = loadShiftStore();
  const accountsStore = loadDemoAccountsStore();
  const currentOrders = store.currentShift
    ? getFinishedOrdersForShift(store.currentShift.id)
    : [];
  const currentSummary = getShiftMoneySummary(
    currentOrders,
    store.currentShift?.expenses ?? 0,
    accountsStore,
  );
  const syncedActivity = syncActivityWithOrders(store.activity, currentOrders);

  if (syncedActivity !== store.activity) {
    saveShiftStore({
      ...store,
      activity: syncedActivity,
    });
  }

  return {
    currentShift: store.currentShift
      ? {
          ...store.currentShift,
          revenue: currentSummary.revenue,
          salaryAccrualTotal: currentSummary.salaryAccrualTotal,
          cashRevenue: currentSummary.cashRevenue,
          cashlessRevenue: currentSummary.cashlessRevenue,
          ordersCount: currentSummary.ordersCount,
          paidOrdersCount: currentSummary.paidOrdersCount,
          completedUnpaidCount: currentSummary.completedUnpaidCount,
          completedUnpaidTotal: currentSummary.completedUnpaidTotal,
          orders: currentOrders,
          accountBreakdown: currentSummary.accountBreakdown,
          salaryBreakdown:
            store.currentShift.salaryBreakdown ??
            getUnsupportedSalaryBreakdown("Для demo-смены нет распределения по сотрудникам."),
        }
      : null,
    history: store.history,
    activity: syncedActivity,
  };
}

export function getCurrentDemoShift() {
  return loadShiftStore().currentShift;
}

export function closeCurrentDemoShift() {
  const state = getDemoShiftState();
  const store = loadShiftStore();

  if (!state.currentShift) {
    return state;
  }

  const closedAt = new Date().toISOString();
  const archivedShift: DemoClosedShiftSnapshot = {
    id: state.currentShift.id,
    number: state.currentShift.number,
    openedAt: state.currentShift.openedAt,
    closedAt,
    revenue: state.currentShift.revenue,
    expenses: state.currentShift.expenses,
    expensesItems: state.currentShift.expensesItems,
    staff: state.currentShift.staff,
    staffLabel: state.currentShift.staffLabel,
    ordersCount: state.currentShift.ordersCount,
    orders: state.currentShift.orders,
    accountBreakdown: state.currentShift.accountBreakdown,
    salaryAccrualTotal: state.currentShift.salaryAccrualTotal,
    cashRevenue: state.currentShift.cashRevenue,
    cashlessRevenue: state.currentShift.cashlessRevenue,
    paidOrdersCount: state.currentShift.paidOrdersCount,
    completedUnpaidCount: state.currentShift.completedUnpaidCount,
    completedUnpaidTotal: state.currentShift.completedUnpaidTotal,
  };
  const nextActivity = [
    {
      id: `shift-closed:${archivedShift.id}:${closedAt}`,
      type: "shift_closed" as const,
      actionLabel: "Закрыта смена",
      actionDetails: `Смена №${archivedShift.number} · ${archivedShift.ordersCount} заказов`,
      dateTime: closedAt,
      ...splitDateTimeLabel(formatDemoOrderDateTime(closedAt)),
    },
    ...store.activity,
  ];

  saveShiftStore({
    currentShift: null,
    history: [archivedShift, ...store.history],
    activity: nextActivity,
  });

  return getDemoShiftState();
}

export function openDemoShift(options?: { employeeIds?: string[] }) {
  const store = loadShiftStore();

  if (store.currentShift?.isOpen) {
    return getDemoShiftState();
  }

  const maxHistoryNumber = store.history.reduce(
    (max, shift) => Math.max(max, shift.number),
    0,
  );
  const nextShift = createCurrentShift(
    maxHistoryNumber + 1,
    buildShiftStaffFromEmployeeIds(options?.employeeIds),
  );

  saveShiftStore({
    ...store,
    currentShift: nextShift,
    activity: [
      {
        id: `shift-opened:${nextShift.id}:${nextShift.openedAt}`,
        type: "shift_opened" as const,
        actionLabel: "Открыта смена",
        actionDetails: `Смена №${nextShift.number}${nextShift.staffLabel !== "—" ? ` · ${nextShift.staffLabel}` : ""}`,
        dateTime: nextShift.openedAt,
        ...splitDateTimeLabel(formatDemoOrderDateTime(nextShift.openedAt)),
      },
      ...store.activity,
    ],
  });

  return getDemoShiftState();
}

export function addDemoShiftExpense(amount: number, description: string) {
  const store = loadShiftStore();

  if (!store.currentShift) {
    return getDemoShiftState();
  }

  const createdAt = new Date().toISOString();
  const expense: DemoShiftExpenseItem = {
    id: `expense:${store.currentShift.id}:${createdAt}`,
    amount,
    description,
    createdAt,
  };

  saveShiftStore({
    ...store,
    currentShift: {
      ...store.currentShift,
      expenses: store.currentShift.expenses + amount,
      expensesItems: [expense, ...store.currentShift.expensesItems],
    },
    activity: [
      buildActivityItem(
        `expense-added:${expense.id}`,
        "expense_added",
        "Добавлен расход",
        `${formatPrice(amount)} · ${description}`,
        createdAt,
      ),
      ...store.activity,
    ],
  });

  return getDemoShiftState();
}

export function updateDemoShiftStaff(employeeIds: string[]) {
  const store = loadShiftStore();

  if (!store.currentShift) {
    return getDemoShiftState();
  }

  const nextStaff = buildShiftStaffFromEmployeeIds(employeeIds);
  const nextStaffLabel = formatStaffLabel(nextStaff);
  const updatedAt = new Date().toISOString();

  saveShiftStore({
    ...store,
    currentShift: {
      ...store.currentShift,
      staff: nextStaff,
      staffLabel: nextStaffLabel,
    },
    activity: [
      buildActivityItem(
        `staff-updated:${store.currentShift.id}:${updatedAt}`,
        "staff_updated",
        "Изменён состав смены",
        nextStaffLabel,
        updatedAt,
      ),
      ...store.activity,
    ],
  });

  return getDemoShiftState();
}

import type { DemoOrderPaymentMethod } from "@/features/orders/types";

export type DemoShiftOrderSnapshot = {
  id: string;
  number: string;
  car: string;
  clientLabel: string;
  amount: number;
  paidAmount: number;
  totalAmount: number;
  salaryAccrualAmount: number | null;
  paymentMethod: DemoOrderPaymentMethod | null;
  accountId: string | null;
  accountName: string | null;
  status: string;
  workStatusLabel: "Черновик" | "В работе" | "Выполнен";
  paymentStatusLabel: "Не оплачено" | "Оплачено";
  paymentAccountLabel: string | null;
  isPaid: boolean;
  isCompletedUnpaid: boolean;
  executorLabel: string;
  paymentSubLabel: string;
  dateTime: string;
  dateLabel: string;
  timeLabel: string;
  payoutSnapshotMembers?: DemoShiftOrderPayoutSnapshotMember[] | null;
};

export type DemoShiftAccountBreakdownItem = {
  accountId: string;
  accountName: string;
  amount: number;
  isArchived: boolean;
};

export type DemoShiftExpenseItem = {
  id: string;
  amount: number;
  description: string;
  createdAt: string;
};

export type DemoShiftStaffOption = {
  id: string;
  label: string;
  skillLevel: string | null;
  workPercent: number;
  shiftMinimum: number;
};

export type DemoShiftUiPermissions = {
  canOpenShift: boolean;
  canManageCurrentShift: boolean;
  canCloseShift: boolean;
};

export type DemoShiftStaffMember = {
  id?: string;
  employeeId: string | null;
  employeeNameSnapshot: string;
  workPercentSnapshot?: number | null;
  shiftMinimumSnapshot?: number | null;
  skillLevelSnapshot?: string | null;
  arrivedAt?: string | null;
  leftAt?: string | null;
};

export type DemoShiftSalaryBreakdownOrderItem = {
  orderId: string;
  orderNumber: string;
  orderFundAmount: number;
  employeeAmount: number;
};

export type DemoShiftOrderPayoutSnapshotMember = {
  employeeId: string | null;
  employeeName: string;
  sharePercent: number;
  basisLabel: string;
  employeeAmount: number;
};

export type DemoShiftSalaryBreakdownMember = {
  employeeId: string | null;
  employeeName: string;
  sharePercent: number;
  basisLabel: string;
  totalAmount: number;
  orders: DemoShiftSalaryBreakdownOrderItem[];
};

export type DemoShiftSalaryBreakdown =
  | {
      status: "supported";
      mode: "shift_share";
      members: DemoShiftSalaryBreakdownMember[];
    }
  | {
      status: "unsupported";
      reasonLabel: string;
      members: DemoShiftSalaryBreakdownMember[];
    };

export type DemoShift22PreviewOrderItem = {
  orderId: string;
  orderNumber: string;
  amount: number;
};

export type DemoShift22SkippedReasonCategory =
  | "old_data_transition"
  | "missing_config"
  | "missing_rule"
  | "open_business_decision"
  | "data_issue"
  | "unsupported_case";

export type DemoShift22SkippedUnsupportedOrder = {
  orderId: string;
  orderNumber: string;
  reasonCategory: DemoShift22SkippedReasonCategory;
  reasonCategoryLabel: string;
  reasonLabel: string;
  requiresFourPlusFundPercentSetup?: boolean;
};

export type DemoShift22ExecutorPreview = {
  employeeId: string | null;
  employeeName: string | null;
  totalAmount: number;
  orderCount: number;
  orders: DemoShift22PreviewOrderItem[];
};

export type DemoShift22Preview =
  | {
      status: "supported";
      totalAmount: number;
      orderCount: number;
      notDueOrderCount: number;
      skippedUnsupportedOrderCount: number;
      skippedUnsupportedOrders: DemoShift22SkippedUnsupportedOrder[];
      members: DemoShift22ExecutorPreview[];
    }
  | {
      status: "not_due";
      reason: string;
    }
  | {
      status: "unsupported";
      skippedUnsupportedOrderCount: number;
      skippedUnsupportedOrders: DemoShift22SkippedUnsupportedOrder[];
      notDueOrderCount: number;
    }
  | {
      status: "no_order_data";
    };

export type DemoCurrentShift = {
  id: string;
  number: number;
  openedAt: string;
  isOpen: boolean;
  expenses: number;
  expensesItems: DemoShiftExpenseItem[];
  staff: DemoShiftStaffMember[];
  staffMembers?: string[];
  staffLabel: string;
  salaryAccrualTotal?: number | null;
  cashRevenue?: number;
  cashlessRevenue?: number;
  paidOrdersCount?: number;
  completedUnpaidCount?: number;
  completedUnpaidTotal?: number;
  salaryBreakdown?: DemoShiftSalaryBreakdown;
  stage22Preview?: DemoShift22Preview;
};

export type DemoClosedShiftSnapshot = {
  id: string;
  number: number;
  openedAt: string;
  closedAt: string;
  revenue: number;
  expenses: number;
  expensesItems: DemoShiftExpenseItem[];
  staff: DemoShiftStaffMember[];
  staffMembers?: string[];
  staffLabel: string;
  ordersCount: number;
  orders: DemoShiftOrderSnapshot[];
  accountBreakdown: DemoShiftAccountBreakdownItem[];
  salaryAccrualTotal: number | null;
  cashRevenue: number;
  cashlessRevenue: number;
  paidOrdersCount: number;
  completedUnpaidCount: number;
  completedUnpaidTotal: number;
  salaryBreakdown?: DemoShiftSalaryBreakdown;
  stage22Preview?: DemoShift22Preview;
};

export type DemoShiftActivityType =
  | "shift_opened"
  | "shift_closed"
  | "order_finished"
  | "expense_added"
  | "staff_updated"
  | "staff_attendance";

export type DemoShiftActivityItem = {
  id: string;
  type: DemoShiftActivityType;
  actionLabel: string;
  actionDetails: string;
  dateTime: string;
  dateLabel: string;
  timeLabel: string;
};

export type DemoShiftStore = {
  currentShift: DemoCurrentShift | null;
  history: DemoClosedShiftSnapshot[];
  activity: DemoShiftActivityItem[];
};

export type DemoShiftState = {
  currentShift:
    | (DemoCurrentShift & {
      revenue: number;
      salaryAccrualTotal: number | null;
      cashRevenue: number;
      cashlessRevenue: number;
      paidOrdersCount: number;
      completedUnpaidCount: number;
      completedUnpaidTotal: number;
      ordersCount: number;
      orders: DemoShiftOrderSnapshot[];
      accountBreakdown: DemoShiftAccountBreakdownItem[];
      salaryBreakdown: DemoShiftSalaryBreakdown;
    })
    | null;
  history: DemoClosedShiftSnapshot[];
  activity: DemoShiftActivityItem[];
};

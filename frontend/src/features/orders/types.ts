export type DemoOrderStatus =
  | "Черновик"
  | "В работе"
  | "Ожидает оплаты"
  | "Оплачен"
  | "Выполнен"
  | "Пометить на удаление";

import type { CartItem } from "@/features/cashier/types";
import type { OrderDraftMode } from "@/features/order-draft/types";
import type { Stage22PayrollPreview } from "@/features/payroll/stage22-preview";
import type { Radius, VehicleTypeId } from "@/features/pricing/types";

export type DemoOrderClientSnapshot = {
  mode: OrderDraftMode;
  clientId: string;
  clientKind: "individual" | "legal";
  inn?: string;
  organizationName?: string;
  contractNumber?: string;
  label: string;
  details: string;
  name: string;
  phone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
  preferredRadius: Radius | "";
  anonymous: boolean;
};

export type DemoOrderPaymentStatus = "Не оплачено" | "Оплачен";

export type DemoOrderPaymentMethod =
  | "cash"
  | "card"
  | "transfer"
  | "ildar"
  | "bank_account";

export type DemoOrderPaymentSnapshot = {
  paymentStatus: DemoOrderPaymentStatus;
  paymentMethod: DemoOrderPaymentMethod | null;
  paymentLabel: string | null;
  accountId: string | null;
  accountNameSnapshot: string | null;
  terminalId?: string | null;
  terminalLabel?: string | null;
  paidAt: string | null;
  paidAmount: number | null;
  paidTotal?: number | null;
  remainingAmount?: number | null;
  note: string | null;
  internalComment?: string | null;
};

export type OrderExecutorItem = {
  id: string;
  employeeId: string | null;
  employeeNameSnapshot: string;
  skillLevelSnapshot: string | null;
  workPercentSnapshot: number | null;
  sortOrder: number;
};

export type OrderExecutorOption = {
  id: string;
  label: string;
  subtitle?: string;
};

export type OrderPersistedPayrollPayoutSummary = {
  employeeId: string | null;
  employeeNameSnapshot: string;
  skillLevelSnapshot: string | null;
  amount: number;
};

export type OrderPersistedPayrollSummary = {
  accrualCount: number;
  payoutCount: number;
  status: string;
  statusReason: string | null;
  paidBaseAmount: number;
  salaryFundAmount: number;
  payoutAmount: number;
  payouts: OrderPersistedPayrollPayoutSummary[];
};

export type DemoOrderTotals = {
  servicesCount: number;
  subtotal: number;
  discount: number;
  discountPercent?: number;
  total: number;
};

export type DemoOrder = {
  id: string;
  number: string;
  createdAt: string;
  updatedAt: string;
  status: DemoOrderStatus;
  client: DemoOrderClientSnapshot;
  vehicleType: VehicleTypeId;
  radius: Radius;
  lowProfile: boolean;
  runflat: boolean;
  executorId?: string | null;
  executorEmployeeId: string | null;
  executorNameSnapshot: string | null;
  executorEmployeeIds?: string[];
  shiftId: string | null;
  shiftLabelSnapshot: string | null;
  shiftOpenedAtSnapshot: string | null;
  lines: CartItem[];
  salaryAccrualTotal: number | null;
  totals: DemoOrderTotals;
  note: string;
  payment: DemoOrderPaymentSnapshot;
  executors?: OrderExecutorItem[];
};

export type DemoOrderListItem = {
  id: string;
  number: string;
  dateTime: string;
  createdAtIso: string;
  client: string;
  car: string;
  plateNumber?: string;
  amount: number;
  paymentLabel?: string;
  paymentAccountLabel?: string | null;
  paymentStatus?: DemoOrderPaymentStatus;
  status: DemoOrderStatus;
  executorLabel?: string;
};

export type DemoOrderDetail = {
  id: string;
  number: string;
  shiftLabel: string;
  createdAt: string;
  completedAt: string;
  durationLabel: string;
  workSummary: string;
  paymentLabel: string;
  paymentAccountLabel?: string | null;
  paymentStatus?: DemoOrderPaymentStatus;
  carLabel: string;
  clientLabel: string;
  clientPhone?: string;
  executorLabel?: string;
  amount: number;
  salaryAccrualTotal: number | null;
  status: DemoOrderStatus;
  executors?: OrderExecutorItem[];
  persistedPayroll?: OrderPersistedPayrollSummary | null;
  payrollPreview?: Stage22PayrollPreview;
};

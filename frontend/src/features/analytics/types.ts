export type AnalyticsPeriodFilter = {
  from: string;
  to: string;
};

export type AnalyticsOrderHistoryFilter = {
  search: string;
  status: string;
};

export type AnalyticsSummary = {
  revenueTotal: number;
  ordersCount: number;
  salaryPayoutTotal: number | null;
};

export type AnalyticsPayoutCoverage = {
  supportedShiftsCount: number;
  excludedShiftsCount: number;
  excludedOrdersCount: number;
  oldOrderTransitionOrdersCount: number;
  unsupportedReason: string | null;
  isPartial: boolean;
};

export type AnalyticsShiftRow = {
  shiftId: string;
  shiftNumber: number;
  statusLabel: string;
  dateLabel: string;
  staffLabel: string;
  ordersCount: number;
  revenue: number;
  salaryPayoutTotal: number | null;
};

export type AnalyticsEmployeeRow = {
  employeeKey: string;
  employeeName: string;
  shiftsCount: number;
  ordersCount: number;
  totalAmount: number;
};

export type AnalyticsServiceRow = {
  serviceKey: string;
  serviceName: string;
  categoryLabel: string;
  quantity: number;
  ordersCount: number;
  revenue: number;
};

export type AnalyticsOrderRow = {
  id: string;
  number: string;
  dateTime: string;
  clientLabel: string;
  carLabel: string;
  amount: number;
  status: string;
  paymentLabel: string;
  salaryAccrualTotal: number | null;
};

export type BranchBasicAnalytics = {
  summary: AnalyticsSummary;
  payoutCoverage: AnalyticsPayoutCoverage;
  shifts: AnalyticsShiftRow[];
  employees: AnalyticsEmployeeRow[];
  services: AnalyticsServiceRow[];
  orders: AnalyticsOrderRow[];
};

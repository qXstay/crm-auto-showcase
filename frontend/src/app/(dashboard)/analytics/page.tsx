import { AnalyticsScreen } from "@/features/analytics/components/analytics-screen";
import type {
  AnalyticsOrderHistoryFilter,
  AnalyticsPeriodFilter,
} from "@/features/analytics/types";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { getBranchBasicAnalytics } from "@/server/repositories/analytics-read-repository";

export const dynamic = "force-dynamic";

function getTodayKey() {
  return new Intl.DateTimeFormat("sv-SE").format(new Date());
}

function getMonthStartKey(dateKey: string) {
  return `${dateKey.slice(0, 7)}-01`;
}

function getSingleParam(value: string | string[] | undefined) {
  return typeof value === "string" ? value : undefined;
}

function normalizeDateKey(value: string | undefined, fallback: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  return fallback;
}

function buildPeriodFilter(params: {
  from?: string;
  to?: string;
}): AnalyticsPeriodFilter {
  const today = getTodayKey();
  const from = normalizeDateKey(params.from, getMonthStartKey(today));
  const to = normalizeDateKey(params.to, today);

  if (from <= to) {
    return { from, to };
  }

  return { from: to, to: from };
}

function buildOrderHistoryFilter(params: {
  orderSearch?: string;
  orderStatus?: string;
}): AnalyticsOrderHistoryFilter {
  const rawStatus = params.orderStatus?.trim() || "all";

  return {
    search: params.orderSearch?.trim() ?? "",
    status: rawStatus === "Выполнен" ? "Оплачен" : rawStatus,
  };
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    from?: string | string[];
    to?: string | string[];
    orderSearch?: string | string[];
    orderStatus?: string | string[];
  }>;
}) {
  const auth = await requireServerAuthContext();

  if (!hasServerPermission(auth, "analytics.view")) {
    return null;
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const period = buildPeriodFilter({
    from: getSingleParam(resolvedSearchParams.from),
    to: getSingleParam(resolvedSearchParams.to),
  });
  const orderHistoryFilter = buildOrderHistoryFilter({
    orderSearch: getSingleParam(resolvedSearchParams.orderSearch),
    orderStatus: getSingleParam(resolvedSearchParams.orderStatus),
  });
  const analytics = await getBranchBasicAnalytics(auth.currentBranch.id, {
    from: period.from,
    to: period.to,
    orderSearch: orderHistoryFilter.search,
    orderStatus: orderHistoryFilter.status,
  });

  return (
    <AnalyticsScreen
      branchLabel={auth.currentBranch.displayName}
      period={period}
      orderHistoryFilter={orderHistoryFilter}
      analytics={analytics}
    />
  );
}

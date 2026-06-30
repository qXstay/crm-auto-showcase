"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  AnalyticsOrderHistoryFilter,
  AnalyticsPeriodFilter,
  BranchBasicAnalytics,
} from "@/features/analytics/types";
import { getOrderVisibleStatusLabel } from "@/features/orders/lifecycle";
import { formatPrice } from "@/features/pricing/config";

const INITIAL_VISIBLE_SERVICES_COUNT = 8;
const INITIAL_VISIBLE_MOBILE_SERVICES_COUNT = 6;
const INITIAL_VISIBLE_MOBILE_ORDERS_COUNT = 6;

function formatAnalyticsOrderStatus(status: string) {
  return getOrderVisibleStatusLabel(status);
}

function SummaryCard({
  label,
  value,
  subLabel,
}: {
  label: string;
  value: string;
  subLabel?: string | null;
}) {
  return (
    <div className="border border-[color:var(--border)] bg-white px-4 py-3.5 shadow-[0_1px_0_0_var(--border)]">
      <div className="text-[12px] font-medium leading-4 text-[color:var(--muted)]">{label}</div>
      <div className="mt-1.5 text-[25px] font-semibold leading-7 tracking-[-0.01em] text-[color:var(--foreground)] [font-variant-numeric:tabular-nums]">
        {value}
      </div>
      {subLabel ? (
        <div className="mt-1.5 max-w-[42ch] text-[12px] leading-4.5 text-[color:var(--muted)]">
          {subLabel}
        </div>
      ) : null}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border border-[color:var(--border)] bg-white shadow-[0_1px_0_0_var(--border)]">
      <div className="border-b border-[color:var(--border)] px-4 py-3">
        <div className="text-[15px] font-medium leading-5 text-[color:var(--foreground)]">
          {title}
        </div>
        {description ? (
          <div className="mt-1 text-[12px] leading-4 text-[color:var(--muted)]">{description}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}

export function AnalyticsScreen({
  branchLabel,
  period,
  orderHistoryFilter,
  analytics,
}: {
  branchLabel: string;
  period: AnalyticsPeriodFilter;
  orderHistoryFilter: AnalyticsOrderHistoryFilter;
  analytics: BranchBasicAnalytics;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showAllServices, setShowAllServices] = useState(false);
  const [showAllMobileServices, setShowAllMobileServices] = useState(false);
  const [showAllMobileOrders, setShowAllMobileOrders] = useState(false);
  const [orderSearchValue, setOrderSearchValue] = useState(orderHistoryFilter.search);
  const [orderStatusValue, setOrderStatusValue] = useState(orderHistoryFilter.status);
  const initializedRef = useRef(false);

  const salarySummaryValue =
    analytics.summary.salaryPayoutTotal === null
      ? formatPrice(0)
      : formatPrice(analytics.summary.salaryPayoutTotal);
  const visibleServices = showAllServices
    ? analytics.services
    : analytics.services.slice(0, INITIAL_VISIBLE_SERVICES_COUNT);
  const visibleMobileServices = showAllMobileServices
    ? analytics.services
    : analytics.services.slice(0, INITIAL_VISIBLE_MOBILE_SERVICES_COUNT);
  const hiddenServicesCount = Math.max(
    0,
    analytics.services.length - INITIAL_VISIBLE_SERVICES_COUNT,
  );
  const hiddenMobileServicesCount = Math.max(
    0,
    analytics.services.length - INITIAL_VISIBLE_MOBILE_SERVICES_COUNT,
  );
  const visibleMobileOrders = showAllMobileOrders
    ? analytics.orders
    : analytics.orders.slice(0, INITIAL_VISIBLE_MOBILE_ORDERS_COUNT);
  const hiddenMobileOrdersCount = Math.max(
    0,
    analytics.orders.length - INITIAL_VISIBLE_MOBILE_ORDERS_COUNT,
  );

  const replaceHistoryFilters = useCallback((nextValues: {
    search?: string;
    status?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());
    const nextSearch = nextValues.search ?? orderSearchValue;
    const nextStatus = nextValues.status ?? orderStatusValue;

    if (nextSearch.trim()) {
      params.set("orderSearch", nextSearch.trim());
    } else {
      params.delete("orderSearch");
    }

    if (nextStatus !== "all") {
      params.set("orderStatus", nextStatus);
    } else {
      params.delete("orderStatus");
    }

    const nextUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    startTransition(() => {
      router.replace(nextUrl, { scroll: false });
    });
  }, [orderSearchValue, orderStatusValue, pathname, router, searchParams]);

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const currentSearchValue = searchParams.get("orderSearch") ?? "";

      if (orderSearchValue === currentSearchValue) {
        return;
      }

      replaceHistoryFilters({ search: orderSearchValue });
    }, 320);

    return () => window.clearTimeout(timeoutId);
  }, [orderSearchValue, replaceHistoryFilters, searchParams]);

  return (
    <section className="max-w-[1360px]">
      <div className="space-y-4">
        <div className="border border-[color:var(--border)] bg-white shadow-[0_1px_0_0_var(--border)]">
          <div className="border-b border-[color:var(--border)] px-4 py-3">
            <div className="text-[18px] font-semibold leading-6 text-[color:var(--foreground)]">
              Аналитика
            </div>
            <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
              Текущий филиал: {branchLabel}
            </div>
          </div>
          <form className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end" method="get">
            <label className="block w-full sm:w-auto">
              <span className="mb-1 block text-[12px] leading-4 text-[color:var(--muted)]">
                С
              </span>
              <input
                type="date"
                name="from"
                defaultValue={period.from}
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)] outline-none sm:w-[170px]"
              />
            </label>
            <label className="block w-full sm:w-auto">
              <span className="mb-1 block text-[12px] leading-4 text-[color:var(--muted)]">
                По
              </span>
              <input
                type="date"
                name="to"
                defaultValue={period.to}
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)] outline-none sm:w-[170px]"
              />
            </label>
            <button
              type="submit"
              className="inline-flex h-10 w-full items-center justify-center border border-[color:var(--border)] bg-[color:var(--foreground)] px-4 text-[14px] font-medium text-white transition-colors hover:opacity-95 sm:w-auto"
            >
              Показать
            </button>
          </form>
        </div>

        <div className="grid gap-3 lg:grid-cols-3">
          <SummaryCard
            label="Выручка за период"
            value={formatPrice(analytics.summary.revenueTotal)}
          />
          <SummaryCard
            label="Заказов за период"
            value={new Intl.NumberFormat("ru-RU").format(analytics.summary.ordersCount)}
          />
          <SummaryCard
            label="К выплате сотрудникам"
            value={salarySummaryValue}
          />
        </div>

        <Section title="Выручка по сменам">
          <div className="divide-y divide-[color:var(--border)] sm:hidden">
            {analytics.shifts.length > 0 ? (
              analytics.shifts.map((shift) => (
                <div key={shift.shiftId} className="px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">Смена №{shift.shiftNumber}</div>
                      <div className="mt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">
                        {shift.dateLabel}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-medium">{formatPrice(shift.revenue)}</div>
                      <div className="mt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">
                        {shift.ordersCount} заказов
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1.5 text-[13px] leading-5 text-[color:var(--muted)]">
                    <div>Статус: {shift.statusLabel}</div>
                    <div>Состав: {shift.staffLabel}</div>
                    <div>
                      К выплате:{" "}
                      <span className="text-[color:var(--foreground)]">
                        {shift.salaryPayoutTotal === null
                          ? formatPrice(0)
                          : formatPrice(shift.salaryPayoutTotal)}
                      </span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                За выбранный период смен пока нет.
              </div>
            )}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[880px]">
              <div className="grid grid-cols-[108px_120px_minmax(0,1fr)_96px_140px_160px] border-b border-[color:var(--border)] px-4 py-2.5 text-[12px] leading-4 text-[color:var(--muted)]">
                <span>Смена</span>
                <span>Статус</span>
                <span>Состав</span>
                <span>Заказов</span>
                <span>Выручка</span>
                <span>К выплате</span>
              </div>
              <div className="divide-y divide-[color:var(--border)]">
                {analytics.shifts.length > 0 ? (
                  analytics.shifts.map((shift) => (
                    <div
                      key={shift.shiftId}
                      className="grid grid-cols-[108px_120px_minmax(0,1fr)_96px_140px_160px] items-center px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                    >
                      <div>
                        <div className="font-medium">№{shift.shiftNumber}</div>
                        <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                          {shift.dateLabel}
                        </div>
                      </div>
                      <span className="text-[13px] text-[color:var(--muted)]">{shift.statusLabel}</span>
                      <span className="truncate pr-3">{shift.staffLabel}</span>
                      <span>{shift.ordersCount}</span>
                      <span className="font-medium">{formatPrice(shift.revenue)}</span>
                      <span className="font-medium">
                        {shift.salaryPayoutTotal === null
                          ? formatPrice(0)
                          : formatPrice(shift.salaryPayoutTotal)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                    За выбранный период смен пока нет.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Section
            title="Начисления по сотрудникам"
            description="Суммы по сменам и оплаченным заказам выбранного периода."
          >
            <div className="divide-y divide-[color:var(--border)] sm:hidden">
              {analytics.employees.length > 0 ? (
                analytics.employees.map((employee) => (
                  <div
                    key={employee.employeeKey}
                    className="px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 font-medium">{employee.employeeName}</div>
                      <div className="shrink-0 font-medium">{formatPrice(employee.totalAmount)}</div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-5 text-[color:var(--muted)]">
                      <span>Смен: {employee.shiftsCount}</span>
                      <span>Заказов: {employee.ordersCount}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                  За выбранный период начислений по сотрудникам пока нет.
                </div>
              )}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <div className="min-w-[580px]">
                <div className="grid grid-cols-[minmax(0,1fr)_108px_108px_140px] border-b border-[color:var(--border)] px-4 py-2.5 text-[12px] leading-4 text-[color:var(--muted)]">
                  <span>Сотрудник</span>
                  <span>Смен</span>
                  <span>Заказов</span>
                  <span>К выплате</span>
                </div>
                <div className="divide-y divide-[color:var(--border)]">
                  {analytics.employees.length > 0 ? (
                    analytics.employees.map((employee) => (
                      <div
                        key={employee.employeeKey}
                        className="grid grid-cols-[minmax(0,1fr)_108px_108px_140px] items-center px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                      >
                        <span className="truncate pr-3 font-medium">{employee.employeeName}</span>
                        <span>{employee.shiftsCount}</span>
                        <span>{employee.ordersCount}</span>
                        <span className="font-medium">{formatPrice(employee.totalAmount)}</span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                      За выбранный период начислений по сотрудникам пока нет.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Section>

          <Section
            title="Суммы по услугам"
            description="По оплаченным и завершённым заказам выбранного периода."
          >
            <div className="divide-y divide-[color:var(--border)] sm:hidden">
              {visibleMobileServices.length > 0 ? (
                visibleMobileServices.map((service) => (
                  <div
                    key={service.serviceKey}
                    className="px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                  >
                    <div className="font-medium [overflow-wrap:anywhere]">{service.serviceName}</div>
                    <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)] [overflow-wrap:anywhere]">
                      {service.categoryLabel}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px] leading-5">
                      <span className="text-[color:var(--muted)]">Кол-во: {service.quantity}</span>
                      <span className="text-[color:var(--muted)]">Заказов: {service.ordersCount}</span>
                      <span className="font-medium text-[color:var(--foreground)]">
                        {formatPrice(service.revenue)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                  За выбранный период оплаченных услуг пока нет.
                </div>
              )}
              {hiddenMobileServicesCount > 0 ? (
                <div className="border-t border-[color:var(--border)] px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setShowAllMobileServices((current) => !current)}
                    className="text-[13px] font-medium leading-5 text-[color:var(--primary)] transition-opacity hover:opacity-80"
                  >
                    {showAllMobileServices
                      ? "Показать компактно"
                      : `Показать ещё (${hiddenMobileServicesCount})`}
                  </button>
                </div>
              ) : null}
            </div>

            <div className="hidden overflow-x-auto sm:block">
              <div className="min-w-[640px]">
                <div className="grid grid-cols-[minmax(0,1fr)_150px_96px_96px_132px] border-b border-[color:var(--border)] px-4 py-2.5 text-[12px] leading-4 text-[color:var(--muted)]">
                  <span>Услуга</span>
                  <span>Категория</span>
                  <span>Кол-во</span>
                  <span>Заказов</span>
                  <span>Сумма</span>
                </div>
                <div className="max-h-[460px] divide-y divide-[color:var(--border)] overflow-y-auto">
                  {visibleServices.length > 0 ? (
                    visibleServices.map((service) => (
                      <div
                        key={service.serviceKey}
                        className="grid grid-cols-[minmax(0,1fr)_150px_96px_96px_132px] items-start px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                      >
                        <span className="pr-4 font-medium leading-5 [overflow-wrap:anywhere]">
                          {service.serviceName}
                        </span>
                        <span className="pr-3 text-[13px] leading-5 text-[color:var(--muted)] [overflow-wrap:anywhere]">
                          {service.categoryLabel}
                        </span>
                        <span className="[font-variant-numeric:tabular-nums]">{service.quantity}</span>
                        <span className="[font-variant-numeric:tabular-nums]">{service.ordersCount}</span>
                        <span className="font-medium [font-variant-numeric:tabular-nums]">
                          {formatPrice(service.revenue)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                      За выбранный период оплаченных услуг пока нет.
                    </div>
                  )}
                </div>
                {hiddenServicesCount > 0 ? (
                  <div className="border-t border-[color:var(--border)] px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setShowAllServices((current) => !current)}
                      className="text-[13px] font-medium leading-5 text-[color:var(--primary)] transition-opacity hover:opacity-80"
                    >
                      {showAllServices
                        ? "Показать компактно"
                        : `Показать все услуги (${hiddenServicesCount} ещё)`}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </Section>
        </div>

        <Section title="История заказов" description="Базовая фильтрация внутри выбранного периода.">
          <div className="flex flex-col gap-3 border-b border-[color:var(--border)] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="block w-full sm:w-auto">
              <span className="mb-1 block text-[12px] leading-4 text-[color:var(--muted)]">
                Поиск
              </span>
              <input
                type="search"
                value={orderSearchValue}
                onChange={(event) => setOrderSearchValue(event.target.value)}
                placeholder="Номер, клиент, автомобиль"
                className="h-10 w-full border border-[color:var(--border)] px-3 text-[14px] text-[color:var(--foreground)] outline-none sm:w-[280px]"
              />
              <span className="mt-1 block text-[11px] leading-4 text-[color:var(--muted)]">
                Поиск применяется автоматически
              </span>
            </label>
            <label className="block w-full sm:w-auto">
              <span className="mb-1 block text-[12px] leading-4 text-[color:var(--muted)]">
                Статус
              </span>
              <select
                value={orderStatusValue}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setOrderStatusValue(nextValue);
                  replaceHistoryFilters({ status: nextValue });
                }}
                className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none sm:w-[180px]"
              >
                <option value="all">Все статусы</option>
                <option value="Черновик">Черновик</option>
                <option value="В работе">В работе</option>
                <option value="Ожидает оплаты">Ожидает оплаты</option>
                <option value="Оплачен">Оплачен</option>
              </select>
              <span className="mt-1 block text-[11px] leading-4 text-[color:var(--muted)]">
                Фильтр применяется сразу
              </span>
            </label>
            {isPending ? (
              <div className="h-10 text-[12px] leading-10 text-[color:var(--muted)]">Обновляем…</div>
            ) : null}
          </div>

          <div className="divide-y divide-[color:var(--border)] sm:hidden">
            {visibleMobileOrders.length > 0 ? (
              visibleMobileOrders.map((order) => (
                <div
                  key={order.id}
                  className="px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{order.number}</div>
                      <div className="mt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">
                        {order.dateTime}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="font-medium">{formatPrice(order.amount)}</div>
                      <div className="mt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">
                        {formatAnalyticsOrderStatus(order.status)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 space-y-1 text-[13px] leading-5 text-[color:var(--muted)]">
                    <div className="truncate">Клиент: {order.clientLabel}</div>
                    <div className="truncate">Автомобиль: {order.carLabel}</div>
                    <div className="truncate">Оплата: {order.paymentLabel}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                Заказов по этим фильтрам нет.
              </div>
            )}
            {hiddenMobileOrdersCount > 0 ? (
              <div className="border-t border-[color:var(--border)] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setShowAllMobileOrders((current) => !current)}
                  className="text-[13px] font-medium leading-5 text-[color:var(--primary)] transition-opacity hover:opacity-80"
                >
                  {showAllMobileOrders
                    ? "Показать компактно"
                    : `Показать ещё (${hiddenMobileOrdersCount})`}
                </button>
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[1120px]">
              <div className="grid grid-cols-[96px_186px_220px_220px_126px_160px_126px] border-b border-[color:var(--border)] px-4 py-2.5 text-[12px] leading-4 text-[color:var(--muted)]">
                <span>Заказ</span>
                <span>Дата</span>
                <span>Клиент</span>
                <span>Автомобиль</span>
                <span>Сумма</span>
                <span>Оплата</span>
                <span>Статус</span>
              </div>
              <div className="divide-y divide-[color:var(--border)]">
                {analytics.orders.length > 0 ? (
                  analytics.orders.map((order) => (
                    <div
                      key={order.id}
                      className="grid grid-cols-[96px_186px_220px_220px_126px_160px_126px] items-center px-4 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
                    >
                      <span className="font-medium">{order.number}</span>
                      <span className="text-[13px] text-[color:var(--muted)]">{order.dateTime}</span>
                      <span className="truncate pr-3">{order.clientLabel}</span>
                      <span className="truncate pr-3 text-[color:var(--muted)]">{order.carLabel}</span>
                      <span className="font-medium">{formatPrice(order.amount)}</span>
                      <span className="truncate pr-3 text-[13px] text-[color:var(--muted)]">
                        {order.paymentLabel}
                      </span>
                      <span>{formatAnalyticsOrderStatus(order.status)}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-4 py-6 text-[14px] leading-5 text-[color:var(--muted)]">
                    Заказов по этим фильтрам нет.
                  </div>
                )}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </section>
  );
}

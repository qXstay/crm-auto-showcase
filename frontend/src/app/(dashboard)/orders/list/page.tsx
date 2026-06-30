import Link from "next/link";
import { Pencil, Eye } from "lucide-react";
import { formatPrice } from "@/features/pricing/config";
import { OrdersTabs } from "@/features/order-draft/components/orders-tabs";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { listOrdersForBranch } from "@/server/repositories/order-read-repository";
import { OrderStatusBadge } from "@/components/ui/badge";
import { OrderDeleteAction } from "@/features/orders/components/order-delete-action";
import type { DemoOrderListItem } from "@/features/orders/types";
import {
  formatOperationalDateKey,
  PEGAS_OPERATIONAL_TIME_ZONE,
} from "@/shared/operational-time";

function getOrderStatusTextClass(status: string) {
  switch (status) {
    case "Оплачен":          return "status-text-success";
    case "Выполнен":         return "status-text-warning";
    case "В работе":         return "status-text-info";
    case "Ожидает оплаты":   return "status-text-warning";
    case "Отменён":          return "status-text-danger";
    default:                 return "status-text-muted";
  }
}

function formatDateTwoLines(dateTime: string) {
  // dateTime may be e.g. "1 апреля 2026 г. в 03:57" — split from " в "
  const idx = dateTime.indexOf(" в ");
  if (idx === -1) return { date: dateTime, time: "" };
  return { date: dateTime.slice(0, idx), time: dateTime.slice(idx + 3) };
}

export const dynamic = "force-dynamic";

function getDateKey(isoString: string) {
  return formatOperationalDateKey(new Date(isoString));
}

function formatDateGroupLabel(isoDateKey: string) {
  const date = new Date(`${isoDateKey}T12:00:00+05:00`);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  const todayKey = formatOperationalDateKey(today);
  const yesterdayKey = formatOperationalDateKey(yesterday);

  if (isoDateKey === todayKey) {
    return "Сегодня";
  }
  if (isoDateKey === yesterdayKey) {
    return "Вчера";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function parsePageParam(value: string | string[] | undefined) {
  const rawValue = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseInt(rawValue ?? "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function groupOrdersByDate(orders: DemoOrderListItem[]) {
  const groups = new Map<string, DemoOrderListItem[]>();

  for (const order of orders) {
    const key = getDateKey(order.createdAtIso);
    const existing = groups.get(key);

    if (existing) {
      existing.push(order);
    } else {
      groups.set(key, [order]);
    }
  }

  return Array.from(groups.entries()).map(([dateKey, items]) => ({
    dateKey,
    label: formatDateGroupLabel(dateKey),
    orders: items,
  }));
}

function PaginationBar({
  page,
  hasPreviousPage,
  hasNextPage,
  from,
  to,
  totalCount,
}: {
  page: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
  from: number;
  to: number;
  totalCount: number;
}) {
  const summary = totalCount === 0 ? "Заказов пока нет" : `Показаны ${from}–${to} из ${totalCount}`;
  const previousHref = page > 2 ? `/orders/list?page=${page - 1}` : "/orders/list";
  const nextHref = `/orders/list?page=${page + 1}`;
  const buttonClass =
    "inline-flex h-9 items-center justify-center rounded-md border border-[color:var(--border)] px-3 text-[13px] font-medium transition-colors";
  const enabledClass = `${buttonClass} bg-white text-[color:var(--foreground)] hover:bg-[color:var(--background)]`;
  const disabledClass = `${buttonClass} cursor-not-allowed bg-[color:var(--background)] text-[color:var(--muted)]`;

  return (
    <div className="flex flex-col gap-2 border-b border-[color:var(--border)] px-4 py-3 text-[13px] text-[color:var(--muted)] sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div>{summary}</div>
      <div className="flex items-center gap-2">
        {hasPreviousPage ? (
          <Link href={previousHref} className={enabledClass}>
            Назад
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            Назад
          </span>
        )}
        {hasNextPage ? (
          <Link href={nextHref} className={enabledClass}>
            Дальше
          </Link>
        ) : (
          <span className={disabledClass} aria-disabled="true">
            Дальше
          </span>
        )}
      </div>
    </div>
  );
}

export default async function OrdersListPage({
  searchParams,
}: {
  searchParams?: Promise<{ page?: string | string[] }>;
}) {
  const auth = await requireServerAuthContext();

  if (!hasServerPermission(auth, "order.view")) {
    return null;
  }

  const resolvedSearchParams = (await searchParams) ?? {};
  const { orders, pagination } = await listOrdersForBranch(auth.currentBranch.id, {
    page: parsePageParam(resolvedSearchParams.page),
  });
  const canManageOrders = hasServerPermission(auth, "order.create");
  const dateGroups = groupOrdersByDate(orders);

  return (
    <section className="w-full">
      <div className="bg-white">
        <OrdersTabs activeTab="list" />
        <PaginationBar {...pagination} />

        {/* Mobile card list */}
        <div className="sm:hidden">
          {dateGroups.length === 0 ? (
            <div className="px-4 py-6 text-[15px] leading-5 text-[color:var(--muted)]">
              Заказов пока нет.
            </div>
          ) : null}
          {dateGroups.map((group) => (
            <div key={group.dateKey}>
              {/* Date group header */}
              <div className="sticky top-0 z-10 border-b border-[color:var(--border)] bg-[color:var(--background)] px-4 py-1 text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                {group.label}
              </div>
              <div className="divide-y divide-[color:var(--border)]">
                {group.orders.map((order) => {
                  const isDraft = order.status === "Черновик";
                  const isInProgress = order.status === "В работе";
                  const isAwaitingPayment = order.status === "Ожидает оплаты";
                  const opensEditor = isDraft || isInProgress || isAwaitingPayment;

                  return (
                    <div key={order.id}>
                      <Link
                        href={opensEditor ? `/orders?id=${order.id}` : `/orders/view/${order.id}`}
                        className="block bg-white px-4 py-3 transition-colors hover:bg-[color:var(--background)]"
                        title="Открыть / редактировать"
                        aria-label="Открыть / редактировать"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-[11px] leading-4 text-[color:var(--muted)]">Заказ</div>
                            <div className="text-[16px] font-semibold leading-6 text-[color:var(--foreground)]">
                              {order.number}
                            </div>
                          </div>
                          <OrderStatusBadge status={order.status} size="sm" className="mt-0.5 shrink-0" />
                        </div>

                        <div className="mt-2.5 min-w-0">
                          <div className="text-[15px] font-medium leading-5 text-[color:var(--foreground)]">
                            {order.client}
                          </div>
                          <div className="mt-1 flex items-start justify-between gap-3">
                            <div className="min-w-0 text-[13px] leading-5 text-[color:var(--muted)]">
                              <div>{order.dateTime}</div>
                              <div className="truncate">Автомобиль: {order.car}</div>
                              <div className="truncate">Госномер: {order.plateNumber || "Не указан"}</div>
                              <div className="truncate">Исполнители: {order.executorLabel || "—"}</div>
                              <div className="truncate">Оплата: {order.paymentLabel || "Не оплачено"}</div>
                              {order.paymentAccountLabel ? (
                                <div className="truncate">Счёт: {order.paymentAccountLabel}</div>
                              ) : null}
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-[16px] font-semibold leading-5 text-[color:var(--foreground)]">
                                {formatPrice(order.amount)}
                              </div>
                            </div>
                          </div>
                        </div>
                      </Link>
                      {canManageOrders ? (
                        <div className="flex justify-end border-t border-[color:var(--border)] bg-white px-4 py-2">
                          <OrderDeleteAction
                            orderId={order.id}
                            orderNumber={order.number}
                            status={order.status}
                          />
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop table — full-width, grouped by date */}
        <div className="hidden sm:block">
          <div className="min-w-full overflow-x-auto">
            {/* Header row */}
            <div className="data-table-header grid grid-cols-[64px_120px_100px_minmax(110px,1fr)_minmax(90px,0.75fr)_minmax(115px,1fr)_minmax(100px,1fr)_minmax(100px,0.8fr)_100px_130px_44px] gap-2 lg:gap-4">
              <span>№</span>
              <span>Дата</span>
              <span>Сумма</span>
              <span className="truncate">Автомобиль</span>
              <span className="truncate">Госномер</span>
              <span className="truncate">Клиент</span>
              <span className="truncate">Исполнители</span>
              <span className="truncate">Оплата</span>
              <span>Статус</span>
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </div>

            {dateGroups.length === 0 ? (
              <div className="px-4 py-6 text-[15px] leading-5 text-[color:var(--muted)]">
                Заказов пока нет.
              </div>
            ) : null}

            {dateGroups.map((group) => (
              <div key={group.dateKey} className="mb-6 last:mb-0">
                {/* Date group separator — premium header */}
                <div className="sticky top-[48px] z-10 border-y border-[color:var(--border)] bg-[color:var(--background)] px-5 py-2 text-[13px] font-bold uppercase tracking-wider text-[color:var(--muted)]/80 shadow-sm sm:px-6">
                  {group.label}
                </div>
                <div className="divide-y divide-[color:var(--border)] bg-white">
                  {group.orders.map((order) => {
                    const isDraft = order.status === "Черновик";
                    const isInProgress = order.status === "В работе";
                    const isAwaitingPayment = order.status === "Ожидает оплаты";
                    const opensEditor = isDraft || isInProgress || isAwaitingPayment;

                    const { date, time } = formatDateTwoLines(order.dateTime);
                    return (
                      <div
                        key={order.id}
                        className="data-table-row grid grid-cols-[64px_120px_100px_minmax(110px,1fr)_minmax(90px,0.75fr)_minmax(115px,1fr)_minmax(100px,1fr)_minmax(100px,0.8fr)_100px_130px_44px] items-center gap-2 text-[14px] leading-5 text-[color:var(--foreground)] lg:gap-4"
                      >
                        <Link
                          href={opensEditor ? `/orders?id=${order.id}` : `/orders/view/${order.id}`}
                          className="contents"
                          title="Открыть / редактировать"
                          aria-label="Открыть / редактировать"
                        >
                          <span className="font-semibold">{order.number}</span>
                          {/* Дата — 2 строки */}
                          <span>
                            <span className="block truncate font-medium">{date}</span>
                            {time ? <span className="cell-secondary block">{time}</span> : null}
                          </span>
                          <span className="text-[15px] font-bold text-[color:var(--foreground)]">{formatPrice(order.amount)}</span>
                          {/* Авто */}
                          <span className="truncate pr-3 text-[13px] text-[color:var(--muted)]">{order.car}</span>
                          <span className="truncate pr-3 text-[13px] text-[color:var(--muted)]">{order.plateNumber || "Не указан"}</span>
                          {/* Клиент — выделен как основной */}
                          <span className="truncate pr-3 text-[14px] font-medium text-[color:var(--foreground)]">{order.client}</span>
                          {/* Исполнители */}
                          <span className="min-w-0 pr-3 text-[13px] leading-4 text-[color:var(--muted)]">
                            <span className="block truncate">{order.executorLabel || "—"}</span>
                          </span>
                          {/* Оплата */}
                          <span className="min-w-0 pr-3 text-[13px] leading-4 text-[color:var(--muted)]">
                            <span className="block truncate">{order.paymentLabel || "—"}</span>
                            {order.paymentAccountLabel ? (
                              <span className="mt-0.5 block truncate text-[12px] text-[color:var(--muted)]/80">
                                {order.paymentAccountLabel}
                              </span>
                            ) : null}
                          </span>
                          {/* Статус — цветной текст без заливки */}
                          <span className={`${getOrderStatusTextClass(order.status)} font-medium`}>{order.status}</span>
                          {/* Действие */}
                          <span className="flex items-center gap-1.5 text-[13px] font-medium transition-colors">
                            {opensEditor ? (
                              <span className="inline-flex items-center gap-1 text-[color:var(--primary)] hover:opacity-80">
                                <Pencil className="h-3.5 w-3.5 shrink-0" />
                                <span>Редактировать</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[color:var(--muted)] hover:opacity-80">
                                <Eye className="h-3.5 w-3.5 shrink-0" />
                                <span>Открыть</span>
                              </span>
                            )}
                          </span>
                        </Link>
                        <span className="flex justify-end">
                          {canManageOrders ? (
                            <OrderDeleteAction
                              orderId={order.id}
                              orderNumber={order.number}
                              status={order.status}
                            />
                          ) : null}
                        </span>
                      </div>
                    );

                  })}
                </div>
              </div>
            ))}
          </div>
          <PaginationBar {...pagination} />
        </div>
      </div>
    </section>
  );
}

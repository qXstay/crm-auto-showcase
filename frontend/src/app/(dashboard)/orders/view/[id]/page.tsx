import Link from "next/link";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { formatPrice } from "@/features/pricing/config";
import { OrdersTabs } from "@/features/order-draft/components/orders-tabs";
import { hasServerPermission, requireServerAuthContext } from "@/server/auth/context";
import { getOrderByIdForBranch } from "@/server/repositories/order-read-repository";
import {
  getOrderVisibleStatusLabel,
  isOrderMarkedForDeletion,
} from "@/features/orders/lifecycle";
import { OrderDeleteAction } from "@/features/orders/components/order-delete-action";
import type {
  DemoOrder,
  DemoOrderDetail,
  OrderPersistedPayrollSummary,
} from "@/features/orders/types";
import type {
  Stage22PayrollNotDueReason,
  Stage22PayrollUnsupportedReason,
  Stage22PayrollWarning,
} from "@/features/payroll/stage22-calculator";
import type { Stage22PayrollPreview } from "@/features/payroll/stage22-preview";
import { formatPlateForDisplay } from "@/features/clients/client-contract";

const detailLabelClassName = "pt-0.5 text-[12px] leading-4 text-[color:var(--muted)]";
const detailValueClassName =
  "min-w-0 break-words text-[14px] leading-5 text-[color:var(--foreground)]";

type OrderViewModel = DemoOrderDetail & {
  carName: string;
  plateNumber: string;
  clientInn: string;
  paymentMeta: string;
  paymentAccountMeta: string;
  paymentStatus: "Оплачен" | "Не оплачено";
  paymentMethodComment: string;
  paymentGeneralComment: string;
  paymentInternalComment: string;
  modifierLabel: string;
  recommendationText: string;
  lines: Array<{
    key: string;
    serviceName: string;
    amount: number;
    usesCostPrice: boolean;
    costPrice: number | null;
    salaryAccrualAmount: number | null;
  }>;
};

export const dynamic = "force-dynamic";
const PAYMENT_METHOD_NOTE_PREFIX = "Комментарий к оплате:";
const GENERIC_PAYMENT_NOTE_PREFIX = "Общий комментарий:";

function formatAccrualValue(value: number | null) {
  return value === null ? formatPrice(0) : formatPrice(value);
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function buildVisibleLineAccruals(order: DemoOrder, persistedPayroll: OrderPersistedPayrollSummary | null | undefined) {
  if (!persistedPayroll || order.lines.length === 0) {
    return order.lines.map((line) => line.salaryAccrualSnapshot?.amount ?? null);
  }

  const lineAmounts = order.lines.map((line) => line.unitPrice * line.quantity);
  const grossTotal = lineAmounts.reduce((sum, amount) => sum + amount, 0);

  if (grossTotal <= 0 || persistedPayroll.payoutAmount <= 0) {
    return order.lines.map(() => null);
  }

  let allocated = 0;

  return lineAmounts.map((amount, index) => {
    if (index === lineAmounts.length - 1) {
      return roundMoney(persistedPayroll.payoutAmount - allocated);
    }

    const lineAccrual = roundMoney((persistedPayroll.payoutAmount * amount) / grossTotal);
    allocated = roundMoney(allocated + lineAccrual);

    return lineAccrual;
  });
}

function formatStage22Percent(value: number | null) {
  return value === null ? "по весам" : `${value.toLocaleString("ru-RU")}%`;
}

function formatCostPriceValue(value: number | null) {
  return value === null || value <= 0 ? "Не указана закупочная цена" : formatPrice(value);
}

function getSkillLevelLabel(value: string | null) {
  switch (value) {
    case "level_1":
      return "Мастер";
    case "level_2":
      return "Старший мастер";
    case "level_3":
      return "Ведущий мастер";
    default:
      return "Мастер";
  }
}

function getNotDueReasonLabel(reason: Stage22PayrollNotDueReason) {
  switch (reason) {
    case "unpaid":
      return "Начисление появится после оплаты заказа.";
    case "no_remaining_paid_base":
      return "Сумма к выплате обновится после следующей оплаты.";
    default:
      return "Сумма к выплате появится после следующей оплаты.";
  }
}

function getPersistedPayrollReasonLabel(
  persistedPayroll: OrderPersistedPayrollSummary | null | undefined,
) {
  if (!persistedPayroll || persistedPayroll.payouts.length > 0) {
    return null;
  }

  if (persistedPayroll.status === "not_due") {
    return "Зарплата будет рассчитана после оплаты.";
  }

  return "Сумма к выплате появится после завершения расчёта.";
}

function getUnsupportedReasonLabel(reason: Stage22PayrollUnsupportedReason) {
  switch (reason) {
    case "empty_order":
      return "В заказе пока нет данных для выплаты.";
    case "missing_salary_rule":
      return "Сумма к выплате появится после завершения расчёта.";
    case "unsupported_rule":
      return "Сумма к выплате появится после завершения расчёта.";
    case "missing_profit_cost_price":
      return "Сумма к выплате появится после завершения расчёта.";
    case "missing_executor_input":
      return "Сумма к выплате появится после выбора исполнителя.";
    case "duplicate_executor_input":
      return "Сумма к выплате появится после обновления данных заказа.";
    case "missing_executor_skill_level":
      return "Сумма к выплате появится после завершения расчёта.";
    case "missing_matrix_row":
      return "Сумма к выплате появится после завершения расчёта.";
    case "missing_four_plus_fund_percent":
      return "Сумма к выплате появится после завершения расчёта.";
    case "unsupported_multi_executor_rule":
      return "Сумма к выплате появится после завершения расчёта.";
    default:
      return "Сумма к выплате появится после завершения расчёта.";
  }
}

function getWarningLabel(warning: Stage22PayrollWarning) {
  switch (warning.code) {
    case "legacy_executor_without_order_executor_id":
      return "Данные по исполнителю обновляются.";
    case "executor_not_in_shift":
      return "Состав смены обновляется.";
    case "attendance_timestamps_ignored":
      return "Данные по смене обновляются.";
    default:
      return "Данные по выплате обновляются.";
  }
}

function getSummaryPayable(
  preview: Stage22PayrollPreview | undefined,
  persistedPayroll: OrderPersistedPayrollSummary | null | undefined,
) {
  if (persistedPayroll) {
    return formatPrice(persistedPayroll.payoutAmount);
  }

  if (!preview) {
    return formatPrice(0);
  }

  const { result, legacyAccrualTotal } = preview;

  if (result.status === "supported") {
    return formatPrice(result.totalAmount);
  }

  if (result.status === "not_due") {
    return formatPrice(0);
  }

  return legacyAccrualTotal === null ? formatPrice(0) : formatPrice(legacyAccrualTotal);
}

function getSummaryBase(
  preview: Stage22PayrollPreview | undefined,
  persistedPayroll: OrderPersistedPayrollSummary | null | undefined,
) {
  if (persistedPayroll) {
    return formatPrice(persistedPayroll.paidBaseAmount);
  }

  return preview?.result.base ? formatPrice(preview.result.base.remainingPaidBase) : formatPrice(0);
}

function getSummaryExecutors(
  result: Stage22PayrollPreview["result"] | undefined,
  persistedPayroll: OrderPersistedPayrollSummary | null | undefined,
) {
  if (persistedPayroll) {
    const reasonLabel = getPersistedPayrollReasonLabel(persistedPayroll);

    return persistedPayroll.payouts.length > 0
      ? persistedPayroll.payouts
          .map((payout) => `${payout.employeeNameSnapshot}: ${formatPrice(payout.amount)}`)
          .join(", ")
      : (reasonLabel ?? formatPrice(0));
  }

  if (!result) {
    return formatPrice(0);
  }

  if (result.status === "supported" && result.executors.length > 0) {
    return result.executors
      .map((executor) => executor.name || "Исполнитель без имени")
      .join(", ");
  }

  return formatPrice(0);
}

function getPersistedPayrollNote(preview: Stage22PayrollPreview | undefined) {
  if (!preview) {
    return "Показан текущий результат по выплате.";
  }

  const { comparison, legacyAccrualTotal, result } = preview;
  const currentAmount = result.status === "supported" ? formatPrice(result.totalAmount) : null;
  const savedAmount = legacyAccrualTotal === null ? null : formatPrice(legacyAccrualTotal);

  switch (comparison) {
    case "equal":
      return savedAmount
        ? `Текущая сумма к выплате: ${savedAmount}.`
        : "Показана актуальная сумма к выплате.";
    case "differs":
      return savedAmount && currentAmount
        ? `Текущая сумма к выплате: ${currentAmount}.`
        : "Показана актуальная сумма к выплате.";
    case "legacy_missing":
      return currentAmount
        ? `Текущая сумма к выплате: ${currentAmount}.`
        : "Сумма к выплате обновляется.";
    case "not_due":
      return "Сумма к выплате появится после оплаты заказа.";
    case "stage22_unsupported":
      return savedAmount
        ? `Текущая сумма к выплате: ${savedAmount}.`
        : "Сумма к выплате обновляется.";
    default:
      return "Показан актуальный результат по выплате.";
  }
}

function getPersistedPayrollResultNote() {
  return "Показаны актуальные выплаты по заказу.";
}

function formatOrderModifierLabel(order: Pick<DemoOrder, "lowProfile" | "runflat">) {
  const labels = [
    order.lowProfile ? "Низкий профиль" : null,
    order.runflat ? "RunFlat" : null,
  ].filter(Boolean);

  return labels.join(" · ") || "Стандарт";
}

function splitPaymentNote(note: string | null | undefined) {
  const value = (note ?? "").trim();

  if (!value) {
    return {
      paymentMethodComment: "",
      paymentGeneralComment: "",
    };
  }

  const lines = value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  let paymentMethodComment = "";
  let paymentGeneralComment = "";

  for (const line of lines) {
    if (line.startsWith(PAYMENT_METHOD_NOTE_PREFIX)) {
      paymentMethodComment = line.slice(PAYMENT_METHOD_NOTE_PREFIX.length).trim();
      continue;
    }

    if (line.startsWith(GENERIC_PAYMENT_NOTE_PREFIX)) {
      paymentGeneralComment = line.slice(GENERIC_PAYMENT_NOTE_PREFIX.length).trim();
      continue;
    }
  }

  if (!paymentMethodComment && !paymentGeneralComment) {
    paymentGeneralComment = value;
  }

  return {
    paymentMethodComment,
    paymentGeneralComment,
  };
}

function getOrderStatusClassName(status: OrderViewModel["status"]) {
  switch (status) {
    case "Оплачен":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Выполнен":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Ожидает оплаты":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "Пометить на удаление":
      return "border-[color:var(--border)] bg-[color:var(--background)] text-[color:var(--muted)]";
    default:
      return "border-[color:var(--border)] bg-white text-[color:var(--foreground)]";
  }
}

function PayrollPreviewBlock({
  preview,
  persistedPayroll,
}: {
  preview: Stage22PayrollPreview | undefined;
  persistedPayroll: OrderPersistedPayrollSummary | null | undefined;
}) {
  if (!preview && !persistedPayroll) {
    return null;
  }

  const result = preview?.result;
  const base = result?.base;
  const warnings = result?.warnings ?? [];
  const summaryPayable = getSummaryPayable(preview, persistedPayroll);
  const summaryBase = getSummaryBase(preview, persistedPayroll);
  const summaryExecutors = getSummaryExecutors(result, persistedPayroll);
  const persistedPayrollNote = persistedPayroll
    ? getPersistedPayrollResultNote()
    : getPersistedPayrollNote(preview);
  const persistedPayrollReasonLabel = getPersistedPayrollReasonLabel(persistedPayroll);

  return (
    <div className="border-t border-[color:var(--border)] bg-white px-4 py-4">
      <details className="group rounded-md border border-[color:var(--border)] bg-white">
        <summary className="cursor-pointer list-none px-3.5 py-3 marker:hidden [&::-webkit-details-marker]:hidden">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-[14px] font-bold leading-5 text-[color:var(--foreground)]">
                Расчёт зарплаты
              </h3>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] leading-5">
                <span>
                  <span className="text-[color:var(--muted)]">К выплате:</span>{" "}
                  <span className="font-semibold text-blue-600">{summaryPayable}</span>
                </span>
                <span>
                  <span className="text-[color:var(--muted)]">Сумма заказа:</span>{" "}
                  <span className="font-semibold text-[color:var(--foreground)]">
                    {summaryBase}
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="text-[color:var(--muted)]">Исполнители:</span>{" "}
                  <span className="font-semibold text-[color:var(--foreground)]">
                    {summaryExecutors}
                  </span>
                </span>
              </div>
            </div>
            <span className="shrink-0 text-[12px] font-medium leading-5 text-[color:var(--primary)]">
              Детализация
            </span>
          </div>
        </summary>

        <div className="space-y-3 border-t border-[color:var(--border)] px-3.5 py-3">
          {persistedPayroll ? (
            <div className="space-y-3">
              <div className="grid gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-[13px] leading-5 text-[color:var(--foreground)] sm:grid-cols-2">
                <div>
                  <span className="text-[color:var(--muted)]">Оплаченная база:</span>{" "}
                  <span className="font-semibold">{formatPrice(persistedPayroll.paidBaseAmount)}</span>
                </div>
                <div>
                  <span className="text-[color:var(--muted)]">Фонд зарплаты:</span>{" "}
                  <span className="font-semibold">{formatPrice(persistedPayroll.salaryFundAmount)}</span>
                </div>
                <div>
                  <span className="text-[color:var(--muted)]">К выплате:</span>{" "}
                  <span className="font-semibold text-blue-600">
                    {formatPrice(persistedPayroll.payoutAmount)}
                  </span>
                </div>
                <div>
                  <span className="text-[color:var(--muted)]">Начисления:</span>{" "}
                  <span className="font-semibold">{persistedPayroll.accrualCount}</span>
                </div>
              </div>

              {persistedPayroll.payouts.length > 0 ? (
                <div className="divide-y divide-[color:var(--border)] border border-[color:var(--border)] bg-white">
                  {persistedPayroll.payouts.map((payout) => (
                    <div
                      key={`${payout.employeeId ?? payout.employeeNameSnapshot}-${payout.skillLevelSnapshot ?? "none"}`}
                      className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_132px]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold leading-5 text-[color:var(--foreground)]">
                          {payout.employeeNameSnapshot}
                        </div>
                        <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                          {getSkillLevelLabel(payout.skillLevelSnapshot)}
                        </div>
                      </div>
                      <div className="text-[14px] font-semibold leading-5 text-blue-600 sm:text-right">
                        {formatPrice(payout.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : persistedPayrollReasonLabel ? (
                <div className="border border-amber-200 bg-amber-50 px-3 py-3 text-[13px] leading-5 text-amber-900">
                  {persistedPayrollReasonLabel}
                </div>
              ) : null}

            </div>
          ) : null}

          {!persistedPayroll && base ? (
            <div className="grid gap-2 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-[13px] leading-5 text-[color:var(--foreground)] sm:grid-cols-2">
              <div>
                <span className="text-[color:var(--muted)]">Сумма после скидки:</span>{" "}
                <span className="font-semibold">{formatPrice(base.discountedTotal)}</span>
              </div>
              <div>
                <span className="text-[color:var(--muted)]">Оплачено:</span>{" "}
                <span className="font-semibold">{formatPrice(base.paidTotal)}</span>
              </div>
              <div>
                <span className="text-[color:var(--muted)]">База для начисления:</span>{" "}
                <span className="font-semibold">{formatPrice(base.remainingPaidBase)}</span>
              </div>
              <div>
                <span className="text-[color:var(--muted)]">Уже учтено ранее:</span>{" "}
                <span className="font-semibold">{formatPrice(base.alreadyAccruedPaidBase)}</span>
              </div>
            </div>
          ) : null}

          {!persistedPayroll && result?.status === "supported" ? (
            <div className="space-y-3">
              {result.executors.length > 0 ? (
                <div className="divide-y divide-[color:var(--border)] border border-[color:var(--border)] bg-white">
                  {result.executors.map((executor) => (
                    <div
                      key={executor.orderExecutorId ?? executor.employeeId}
                      className="grid gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_132px]"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold leading-5 text-[color:var(--foreground)]">
                          {executor.name || "Исполнитель без имени"}
                        </div>
                        <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                          {getSkillLevelLabel(executor.skillLevel)} · доля{" "}
                          {formatStage22Percent(executor.sharePercent)}
                        </div>
                      </div>
                      <div className="text-[14px] font-semibold leading-5 text-blue-600 sm:text-right">
                        {formatPrice(executor.amount)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {!persistedPayroll && result?.status === "not_due" ? (
            <div className="border border-[color:var(--border)] bg-white px-3 py-3 text-[13px] leading-5 text-[color:var(--foreground)]">
              {getNotDueReasonLabel(result.reason)}
            </div>
          ) : null}

          {!persistedPayroll && result?.status === "unsupported" ? (
            <div className="border border-amber-200 bg-amber-50 px-3 py-3">
              <div className="text-[13px] font-semibold leading-5 text-amber-900">
                Сумма к выплате обновляется.
              </div>
              <div className="mt-1 text-[12px] leading-5 text-amber-800">
                {getUnsupportedReasonLabel(result.reason)}
              </div>
            </div>
          ) : null}

          <div className="border border-[color:var(--border)] bg-white px-3 py-2 text-[13px] leading-5 text-[color:var(--muted)]">
            {persistedPayrollNote}
          </div>

          {warnings.length > 0 ? (
            <div className="space-y-1.5">
              {warnings.map((warning, index) => (
                <div
                  key={`${warning.code}-${warning.employeeId ?? "none"}-${index}`}
                  className="text-[12px] leading-5 text-[color:var(--muted)]"
                >
                  {getWarningLabel(warning)}
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </details>
    </div>
  );
}

function buildBackendOrderDetail(order: DemoOrder, detail: DemoOrderDetail): OrderViewModel {
  const carName = [order.client.carBrand, order.client.carModel]
    .filter(Boolean)
    .join(" ")
    .trim();
  const paymentNote = splitPaymentNote(order.payment.note);
  const visibleLineAccruals = buildVisibleLineAccruals(order, detail.persistedPayroll);

  return {
    ...detail,
    clientInn:
      order.client.clientKind === "legal" && order.client.inn?.trim()
        ? order.client.inn.trim()
        : "",
    paymentMeta: detail.paymentLabel,
    paymentAccountMeta: detail.paymentAccountLabel ?? "",
    paymentStatus:
      detail.paymentStatus ??
      (detail.paymentLabel === "Не оплачено" ? "Не оплачено" : "Оплачен"),
    paymentMethodComment: paymentNote.paymentMethodComment,
    paymentGeneralComment: paymentNote.paymentGeneralComment,
    paymentInternalComment: order.payment.internalComment?.trim() ?? "",
    carName: carName || "Не указан",
    plateNumber: formatPlateForDisplay(order.client.plateNumber) || "Не указан",
    modifierLabel: formatOrderModifierLabel(order),
    recommendationText: order.note.trim(),
    lines: order.lines.map((line, index) => ({
      key: line.key,
      serviceName: line.serviceNameSnapshot,
      amount: line.unitPrice * line.quantity,
      usesCostPrice:
        line.salaryRuleSnapshot?.ruleType === "percent_of_profit" &&
        line.salaryRuleSnapshot.usesCostPrice === true,
      costPrice: line.costPrice,
      salaryAccrualAmount: visibleLineAccruals[index] ?? null,
    })),
  };
}

export default async function OrderViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireServerAuthContext();

  if (!hasServerPermission(auth, "order.view")) {
    return null;
  }

  const { id } = await params;
  const orderRecord = await getOrderByIdForBranch(auth.currentBranch.id, id);

  if (
    orderRecord?.order.status === "Черновик" ||
    orderRecord?.order.status === "В работе" ||
    orderRecord?.order.status === "Ожидает оплаты"
  ) {
    redirect(`/orders?id=${orderRecord.order.id}`);
  }

  const order = orderRecord
    ? buildBackendOrderDetail(orderRecord.order, orderRecord.detail)
    : null;
  const isMarkedForDeletion = order ? isOrderMarkedForDeletion(order.status) : false;
  const canPrint = order
    ? order.status === "Оплачен" ||
      order.status === "Выполнен" ||
      (isMarkedForDeletion &&
        (order.paymentStatus === "Оплачен" || Boolean(orderRecord?.order.shiftId)))
    : false;
  const canAcceptPayment =
    orderRecord?.order.status === "Выполнен" &&
    orderRecord.order.payment.paymentStatus !== "Оплачен";
  const canManageOrders = hasServerPermission(auth, "order.create");
  const canViewSalary = hasServerPermission(auth, "analytics.view");
  const clientId = orderRecord?.order.client.clientId ?? null;

  if (!order) {
    return (
      <section className="max-w-[820px] pr-4 sm:pr-8">
        <div className="w-full space-y-2.5">
          <div className="border border-[color:var(--border)] bg-white">
            <OrdersTabs activeTab="view" />
          </div>
          <div className="border border-[color:var(--border)] bg-white px-4 py-6 text-[15px] leading-6 text-[color:var(--foreground)]">
            Заказ не найден.
          </div>
        </div>
      </section>
    );
  }

  const payrollSummaryLabel = order.persistedPayroll
    ? formatPrice(order.persistedPayroll.payoutAmount)
    : formatAccrualValue(order.salaryAccrualTotal);
  const hasPayrollSummary = Boolean(order.persistedPayroll) || order.salaryAccrualTotal !== null;

  return (
    <section className="max-w-[820px] pr-4 sm:pr-8">
      <div className="w-full space-y-2.5">
        <div className="border border-[color:var(--border)] bg-white">
          <OrdersTabs activeTab="view" />
        </div>

        <div className="premium-card w-full">
          <div className="flex flex-col gap-2 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-3 bg-white">
            <div className="min-w-0 space-y-1">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--muted)]">
                Заказ №{order.number}
              </div>
              <h1 className="text-[22px] font-bold leading-7 text-[color:var(--foreground)]">
                {order.workSummary || "Детали заказа"}
              </h1>
            </div>
            <div
              className={`inline-flex min-h-[28px] w-fit items-center rounded-full border px-3 text-[12px] font-semibold leading-5 ${getOrderStatusClassName(order.status)}`}
            >
              {getOrderVisibleStatusLabel(order.status)}
            </div>
          </div>

          {isMarkedForDeletion ? (
            <div className="border-t border-[color:var(--border)] bg-[color:var(--background)] px-4 py-3 text-[13px] leading-5 text-[color:var(--muted)]">
              Заказ удалён из списка. История, оплаты, смена и печатные данные сохранены.
            </div>
          ) : null}

          <div className="border-t border-[color:var(--border)] px-4 py-4">
            <div className="space-y-3 sm:hidden">
              <div className="border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-3">
                <div className="text-[12px] leading-4 text-[color:var(--muted)]">Смена</div>
                <div className="mt-1 text-[15px] font-medium leading-5 text-[color:var(--primary)]">
                  {order.shiftLabel}
                </div>
              </div>

              {[
                ["Дата создания", order.createdAt],
                ["Дата завершения", order.completedAt],
                ["Время выполнения", order.durationLabel],
                ["Выполненные работы", order.workSummary],
                ["Автомобиль", order.carName],
                ["Модификаторы", order.modifierLabel],
                ["Госномер", order.plateNumber],
                ["Клиент", order.clientLabel],
                ...(order.clientInn ? [["ИНН", order.clientInn] as const] : []),
                ["Телефон", order.clientPhone || "Не указан"],
                ["Исполнитель", order.executorLabel],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="border border-[color:var(--border)] bg-white px-3 py-2.5"
                >
                  <div className="text-[12px] leading-4 text-[color:var(--muted)]">{label}</div>
                  <div className="mt-1 text-[14px] leading-5 text-[color:var(--foreground)]">
                    {value}
                  </div>
                </div>
              ))}

              {order.recommendationText ? (
                <div className="border border-[color:var(--border)] bg-white px-3 py-3">
                  <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                    Рекомендации клиенту
                  </div>
                  <div className="mt-1.5 whitespace-pre-line text-[14px] leading-5 text-[color:var(--foreground)]">
                    {order.recommendationText}
                  </div>
                </div>
              ) : null}

              <div className="border border-[color:var(--border)] bg-white px-3 py-3">
                <div className="text-[12px] leading-4 text-[color:var(--muted)]">Оплата</div>
                <div className="mt-1 text-[18px] font-semibold leading-6 text-[color:var(--foreground)]">
                  {formatPrice(order.amount)}
                </div>
                <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
                  {order.paymentMeta}
                </div>
                {order.paymentAccountMeta ? (
                  <div className="mt-0.5 text-[12px] leading-4 text-[color:var(--muted)]">
                    Счёт: {order.paymentAccountMeta}
                  </div>
                ) : null}
                {order.paymentMethodComment ? (
                  <div className="mt-1 text-[13px] leading-5 text-[color:var(--foreground)]">
                    <span className="text-[color:var(--muted)]">
                      Комментарий к способу оплаты:
                    </span>{" "}
                    {order.paymentMethodComment}
                  </div>
                ) : null}
                {order.paymentGeneralComment ? (
                  <div className="mt-1 text-[13px] leading-5 text-[color:var(--foreground)]">
                    <span className="text-[color:var(--muted)]">Общий комментарий:</span>{" "}
                    {order.paymentGeneralComment}
                  </div>
                ) : null}
                {order.paymentInternalComment ? (
                  <div className="mt-1 text-[13px] leading-5 text-[color:var(--foreground)]">
                    <span className="text-[color:var(--muted)]">Для нас:</span>{" "}
                    {order.paymentInternalComment}
                  </div>
                ) : null}
              </div>

              <div className="border border-[color:var(--border)] bg-white px-3 py-3">
                <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                  Начисление по заказу
                </div>
                <div
                  className={
                    !hasPayrollSummary
                      ? "mt-1 text-[14px] leading-5 text-[color:var(--muted)]"
                      : "mt-1 text-[15px] font-medium leading-5 text-[color:var(--foreground)]"
                  }
                >
                  {payrollSummaryLabel}
                </div>
              </div>
            </div>

          <div className="border-t border-[color:var(--border)] bg-[color:var(--background)]/30 px-4 py-6">
            <div className="hidden grid-cols-2 gap-x-8 gap-y-6 sm:grid">
              {/* Left Column: Order & Client */}
              <div className="space-y-6">
                <section>
                  <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Основные данные</h3>
                  <div className="space-y-3.5">
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Смена</span>
                      <span className="font-semibold text-[color:var(--primary)]">{order.shiftLabel}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Создан</span>
                      <span className={detailValueClassName}>{order.createdAt}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Завершен</span>
                      <span className={detailValueClassName}>{order.completedAt}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Время в работе</span>
                      <span className={detailValueClassName}>{order.durationLabel}</span>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Клиент</h3>
                  <div className="space-y-3.5">
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Клиент</span>
                      <div className={detailValueClassName}>
                        {clientId && clientId !== "anonymous" ? (
                          <Link href={`/clients/${clientId}`} className="font-semibold text-[color:var(--primary)] hover:underline">
                            {order.clientLabel}
                          </Link>
                        ) : (
                          <span className="font-semibold">Анонимный клиент</span>
                        )}
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Телефон</span>
                      <span className={detailValueClassName}>{order.clientPhone || "Не указан"}</span>
                    </div>
                    {order.clientInn ? (
                      <div className="flex justify-between">
                        <span className={detailLabelClassName}>ИНН</span>
                        <span className={detailValueClassName}>{order.clientInn}</span>
                      </div>
                    ) : null}
                  </div>
                </section>
              </div>

              {/* Right Column: Vehicle & Payment */}
              <div className="space-y-6">
                <section>
                  <h3 className="mb-3 text-[13px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Автомобиль</h3>
                  <div className="space-y-3.5">
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Марка/Модель</span>
                      <span className="font-semibold">{order.carName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Госномер</span>
                      <span className="font-mono text-[13px] font-bold uppercase">{order.plateNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={detailLabelClassName}>Параметры</span>
                      <span className={detailValueClassName}>{order.modifierLabel}</span>
                    </div>
                  </div>
                </section>

                <section className={order.paymentStatus === "Не оплачено" ? "rounded-lg border border-amber-100 bg-amber-50/60 p-4" : "rounded-lg border border-green-100 bg-green-50/50 p-4"}>
                  <h3 className={order.paymentStatus === "Не оплачено" ? "mb-2 text-[13px] font-bold uppercase tracking-wider text-amber-800" : "mb-2 text-[13px] font-bold uppercase tracking-wider text-green-800"}>Оплата</h3>
                  <div className={order.paymentStatus === "Не оплачено" ? "text-[24px] font-bold leading-none text-amber-950" : "text-[24px] font-bold text-green-900 leading-none"}>
                    {formatPrice(order.amount)}
                  </div>
                  <div className={order.paymentStatus === "Не оплачено" ? "mt-2 text-[12px] font-medium text-amber-800" : "mt-2 text-[12px] font-medium text-green-700"}>
                    {order.paymentMeta}
                  </div>
                  {order.paymentAccountMeta ? (
                    <div className={order.paymentStatus === "Не оплачено" ? "mt-1 text-[12px] leading-4 text-amber-800/75" : "mt-1 text-[12px] leading-4 text-green-800/70"}>
                      Счёт: {order.paymentAccountMeta}
                    </div>
                  ) : null}
                  {(order.paymentMethodComment || order.paymentGeneralComment || order.paymentInternalComment) && (
                    <div className="mt-3 border-t border-green-200 pt-3 space-y-1">
                      {order.paymentMethodComment && (
                        <div className="text-[12px] leading-4 text-green-800">
                          <span className="opacity-70">Способ:</span> {order.paymentMethodComment}
                        </div>
                      )}
                      {order.paymentGeneralComment && (
                        <div className="text-[12px] leading-4 text-green-800">
                          <span className="opacity-70">Заметка:</span> {order.paymentGeneralComment}
                        </div>
                      )}
                      {order.paymentInternalComment && (
                        <div className="text-[12px] leading-4 text-green-800">
                          <span className="opacity-70">Для нас:</span> {order.paymentInternalComment}
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>

          {order.lines.length > 0 && canViewSalary ? (
            <div className="border-t border-[color:var(--border)] px-4 py-6 bg-white">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-[13px] font-bold uppercase tracking-wider text-[color:var(--muted)]">Перечень услуг</h3>
                <div className="text-[14px] font-semibold">
                  <span className="text-[color:var(--muted)] mr-2">Зарплата:</span>
                  <span className={!hasPayrollSummary ? "text-[color:var(--muted)]" : "text-blue-600"}>
                    {payrollSummaryLabel}
                  </span>
                </div>
              </div>

              {/* Mobile Services List */}
              <div className="space-y-2.5 sm:hidden">
                {order.lines.map((line) => (
                  <div
                    key={line.key}
                    className="rounded-md border border-[color:var(--border)] bg-white px-3 py-3"
                  >
                    <div className="text-[14px] font-bold leading-5 text-[color:var(--foreground)]">
                      {line.serviceName}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-3 text-[13px] leading-5">
                      <div>
                        <div className="text-[color:var(--muted)]">Сумма</div>
                        <div className="mt-0.5 font-semibold text-[color:var(--foreground)]">
                          {formatPrice(line.amount)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[color:var(--muted)]">Начисление</div>
                        <div
                          className={
                            line.salaryAccrualAmount === null
                              ? "mt-0.5 text-[color:var(--muted)]"
                              : "mt-0.5 font-semibold text-blue-600"
                          }
                        >
                          {formatAccrualValue(line.salaryAccrualAmount)}
                        </div>
                      </div>
                      {line.usesCostPrice ? (
                        <div className="col-span-2">
                          <div className="text-[color:var(--muted)]">Закупочная цена</div>
                          <div className="mt-0.5 text-[color:var(--foreground)]">
                            {formatCostPriceValue(line.costPrice)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Services Table */}
              <div className="hidden overflow-x-auto sm:block">
                <div className="min-w-[560px] overflow-hidden rounded-lg border border-[color:var(--border)]">
                  <div className="data-table-header grid grid-cols-[minmax(0,1fr)_120px_150px_132px] gap-4">
                    <span>Услуга</span>
                    <span className="text-right">Сумма</span>
                    <span className="text-right">Закупочная</span>
                    <span className="text-right">Начисление</span>
                  </div>
                  <div className="divide-y divide-[color:var(--border)]">
                    {order.lines.map((line) => (
                      <div
                        key={line.key}
                        className="data-table-row grid grid-cols-[minmax(0,1fr)_120px_150px_132px] gap-4"
                      >
                        <span className="font-medium">{line.serviceName}</span>
                        <span className="text-right font-semibold">{formatPrice(line.amount)}</span>
                        <span className="text-right text-[color:var(--muted)]">
                          {line.usesCostPrice ? formatCostPriceValue(line.costPrice) : "—"}
                        </span>
                        <span
                          className={
                            line.salaryAccrualAmount === null
                              ? "text-right text-[color:var(--muted)]"
                              : "text-right font-semibold text-blue-600"
                          }
                        >
                          {formatAccrualValue(line.salaryAccrualAmount)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-t border-[color:var(--border)] px-4 py-8 text-center text-[14px] leading-5 text-[color:var(--muted)]">
              Услуги по этому заказу не зафиксированы.
            </div>
          )}

          {canViewSalary ? (
            <PayrollPreviewBlock
              preview={order.payrollPreview}
              persistedPayroll={order.persistedPayroll}
            />
          ) : null}

          <div className="flex flex-col-reverse gap-3 border-t border-[color:var(--border)] bg-[color:var(--background)]/10 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
            <Link
              href="/orders/list"
              className="inline-flex h-10 items-center justify-center rounded-md border border-[color:var(--border)] bg-white px-5 text-[14px] font-semibold text-[color:var(--foreground)] transition-all hover:bg-[color:var(--background)] sm:h-9"
            >
              К списку заказов
            </Link>
            {canManageOrders ? (
              <OrderDeleteAction
                orderId={order.id}
                orderNumber={order.number}
                status={order.status}
                display="button"
                deletedRedirectHref="/orders/list"
              />
            ) : null}
            {canPrint ? (
              <Link
                href={`/print/order/${order.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[color:var(--primary)] px-5 text-[14px] font-semibold leading-9 text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] sm:h-9"
              >
                <Printer className="h-4 w-4" />
                Распечатать чек
              </Link>
            ) : null}
            {canAcceptPayment ? (
              <Link
                href={`/orders?id=${order.id}&action=payment`}
                className="inline-flex h-10 items-center justify-center rounded-md bg-[color:var(--primary)] px-5 text-[14px] font-semibold text-white transition-all hover:opacity-90 sm:h-9"
              >
                Принять оплату
              </Link>
            ) : null}
          </div>
        </div>
        </div>
      </div>
    </section>
  );
}

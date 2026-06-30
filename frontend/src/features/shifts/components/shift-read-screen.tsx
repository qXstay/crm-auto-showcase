"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import clsx from "clsx";
import { Plus, ReceiptText, Users, X } from "lucide-react";
import { apiRequest } from "@/lib/api/client";
import { formatPrice } from "@/features/pricing/config";
import { formatEmployeeSkillLevelLabel } from "@/features/settings-employees/skill-level";
import {
  addShiftExpenseViaApi,
  closeShiftViaApi,
  openShiftViaApi,
  updateShiftStaffViaApi,
} from "@/features/shifts/repository";
import { PEGAS_OPERATIONAL_TIME_ZONE } from "@/shared/operational-time";
import type {
  DemoClosedShiftSnapshot,
  DemoShift22Preview,
  DemoShiftOrderSnapshot,
  DemoShiftSalaryBreakdown,
  DemoShiftStaffMember,
  DemoShiftStaffOption,
  DemoShiftState,
  DemoShiftUiPermissions,
} from "@/features/shifts/types";

type ShiftTabId = "current" | "history" | "log";
type StaffModalMode = "open" | "edit" | null;
type ShiftAttendanceAction = "arrived" | "left";

const SHIFT_TABS: Array<{ id: ShiftTabId; label: string }> = [
  { id: "current", label: "Текущая" },
  { id: "history", label: "История" },
  { id: "log", label: "Лог" },
];

function workStatusBadgeClassName(status: string) {
  switch (status) {
    case "Выполнен":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "В работе":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "Черновик":
      return "border-slate-200 bg-slate-50 text-slate-600";
    default:
      return "border-[color:var(--border)] bg-white text-[color:var(--muted)]";
  }
}

function paymentStatusBadgeClassName(status: string) {
  switch (status) {
    case "Оплачено":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "Не оплачено":
      return "border-amber-200 bg-amber-50 text-amber-700";
    default:
      return "border-[color:var(--border)] bg-white text-[color:var(--muted)]";
  }
}

function ShiftStatusBadge({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 w-fit items-center rounded-full border px-2.5 text-[12px] font-semibold leading-none",
        className,
      )}
    >
      {label}
    </span>
  );
}

function getShiftPaymentMethodTotal(
  orders: DemoShiftOrderSnapshot[],
  method: DemoShiftOrderSnapshot["paymentMethod"],
) {
  return orders.reduce((total, order) => {
    if (!order.isPaid || order.paymentMethod !== method) {
      return total;
    }

    return total + order.paidAmount;
  }, 0);
}

function getShiftCashlessRemainder(
  cashlessRevenue: number,
  orders: DemoShiftOrderSnapshot[],
) {
  const cardRevenue = getShiftPaymentMethodTotal(orders, "card");
  const transferRevenue = getShiftPaymentMethodTotal(orders, "transfer");
  const knownRevenue = cardRevenue + transferRevenue;

  return Math.max(0, cashlessRevenue - knownRevenue);
}

function formatShiftDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
  }).format(new Date(value));
}

function formatShiftAttendanceTime(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
  }).format(date);
}

function formatAmountInput(value: string) {
  return value.replace(/[^\d.,]/g, "").replace(",", ".");
}

function parseAmountInput(value: string) {
  const parsed = Number(formatAmountInput(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatShiftSalaryValue(value: number | null | undefined) {
  return value === null || value === undefined ? formatPrice(0) : formatPrice(value);
}


function getDefaultStaffSelection(staffOptions: DemoShiftStaffOption[], currentEmployeeId: string) {
  if (currentEmployeeId !== "employee-razin" && staffOptions.some((option) => option.id === currentEmployeeId)) {
    return [currentEmployeeId];
  }

  const firstNonOwner = staffOptions.find((option) => option.id !== "employee-razin");
  return firstNonOwner ? [firstNonOwner.id] : [];
}

function formatShiftStaffMeta(option: DemoShiftStaffOption) {
  return formatEmployeeSkillLevelLabel(option.skillLevel);
}

function getShiftStaffAttendanceLabel(member: DemoShiftStaffMember) {
  if (!member.arrivedAt) {
    return `Пришёл ${formatShiftAttendanceTime(member.arrivedAt)}`;
  }

  if (!member.leftAt) {
    return `Пришёл ${formatShiftAttendanceTime(member.arrivedAt)}`;
  }

  return `Ушёл ${formatShiftAttendanceTime(member.leftAt)}`;
}

function getShiftStaffAttendanceCheckboxHint(member: DemoShiftStaffMember) {
  if (member.leftAt) {
    return "Сотрудник уже был отмечен как ушедший в этой смене. Повторный приход пока не поддерживается.";
  }

  if (member.arrivedAt) {
    return "Галочка стоит, сотрудник сейчас в смене.";
  }

  return "Поставьте галочку, чтобы отметить приход.";
}

async function markShiftStaffAttendanceViaApi(
  shiftId: string,
  input: { employeeId?: string; shiftStaffId?: string; action: ShiftAttendanceAction },
) {
  return apiRequest<{ currentShift: DemoShiftState["currentShift"] }>(
    `/api/shifts/${shiftId}/staff/attendance`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

function ShiftModal({
  title,
  children,
  onClose,
  actions,
  maxWidthClassName = "max-w-[420px]",
  bodyClassName,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  actions: React.ReactNode;
  maxWidthClassName?: string;
  bodyClassName?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/25 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          "max-h-[calc(100vh-2rem)] w-full overflow-hidden rounded-[6px] border border-[color:var(--border)] bg-white shadow-lg",
          maxWidthClassName,
        )}
      >
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-2.5">
          <h2 className="text-[15px] font-semibold text-[color:var(--foreground)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center text-[color:var(--muted)]"
            aria-label="Закрыть окно"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className={clsx(
            "space-y-3 overflow-y-auto px-4 py-4 text-sm text-[color:var(--foreground)]",
            bodyClassName,
          )}
        >
          {children}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[color:var(--border)] px-4 py-3 sm:flex-row sm:items-center sm:justify-end">
          {actions}
        </div>
      </div>
    </div>
  );
}

function getShiftStaffShortLabel(
  staff: NonNullable<DemoShiftState["currentShift"]>["staff"],
  fallbackLabel: string,
) {
  const names = staff
    .map((member) => member.employeeNameSnapshot.trim())
    .filter(Boolean);

  if (names.length === 0) {
    return fallbackLabel || "Состав не выбран";
  }

  const visibleNames = names.slice(0, 3).join(", ");
  const hiddenCount = names.length - 3;

  return hiddenCount > 0 ? `${visibleNames} +${hiddenCount}` : visibleNames;
}

function ShiftSummaryAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-[22px] shrink-0 items-center gap-1 border border-[#d9d2ff] bg-white/85 px-1.5 text-[12px] font-medium text-[color:var(--primary)] transition-colors hover:bg-[#f4f1ff] disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-[color:var(--muted)]"
    >
      {icon}
      {label}
    </button>
  );
}

function ShiftSummaryCard({
  label,
  value,
  children,
  tone = "default",
  action,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
  tone?: "default" | "cash" | "warning" | "success";
  action?: React.ReactNode;
}) {
  return (
    <div
      className={clsx(
        "flex min-h-[72px] min-w-0 flex-col border border-[#ded8ff] bg-[#fbfaff] px-2.5 py-1.5",
        tone === "cash" && "border-[#d8d0ff] bg-[#faf8ff]",
        tone === "warning" && "border-[#e1d9ff] bg-[#fbfaff]",
        tone === "success" && "border-[#d9d2ff] bg-[#fbfaff]",
      )}
    >
      <div className="flex min-w-0 items-start justify-between gap-1.5">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase leading-4 text-[color:var(--muted)]">
            {label}
          </div>
          <div className="text-[16px] font-semibold leading-5 text-[color:var(--foreground)] tabular-nums">
            {value}
          </div>
        </div>
        {action}
      </div>
      {children ? <div className="mt-1 min-w-0 flex-1">{children}</div> : null}
    </div>
  );
}

function ShiftSummaryRow({
  rows,
}: {
  rows: Array<{ label: string; value: React.ReactNode; tone?: "default" | "warning" }>;
}) {
  return (
    <div className="space-y-1.5 text-[12px] leading-4">
      {rows.map((row) => (
        <div key={row.label} className="flex min-w-0 items-baseline justify-between gap-3">
          <span className="min-w-0 truncate text-[color:var(--muted)]">{row.label}</span>
          <span
            className={clsx(
              "shrink-0 whitespace-nowrap text-right font-medium tabular-nums text-[color:var(--foreground)]",
              row.tone === "warning" && "text-amber-700",
            )}
          >
            {row.value}
          </span>
        </div>
      ))}
    </div>
  );
}

function ShiftCurrentSummary({
  currentShift,
  permissions,
  onExpenseOpen,
  onStaffOpen,
  onCashDetailsOpen,
  onSalaryDetailsOpen,
}: {
  currentShift: NonNullable<DemoShiftState["currentShift"]>;
  permissions: DemoShiftUiPermissions;
  onExpenseOpen: () => void;
  onStaffOpen: () => void;
  onCashDetailsOpen: () => void;
  onSalaryDetailsOpen: () => void;
}) {
  const staffShortLabel = getShiftStaffShortLabel(currentShift.staff, currentShift.staffLabel);

  return (
    <div className="grid grid-cols-1 gap-1.5 md:grid-cols-2 lg:grid-cols-4">
      <ShiftSummaryCard
        label="В кассе"
        value={formatPrice(currentShift.revenue)}
        tone="cash"
        action={
          <ShiftSummaryAction
            label="Подробнее"
            icon={<ReceiptText className="h-3.5 w-3.5" />}
            onClick={onCashDetailsOpen}
          />
        }
      >
        <div className="text-[11px] leading-4 text-[color:var(--muted)]">
          Оплачено {currentShift.paidOrdersCount} из {currentShift.ordersCount} заказов.
        </div>
      </ShiftSummaryCard>

      <ShiftSummaryCard
        label="На смене"
        value={`${currentShift.staff.length} чел.`}
        action={
          permissions.canManageCurrentShift ? (
            <ShiftSummaryAction
              label="Состав"
              icon={<Users className="h-3.5 w-3.5" />}
              onClick={onStaffOpen}
            />
          ) : undefined
        }
      >
        <div className="text-[12px] leading-4 text-[color:var(--foreground)]">
          <div className="truncate">{staffShortLabel}</div>
          <div className="text-[11px] text-[color:var(--muted)]">
            {currentShift.ordersCount} заказов в смене
          </div>
        </div>
      </ShiftSummaryCard>

      <ShiftSummaryCard
        label="Расходы"
        value={formatPrice(currentShift.expenses)}
        action={
          permissions.canManageCurrentShift ? (
            <ShiftSummaryAction
              label="Добавить"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={onExpenseOpen}
            />
          ) : undefined
        }
      >
        <div className="text-[11px] leading-4 text-[color:var(--muted)]">
          {currentShift.expensesItems.length > 0
            ? `${currentShift.expensesItems.length} записей расходов`
            : "Расходов по смене нет"}
        </div>
      </ShiftSummaryCard>

      <ShiftSummaryCard
        label="К выплате сотрудникам"
        value={formatShiftSalaryValue(currentShift.salaryAccrualTotal)}
        tone={currentShift.salaryAccrualTotal ? "success" : "default"}
        action={
          <ShiftSummaryAction
            label="Подробнее"
            icon={<ReceiptText className="h-3.5 w-3.5" />}
            onClick={onSalaryDetailsOpen}
          />
        }
      >
        <div className="text-[11px] leading-4 text-[color:var(--muted)]">
          Детали по сотрудникам отдельно.
        </div>
      </ShiftSummaryCard>
    </div>
  );
}

function getClosedShiftSalaryBreakdown(shift: DemoClosedShiftSnapshot): DemoShiftSalaryBreakdown {
  return (
    shift.salaryBreakdown ?? {
      status: "unsupported",
      reasonLabel: "По этой смене пока нет расчёта к выплате.",
      members: [],
    }
  );
}

function CashBreakdownContent({
  currentShift,
}: {
  currentShift: NonNullable<DemoShiftState["currentShift"]>;
}) {
  const cardRevenue = getShiftPaymentMethodTotal(currentShift.orders, "card");
  const transferRevenue = getShiftPaymentMethodTotal(currentShift.orders, "transfer");
  const otherCashlessRevenue = getShiftCashlessRemainder(
    currentShift.cashlessRevenue,
    currentShift.orders,
  );

  return (
    <div className="space-y-3">
      <div className="border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5">
        <div className="text-[12px] font-medium uppercase leading-4 tracking-[0.02em] text-[color:var(--muted)]">
          Итого в кассе
        </div>
        <div className="mt-1 text-[20px] font-semibold leading-6 tabular-nums text-[color:var(--foreground)]">
          {formatPrice(currentShift.revenue)}
        </div>
        <div className="mt-1 text-[12px] leading-4 text-[color:var(--muted)]">
          Оплачено {currentShift.paidOrdersCount} из {currentShift.ordersCount} заказов.
        </div>
      </div>

      <div className="border border-[color:var(--border)] bg-white px-3 py-2.5">
        <ShiftSummaryRow
          rows={[
            { label: "Наличные", value: formatPrice(currentShift.cashRevenue) },
            { label: "Безнал", value: formatPrice(cardRevenue) },
            { label: "Перевод", value: formatPrice(transferRevenue) },
            { label: "Прочие оплаты", value: formatPrice(otherCashlessRevenue) },
            {
              label: "Без оплаты",
              value: `${currentShift.completedUnpaidCount} / ${formatPrice(currentShift.completedUnpaidTotal)}`,
              tone: currentShift.completedUnpaidCount > 0 ? "warning" : "default",
            },
          ]}
        />
      </div>
    </div>
  );
}

function ShiftHistoryMoneyCell({
  value,
  note,
  tone = "default",
}: {
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "default" | "muted" | "warning";
}) {
  return (
    <div className="min-w-0 text-right">
      <div
        className={clsx(
          "whitespace-nowrap text-[14px] font-semibold leading-5 tabular-nums text-[color:var(--foreground)]",
          tone === "muted" && "font-medium text-[color:var(--muted)]",
          tone === "warning" && "text-amber-700",
        )}
      >
        {value}
      </div>
      {note ? (
        <div className="mt-0.5 truncate text-[12px] leading-4 text-[color:var(--muted)]">
          {note}
        </div>
      ) : null}
    </div>
  );
}

function ShiftHistoryDetailsButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-8 items-center justify-center gap-1.5 border border-[color:var(--primary)]/25 bg-white px-2.5 text-[12px] font-semibold text-[color:var(--primary)] transition-colors hover:bg-[color:var(--primary)]/5"
    >
      <ReceiptText className="h-3.5 w-3.5" />
      Подробнее
    </button>
  );
}

function ShiftHistoryMobileMetric({
  label,
  value,
  note,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  note?: React.ReactNode;
  tone?: "default" | "muted" | "warning";
}) {
  return (
    <div className="border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2">
      <div className="text-[12px] leading-4 text-[color:var(--muted)]">{label}</div>
      <div
        className={clsx(
          "mt-1 whitespace-nowrap text-[15px] font-semibold leading-5 tabular-nums text-[color:var(--foreground)]",
          tone === "muted" && "font-medium text-[color:var(--muted)]",
          tone === "warning" && "text-amber-700",
        )}
      >
        {value}
      </div>
      {note ? (
        <div className="mt-0.5 truncate text-[12px] leading-4 text-[color:var(--muted)]">
          {note}
        </div>
      ) : null}
    </div>
  );
}

function ShiftHistoryList({
  history,
  onSalaryDetailsOpen,
}: {
  history: DemoClosedShiftSnapshot[];
  onSalaryDetailsOpen: (shift: DemoClosedShiftSnapshot) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="border border-[color:var(--border)] bg-white px-3.5 py-5 text-[15px] text-[color:var(--muted)]">
        Закрытых смен пока нет.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[96px_minmax(150px,1fr)_minmax(104px,0.64fr)_minmax(104px,0.64fr)_minmax(82px,0.45fr)_minmax(122px,0.68fr)_minmax(188px,1fr)_92px] gap-x-3 border border-[color:var(--border)] bg-white px-3.5 py-2.5 text-[12px] font-medium leading-4 text-[color:var(--muted)] xl:grid">
        <span>Смена</span>
        <span>Период</span>
        <span className="text-right">В кассе</span>
        <span className="text-right">Без оплаты</span>
        <span className="text-right">Расходы</span>
        <span className="text-right">К выплате</span>
        <span className="border-l border-[color:var(--border)] pl-3">На смене</span>
        <span className="text-right">Действие</span>
      </div>

      <div className="space-y-2">
        {history.map((shift) => {
          const staffShortLabel = getShiftStaffShortLabel(shift.staff, shift.staffLabel);

          return (
            <div
              key={shift.id}
              className="border border-[color:var(--border)] bg-white text-[14px] leading-5 text-[color:var(--foreground)]"
            >
              <div className="hidden grid-cols-[96px_minmax(150px,1fr)_minmax(104px,0.64fr)_minmax(104px,0.64fr)_minmax(82px,0.45fr)_minmax(122px,0.68fr)_minmax(188px,1fr)_92px] items-start gap-x-3 px-3.5 py-3 xl:grid">
                <div className="min-w-0">
                  <div className="truncate font-semibold">Смена №{shift.number}</div>
                  <div className="mt-0.5 text-[12px] text-[color:var(--muted)]">закрыта</div>
                </div>

                <div className="min-w-0 text-[12px] leading-5 text-[color:var(--muted)]">
                  <div className="truncate">Открыта {formatShiftDateTime(shift.openedAt)}</div>
                  <div className="truncate">Закрыта {formatShiftDateTime(shift.closedAt)}</div>
                </div>

                <ShiftHistoryMoneyCell
                  value={formatPrice(shift.revenue)}
                  note={`${shift.paidOrdersCount} оплачено из ${shift.ordersCount}`}
                />
                <ShiftHistoryMoneyCell
                  value={formatPrice(shift.completedUnpaidTotal)}
                  note={`${shift.completedUnpaidCount} заказов`}
                  tone={shift.completedUnpaidCount > 0 ? "warning" : "muted"}
                />
                <ShiftHistoryMoneyCell
                  value={formatPrice(shift.expenses)}
                  tone={shift.expenses > 0 ? "default" : "muted"}
                />
                <ShiftHistoryMoneyCell
                  value={formatShiftSalaryValue(shift.salaryAccrualTotal)}
                  tone={shift.salaryAccrualTotal ? "default" : "muted"}
                />

                <div className="min-w-0 border-l border-[color:var(--border)] pl-3 text-[13px] leading-5 text-[color:var(--muted)]">
                  <div className="truncate text-[color:var(--foreground)]">
                    {shift.staff.length} чел.
                  </div>
                  <div className="truncate">{staffShortLabel}</div>
                </div>

                <div className="flex justify-end">
                  <ShiftHistoryDetailsButton onClick={() => onSalaryDetailsOpen(shift)} />
                </div>
              </div>

              <div className="px-3.5 py-3.5 xl:hidden">
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border)] pb-3">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold">Смена №{shift.number}</div>
                    <div className="mt-1 text-[13px] leading-5 text-[color:var(--muted)]">
                      Открыта {formatShiftDateTime(shift.openedAt)}
                    </div>
                    <div className="text-[13px] leading-5 text-[color:var(--muted)]">
                      Закрыта {formatShiftDateTime(shift.closedAt)}
                    </div>
                  </div>
                  <ShiftHistoryDetailsButton onClick={() => onSalaryDetailsOpen(shift)} />
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <ShiftHistoryMobileMetric
                    label="В кассе"
                    value={formatPrice(shift.revenue)}
                    note={`${shift.paidOrdersCount} оплачено из ${shift.ordersCount}`}
                  />
                  <ShiftHistoryMobileMetric
                    label="Без оплаты"
                    value={formatPrice(shift.completedUnpaidTotal)}
                    note={`${shift.completedUnpaidCount} заказов`}
                    tone={shift.completedUnpaidCount > 0 ? "warning" : "muted"}
                  />
                  <ShiftHistoryMobileMetric
                    label="Расходы"
                    value={formatPrice(shift.expenses)}
                    tone={shift.expenses > 0 ? "default" : "muted"}
                  />
                  <ShiftHistoryMobileMetric
                    label="К выплате"
                    value={formatShiftSalaryValue(shift.salaryAccrualTotal)}
                    tone={shift.salaryAccrualTotal ? "default" : "muted"}
                  />
                </div>

                <div className="mt-3 border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 text-[13px] leading-5">
                  <span className="font-medium text-[color:var(--foreground)]">
                    На смене: {shift.staff.length} чел.
                  </span>
                  <span className="text-[color:var(--muted)]"> · {staffShortLabel}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SalaryDetailsContent({
  breakdown,
}: {
  breakdown: DemoShiftSalaryBreakdown;
}) {
  if (breakdown.members.length === 0) {
    return (
      <div className="text-[14px] leading-5 text-[color:var(--muted)]">
        Детализация появится после оплаченных заказов в этой смене.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {breakdown.members.map((member) => (
        <div
          key={member.employeeId ?? member.employeeName}
          className="border border-[color:var(--border)] bg-white"
        >
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2.5">
            <div>
              <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                Итого сотруднику
              </div>
              <div className="mt-0.5 text-[15px] font-semibold leading-5 text-[color:var(--foreground)]">
                {member.employeeName} · {formatPrice(member.totalAmount)}
              </div>
            </div>
          </div>
          <div className="divide-y divide-[color:var(--border)]">
            {member.orders.length > 0 ? (
              <div className="hidden grid-cols-[minmax(0,1fr)_120px_120px] gap-3 bg-white px-3 py-2 text-[12px] font-medium leading-4 text-[color:var(--muted)] sm:grid">
                <span>Заказ</span>
                <span className="text-right">Сумма заказа</span>
                <span className="text-right">Начисление</span>
              </div>
            ) : null}
            {member.orders.length > 0 ? (
              member.orders.map((order) => (
                <div
                  key={`${member.employeeId ?? member.employeeName}-${order.orderId}`}
                  className="grid gap-2 px-3 py-2 text-[13px] leading-5 sm:grid-cols-[minmax(0,1fr)_120px_120px] sm:gap-3"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--foreground)]">
                      Заказ №{order.orderNumber}
                    </div>
                    <div className="truncate text-[12px] text-[color:var(--muted)]">
                      Сотрудник: {member.employeeName}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 text-[color:var(--muted)] sm:block sm:text-right">
                    <span className="text-[12px] sm:hidden">Сумма заказа</span>
                    <span>{formatPrice(order.orderFundAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3 font-semibold text-[color:var(--foreground)] sm:block sm:text-right">
                    <span className="text-[12px] font-normal text-[color:var(--muted)] sm:hidden">
                      Начисление
                    </span>
                    <span>{formatPrice(order.employeeAmount)}</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-3 py-3 text-[13px] leading-5 text-[color:var(--muted)]">
                По этому сотруднику нет строк начисления.
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Shift22PreviewBlock({ preview }: { preview: DemoShift22Preview | undefined }) {
  if (!preview || preview.status !== "supported") {
    return null;
  }

  return (
    <div className="border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold leading-5 text-[color:var(--foreground)]">
            Подробная разбивка по заказам
          </div>
        </div>
      </div>
      <div className="mt-3 space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="border border-[color:var(--border)] bg-white px-3 py-2">
            <div className="text-[11px] leading-4 text-[color:var(--muted)]">
              К выплате по заказам
            </div>
            <div className="mt-1 text-[15px] font-semibold leading-5 text-[color:var(--foreground)] tabular-nums">
              {formatPrice(preview.totalAmount)}
            </div>
          </div>
          <div className="border border-[color:var(--border)] bg-white px-3 py-2">
            <div className="text-[11px] leading-4 text-[color:var(--muted)]">
              Заказов в детализации
            </div>
            <div className="mt-1 text-[15px] font-semibold leading-5 text-[color:var(--foreground)] tabular-nums">
              {preview.orderCount}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          {preview.members.map((member) => (
            <div
              key={member.employeeId ?? member.employeeName ?? "unknown"}
              className="border border-[color:var(--border)] bg-white"
            >
              <div className="flex flex-col gap-1 border-b border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold leading-5 text-[color:var(--foreground)]">
                    {member.employeeName || "Исполнитель"}
                  </div>
                  <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                    {member.orderCount} заказов
                  </div>
                </div>
                <div className="text-[14px] font-semibold leading-5 text-[color:var(--foreground)] tabular-nums sm:text-right">
                  {formatPrice(member.totalAmount)}
                </div>
              </div>
              <div className="divide-y divide-[color:var(--border)]">
                {member.orders.map((order) => (
                  <div
                    key={`${member.employeeId ?? member.employeeName ?? "unknown"}-${order.orderId}`}
                    className="grid gap-1 px-3 py-2 text-[13px] leading-5 sm:grid-cols-[minmax(0,1fr)_120px]"
                  >
                    <div className="min-w-0 truncate text-[color:var(--foreground)]">
                      Заказ №{order.orderNumber}
                    </div>
                    <div className="font-semibold tabular-nums text-[color:var(--foreground)] sm:text-right">
                      {formatPrice(order.amount)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ShiftReadScreen({
  shiftState,
  staffOptions,
  currentEmployeeId,
  permissions,
}: {
  shiftState: DemoShiftState;
  staffOptions: DemoShiftStaffOption[];
  currentEmployeeId: string;
  permissions: DemoShiftUiPermissions;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ShiftTabId>("current");
  const [isPending, startTransition] = useTransition();
  const [staffModalMode, setStaffModalMode] = useState<StaffModalMode>(null);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [staffMinimumOverrides, setStaffMinimumOverrides] = useState<Record<string, string>>({});
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseAmountValue, setExpenseAmountValue] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [cashDetailsOpen, setCashDetailsOpen] = useState(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [salaryDetailsContext, setSalaryDetailsContext] = useState<{
    title: string;
    breakdown: DemoShiftSalaryBreakdown;
    stage22Preview?: DemoShift22Preview;
  } | null>(null);
  const currentShift = shiftState.currentShift;

  function openExpenseModal() {
    setActionError(null);
    setExpenseAmountValue("");
    setExpenseDescription("");
    setExpenseModalOpen(true);
  }

  function openSalaryDetails(
    title: string,
    breakdown: DemoShiftSalaryBreakdown,
    stage22Preview?: DemoShift22Preview,
  ) {
    setSalaryDetailsContext({ title, breakdown, stage22Preview });
  }

  function openStaffModal(mode: Exclude<StaffModalMode, null>) {
    const currentStaffIds =
      mode === "edit" && currentShift
        ? currentShift.staff
            .map((member) => member.employeeId)
            .filter((employeeId): employeeId is string => Boolean(employeeId))
        : [];
    const defaultStaffIds =
      currentStaffIds.length > 0
        ? currentStaffIds
        : getDefaultStaffSelection(staffOptions, currentEmployeeId);

    const initialOverrides: Record<string, string> = {};
    if (mode === "edit" && currentShift) {
      currentShift.staff.forEach((member) => {
        if (member.employeeId) {
          initialOverrides[member.employeeId] = String(member.shiftMinimumSnapshot);
        }
      });
    } else {
      staffOptions.forEach((option) => {
        initialOverrides[option.id] = String(option.shiftMinimum);
      });
    }

    setActionError(null);
    setSelectedStaffIds(defaultStaffIds);
    setStaffMinimumOverrides(initialOverrides);
    setStaffModalMode(mode);
  }

  function closeStaffModal() {
    setStaffModalMode(null);
    setActionError(null);
  }

  function toggleStaffSelection(employeeId: string) {
    setSelectedStaffIds((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId],
    );
  }

  function handleOpenShift() {
    if (selectedStaffIds.length === 0) {
      setActionError("Выберите хотя бы одного сотрудника смены.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        const input = selectedStaffIds.map((id) => ({
          id,
          shiftMinimum: Number(staffMinimumOverrides[id]) || 0,
        }));
        await openShiftViaApi(input);
        setStaffModalMode(null);
        router.refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Не удалось открыть смену.");
      }
    });
  }

  function handleUpdateStaff() {
    if (!currentShift) {
      return;
    }

    if (selectedStaffIds.length === 0) {
      setActionError("Выберите хотя бы одного сотрудника смены.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        const input = selectedStaffIds.map((id) => ({
          id,
          shiftMinimum: Number(staffMinimumOverrides[id]) || 0,
        }));
        await updateShiftStaffViaApi(currentShift.id, input);
        setStaffModalMode(null);
        router.refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Не удалось изменить состав смены.");
      }
    });
  }

  function handleStaffAttendance(
    member: DemoShiftStaffMember,
    action: ShiftAttendanceAction,
  ) {
    if (!currentShift) {
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        await markShiftStaffAttendanceViaApi(currentShift.id, {
          shiftStaffId: member.id,
          employeeId: member.employeeId ?? undefined,
          action,
        });
        router.refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Не удалось сохранить отметку.");
      }
    });
  }

  function handleExpenseSubmit() {
    if (!currentShift) {
      return;
    }

    const amount = parseAmountInput(expenseAmountValue);
    const description = expenseDescription.trim();

    if (!(amount > 0)) {
      setActionError("Укажите корректную сумму расхода.");
      return;
    }

    if (!description) {
      setActionError("Укажите описание расхода.");
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        await addShiftExpenseViaApi(currentShift.id, {
          amount,
          description,
        });
        setExpenseAmountValue("");
        setExpenseDescription("");
        setExpenseModalOpen(false);
        router.refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Не удалось добавить расход.");
      }
    });
  }

  function handleCloseShift() {
    if (!currentShift) {
      return;
    }

    setActionError(null);
    startTransition(async () => {
      try {
        await closeShiftViaApi(currentShift.id);
        setCloseConfirmOpen(false);
        router.refresh();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Не удалось закрыть смену.");
      }
    });
  }

  return (
    <section className="w-full max-w-[1840px] space-y-4">
      <div className="border border-[color:var(--border)] bg-white">
        <div className="overflow-x-auto border-b border-[color:var(--border)] px-3.5 py-3">
          <div className="flex min-w-max items-center gap-6 text-[16px] leading-5">
            {SHIFT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  "whitespace-nowrap text-left",
                  activeTab === tab.id
                    ? "font-medium text-[color:var(--primary)]"
                    : "text-[color:var(--foreground)] hover:text-[color:var(--primary)]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "current" && currentShift ? (
          <>
            <div className="flex flex-col gap-x-4 gap-y-2 px-3.5 py-3 text-[14px] leading-5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[color:var(--foreground)]">
                <span className="text-[16px] font-semibold">Смена №{currentShift.number}</span>
                <span className="font-medium text-emerald-600">открыта</span>
                <span className="text-[color:var(--muted)]">с {formatShiftDateTime(currentShift.openedAt)}</span>
              </div>

              {permissions.canCloseShift ? (
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setCloseConfirmOpen(true);
                  }}
                  className="inline-flex h-9 w-full items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white transition-colors hover:opacity-95 sm:w-auto"
                >
                  Закрыть смену
                </button>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      {activeTab === "current" ? (
        currentShift ? (
          <>
            <ShiftCurrentSummary
              currentShift={currentShift}
              permissions={permissions}
              onExpenseOpen={openExpenseModal}
              onStaffOpen={() => openStaffModal("edit")}
              onCashDetailsOpen={() => setCashDetailsOpen(true)}
              onSalaryDetailsOpen={() =>
                openSalaryDetails(
                  "Подробная разбивка по заказам",
                  currentShift.salaryBreakdown,
                  currentShift.stage22Preview,
                )
              }
            />

            <div className="border border-[color:var(--border)] bg-white">
              <div className="border-b border-[color:var(--border)] px-3.5 py-2.5">
                <div className="text-[15px] font-medium text-[color:var(--foreground)]">
                  Заказы смены
                </div>
              </div>

              <div className="divide-y divide-[color:var(--border)] lg:hidden">
                {currentShift.orders.length > 0 ? (
                  currentShift.orders.map((order) => (
                    <Link
                      key={order.id}
                      href={`/orders/view/${order.id}`}
                      className="block px-3.5 py-3 text-[14px] leading-5 text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[15px] font-semibold">
                            Заказ №{order.number}
                          </div>
                          <div className="mt-0.5 truncate text-[14px] font-medium">
                            {order.clientLabel}
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <ShiftStatusBadge
                            label={order.workStatusLabel}
                            className={workStatusBadgeClassName(order.workStatusLabel)}
                          />
                          <ShiftStatusBadge
                            label={order.paymentStatusLabel}
                            className={paymentStatusBadgeClassName(order.paymentStatusLabel)}
                          />
                        </div>
                      </div>

                      <div className="mt-3 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[12px] text-[color:var(--muted)]">Сумма</div>
                          <div className="mt-0.5 text-[15px] font-semibold text-[color:var(--foreground)]">
                            {formatPrice(order.amount)}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[12px] text-[color:var(--muted)]">Время</div>
                          <div className="mt-0.5 text-[15px] font-medium text-[color:var(--foreground)]">
                            {order.timeLabel || "—"}
                          </div>
                        </div>
                      </div>

                      <div className="mt-2 space-y-0.5 text-[12px] leading-4 text-[color:var(--muted)]">
                        <div className="truncate">{order.car}</div>
                        <div className="truncate">Исполнитель: {order.executorLabel}</div>
                        <div className="truncate">Оплата: {order.paymentSubLabel}</div>
                        {order.paymentAccountLabel ? (
                          <div className="truncate">Счёт: {order.paymentAccountLabel}</div>
                        ) : null}
                        <div className="truncate">{order.dateLabel}</div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="px-3.5 py-6">
                    <div className="border border-dashed border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4 text-[14px] leading-6 text-[color:var(--muted)]">
                      Заказов в текущей смене пока нет. После выполнения или оплаты они появятся здесь.
                    </div>
                  </div>
                )}
              </div>

              <div className="hidden overflow-x-auto lg:block">
                <div className="min-w-[1120px]">
                  <div className="grid grid-cols-[72px_minmax(250px,1.25fr)_minmax(170px,0.85fr)_minmax(140px,0.7fr)_112px_112px_120px] border-b border-[color:var(--border)] px-3.5 py-2.5 text-[14px] leading-5 text-[color:var(--muted)]">
                    <span>№</span>
                    <span>Клиент / Автомобиль</span>
                    <span>Сумма / способ</span>
                    <span>Исполнитель</span>
                    <span>Время</span>
                    <span>Работа</span>
                    <span>Оплата</span>
                  </div>

                  <div className="divide-y divide-[color:var(--border)]">
                    {currentShift.orders.length > 0 ? (
                      currentShift.orders.map((order) => (
                        <Link
                          key={order.id}
                          href={`/orders/view/${order.id}`}
                          className="grid grid-cols-[72px_minmax(250px,1.25fr)_minmax(170px,0.85fr)_minmax(140px,0.7fr)_112px_112px_120px] items-center px-3.5 py-3 text-[15px] leading-5 text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
                        >
                          <span className="font-medium">{order.number}</span>
                          <span className="leading-4">
                            <span className="block truncate font-medium text-[15px]">
                              {order.clientLabel}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] text-[color:var(--muted)]">
                              {order.car}
                            </span>
                          </span>
                          <span className="leading-4">
                            <span className="block font-semibold text-[15px]">
                              {formatPrice(order.amount)}
                            </span>
                            <span className="mt-0.5 block truncate text-[13px] text-[color:var(--muted)]">
                              {order.paymentSubLabel}
                            </span>
                            {order.paymentAccountLabel ? (
                              <span className="mt-0.5 block truncate text-[12px] text-[color:var(--muted)]/80">
                                {order.paymentAccountLabel}
                              </span>
                            ) : null}
                          </span>
                          <span className="truncate text-[14px] text-[color:var(--muted)]">
                            {order.executorLabel}
                          </span>
                          <span className="leading-4">
                            <span className="block text-[15px]">{order.timeLabel || "—"}</span>
                            <span className="mt-0.5 block text-[13px] text-[color:var(--muted)]">
                              {order.dateLabel}
                            </span>
                          </span>
                          <ShiftStatusBadge
                            label={order.workStatusLabel}
                            className={workStatusBadgeClassName(order.workStatusLabel)}
                          />
                          <ShiftStatusBadge
                            label={order.paymentStatusLabel}
                            className={paymentStatusBadgeClassName(order.paymentStatusLabel)}
                          />
                        </Link>
                      ))
                    ) : (
                      <div className="px-4 py-10">
                        <div className="max-w-[460px] border border-dashed border-[color:var(--border)] bg-[color:var(--background)] px-4 py-4 text-[15px] leading-6 text-[color:var(--muted)]">
                          Заказов в текущей смене пока нет. После выполнения или оплаты они появятся здесь.
                        </div>
                      </div>
                    )}
                  </div>
                  {currentShift.orders.length > 0 ? (
                    <div className="border-t border-[color:var(--border)] bg-[color:var(--background)] px-3.5 py-2 text-[13px] text-[color:var(--muted)]">
                      {currentShift.orders.length} заказа · Выручка:{" "}
                      <span className="font-semibold text-[color:var(--foreground)]">
                        {formatPrice(currentShift.revenue)}
                      </span>
                      {currentShift.completedUnpaidCount > 0 ? (
                        <span>
                          {" · "}Выполнено без оплаты:{" "}
                          <span className="font-semibold text-[color:var(--foreground)]">
                            {currentShift.completedUnpaidCount} /{" "}
                            {formatPrice(currentShift.completedUnpaidTotal)}
                          </span>
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="border border-[color:var(--border)] bg-white px-4 py-10 text-left">
            <div className="max-w-[520px] border border-dashed border-[color:var(--border)] bg-[color:var(--background)] px-5 py-5">
              <div className="text-[16px] font-medium text-[color:var(--foreground)]">
                Активная смена не открыта
              </div>
              <div className="mt-1.5 text-[15px] leading-6 text-[color:var(--muted)]">
                Сначала откройте смену. После этого здесь появятся заказы, оплаты, расходы и выплаты сотрудникам.
              </div>
            </div>
            {permissions.canOpenShift ? (
              <button
                type="button"
                onClick={() => openStaffModal("open")}
                className="mt-4 inline-flex h-9 w-full items-center justify-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 text-[14px] font-medium text-white transition-colors hover:opacity-95 sm:w-auto"
              >
                Открыть смену
              </button>
            ) : null}
          </div>
        )
      ) : null}

      {activeTab === "history" ? (
        <ShiftHistoryList
          history={shiftState.history}
          onSalaryDetailsOpen={(shift) =>
            openSalaryDetails(
              "Подробная разбивка по заказам",
              getClosedShiftSalaryBreakdown(shift),
              shift.stage22Preview,
            )
          }
        />
      ) : null}

      {activeTab === "log" ? (
        <div className="border border-[color:var(--border)] bg-white">
          <div className="divide-y divide-[color:var(--border)] sm:hidden">
            {shiftState.activity.map((item, index) => (
              <div
                key={item.id}
                className="px-3.5 py-3 text-[14px] leading-5 text-[color:var(--foreground)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                      #{index + 1}
                    </div>
                    <div className="mt-1 text-[15px] font-medium leading-5 text-[color:var(--foreground)]">
                      {item.actionLabel}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[13px] leading-5 text-[color:var(--foreground)]">
                      {item.dateLabel}
                    </div>
                    <div className="text-[12px] leading-4 text-[color:var(--muted)]">
                      {item.timeLabel || "—"}
                    </div>
                  </div>
                </div>
                {item.actionDetails ? (
                  <div className="mt-2 text-[13px] leading-5 text-[color:var(--muted)]">
                    {item.actionDetails}
                  </div>
                ) : null}
              </div>
            ))}

            {shiftState.activity.length === 0 ? (
              <div className="px-4 py-14 text-center text-[15px] text-[color:var(--muted)]">
                Действий по сменам пока нет.
              </div>
            ) : null}
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <div className="min-w-[960px]">
              <div className="grid grid-cols-[72px_minmax(0,1fr)_220px] border-y border-[color:var(--border)] px-3.5 py-2.5 text-[14px] leading-5 text-[color:var(--muted)]">
                <span>№</span>
                <span>Действие</span>
                <span>Дата</span>
              </div>

              <div className="divide-y divide-[color:var(--border)]">
                {shiftState.activity.map((item, index) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[72px_minmax(0,1fr)_220px] items-start px-3.5 py-3.5 text-[15px] leading-5 text-[color:var(--foreground)]"
                  >
                    <span className="pt-0.5">{index + 1}</span>
                    <span className="leading-4">
                      <span className="block font-medium text-[color:var(--foreground)]">
                        {item.actionLabel}
                      </span>
                      {item.actionDetails ? (
                        <span className="mt-1 block text-[13px] leading-5 text-[color:var(--muted)]">
                          {item.actionDetails}
                        </span>
                      ) : null}
                    </span>
                    <span className="leading-4">
                      <span className="block">{item.dateLabel}</span>
                      <span className="mt-0.5 block text-[13px] text-[color:var(--muted)]">
                        {item.timeLabel || "—"}
                      </span>
                    </span>
                  </div>
                ))}

                {shiftState.activity.length === 0 ? (
                  <div className="px-4 py-14 text-center text-[15px] text-[color:var(--muted)]">
                    Действий по сменам пока нет.
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {cashDetailsOpen && currentShift ? (
        <ShiftModal
          title="В кассе"
          onClose={() => setCashDetailsOpen(false)}
          maxWidthClassName="max-w-[420px]"
          actions={
            <button
              type="button"
              onClick={() => setCashDetailsOpen(false)}
              className="inline-flex h-9 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-3.5 text-[14px] font-medium text-white"
            >
              Закрыть
            </button>
          }
        >
          <CashBreakdownContent currentShift={currentShift} />
        </ShiftModal>
      ) : null}

      {salaryDetailsContext ? (
        <ShiftModal
          title={salaryDetailsContext.title}
          onClose={() => setSalaryDetailsContext(null)}
          maxWidthClassName="max-w-[760px]"
          bodyClassName="max-h-[620px]"
          actions={
            <button
              type="button"
              onClick={() => setSalaryDetailsContext(null)}
              className="inline-flex h-9 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-3.5 text-[14px] font-medium text-white"
            >
              Закрыть
            </button>
          }
        >
          <div className="space-y-4">
            <SalaryDetailsContent breakdown={salaryDetailsContext.breakdown} />
            <Shift22PreviewBlock preview={salaryDetailsContext.stage22Preview} />
          </div>
        </ShiftModal>
      ) : null}

      {staffModalMode ? (
        <ShiftModal
          title={staffModalMode === "open" ? "Открыть смену" : "Состав смены"}
          onClose={closeStaffModal}
          maxWidthClassName="max-w-[640px]"
          actions={
            <>
              <button
                type="button"
                onClick={closeStaffModal}
                className="inline-flex h-9 items-center border border-[color:var(--border)] bg-white px-3.5 text-[14px] font-medium text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={staffModalMode === "open" ? handleOpenShift : handleUpdateStaff}
                disabled={isPending || selectedStaffIds.length === 0}
                className="inline-flex h-9 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-3.5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
              >
                {staffModalMode === "open" ? "Открыть смену" : "Сохранить"}
              </button>
            </>
          }
        >
          <div className="text-[14px] leading-5 text-[color:var(--muted)]">
            Выберите сотрудников, которые работают в этой смене.
          </div>

          <div className="max-h-[520px] space-y-2 overflow-y-auto border border-[color:var(--border)] bg-[color:var(--background)] p-2">
            {staffOptions.map((option) => {
              const isSelected = selectedStaffIds.includes(option.id);
              const currentStaffMember =
                staffModalMode === "edit"
                  ? currentShift?.staff.find((member) => member.employeeId === option.id) ?? null
                  : null;

              return (
                <div
                  key={option.id}
                  className={clsx(
                    "flex flex-col gap-2 border px-3 py-2.5 text-[14px] leading-5",
                    isSelected
                      ? "border-[color:var(--primary)] bg-white"
                      : "border-[color:var(--border)] bg-white",
                  )}
                >
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleStaffSelection(option.id)}
                      className="mt-1 h-4 w-4 border-[color:var(--border)] text-[color:var(--primary)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-[color:var(--foreground)]">
                        {option.label}
                      </span>
                      {formatShiftStaffMeta(option) ? (
                        <span className="block text-[13px] text-[color:var(--muted)]">
                          {formatShiftStaffMeta(option)}
                        </span>
                      ) : null}
                    </span>
                  </label>

                  {isSelected ? (
                    <div className="ml-7 space-y-2 border-t border-[color:var(--border)] pt-2">
                      {/*
                      <label className="flex items-center justify-between gap-3">
                        <span className="text-[12px] text-[color:var(--muted)]">
                          Минимум за смену
                        </span>
                        <div className="flex w-24 items-center border border-[color:var(--border)] bg-[color:var(--background)] px-2">
                          <input
                            type="text"
                            value={staffMinimumOverrides[option.id] || "0"}
                            onChange={(e) => {
                              const val = e.target.value.replace(/[^\d]/g, "");
                              setStaffMinimumOverrides((current) => ({
                                ...current,
                                [option.id]: val,
                              }));
                            }}
                            className="h-7 w-full bg-transparent text-right text-[13px] font-medium outline-none"
                          />
                          <span className="ml-1 text-[11px] text-[color:var(--muted)]">₽</span>
                        </div>
                      </label>
                      */}
                      {currentStaffMember ? (
                        <div className="space-y-2 border-t border-[color:var(--border)] pt-2">
                          <label className="flex cursor-pointer items-start gap-3">
                            <input
                              type="checkbox"
                              checked={Boolean(
                                currentStaffMember.arrivedAt && !currentStaffMember.leftAt,
                              )}
                              disabled={isPending || Boolean(currentStaffMember.leftAt)}
                              onChange={(event) => {
                                if (event.target.checked && currentStaffMember.leftAt) {
                                  setActionError(
                                    "Сотрудник уже был отмечен как ушедший в этой смене. Повторный приход пока не поддерживается.",
                                  );
                                  return;
                                }

                                handleStaffAttendance(
                                  currentStaffMember,
                                  event.target.checked ? "arrived" : "left",
                                );
                              }}
                              className="mt-1 h-4 w-4 border-[color:var(--border)] text-[color:var(--primary)] disabled:cursor-not-allowed"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-[13px] font-medium leading-5 text-[color:var(--foreground)]">
                                Сейчас в смене
                              </span>
                              <span className="block text-[12px] leading-5 text-[color:var(--muted)]">
                                {getShiftStaffAttendanceLabel(currentStaffMember)}
                              </span>
                            </span>
                          </label>
                          <div className="ml-7 text-[12px] leading-5 text-[color:var(--muted)]">
                            {getShiftStaffAttendanceCheckboxHint(currentStaffMember)}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {actionError ? (
            <div className="text-[13px] leading-5 text-[#b42318]">{actionError}</div>
          ) : null}
        </ShiftModal>
      ) : null}

      {expenseModalOpen ? (
        <ShiftModal
          title="Добавить расход"
          onClose={() => {
            setExpenseModalOpen(false);
            setActionError(null);
          }}
          maxWidthClassName="max-w-[520px]"
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  setExpenseModalOpen(false);
                  setActionError(null);
                }}
                className="inline-flex h-9 items-center border border-[color:var(--border)] bg-white px-3.5 text-[14px] font-medium text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleExpenseSubmit}
                disabled={isPending}
                className="inline-flex h-9 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-3.5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
              >
                Сохранить
              </button>
            </>
          }
        >
          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium leading-5 text-[color:var(--foreground)]">
              Сумма
            </span>
            <input
              value={expenseAmountValue}
              onChange={(event) => setExpenseAmountValue(formatAmountInput(event.target.value))}
              placeholder="Например, 450"
              className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none placeholder:text-[#9ca3af] focus:border-[color:var(--primary)]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[13px] font-medium leading-5 text-[color:var(--foreground)]">
              Описание
            </span>
            <input
              value={expenseDescription}
              onChange={(event) => setExpenseDescription(event.target.value)}
              placeholder="Например, Хоз. расход"
              className="h-10 w-full border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)] outline-none placeholder:text-[#9ca3af] focus:border-[color:var(--primary)]"
            />
          </label>

          {actionError ? (
            <div className="text-[13px] leading-5 text-[#b42318]">{actionError}</div>
          ) : null}
        </ShiftModal>
      ) : null}

      {closeConfirmOpen && currentShift ? (
        <ShiftModal
          title="Закрыть смену"
          onClose={() => {
            setCloseConfirmOpen(false);
            setActionError(null);
          }}
          actions={
            <>
              <button
                type="button"
                onClick={() => {
                  setCloseConfirmOpen(false);
                  setActionError(null);
                }}
                className="inline-flex h-9 items-center border border-[color:var(--border)] bg-white px-3.5 text-[14px] font-medium text-[color:var(--foreground)] transition-colors hover:bg-[color:var(--background)]"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleCloseShift}
                disabled={isPending}
                className="inline-flex h-9 items-center border border-[color:var(--primary)] bg-[color:var(--primary)] px-3.5 text-[14px] font-medium text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
              >
                Закрыть смену
              </button>
            </>
          }
        >
          <div className="text-[14px] leading-5 text-[color:var(--foreground)]">
            Смена №{currentShift.number} будет закрыта с фиксацией текущих итогов и состава сотрудников.
          </div>
          {actionError ? (
            <div className="text-[13px] leading-5 text-[#b42318]">{actionError}</div>
          ) : null}
        </ShiftModal>
      ) : null}
    </section>
  );
}

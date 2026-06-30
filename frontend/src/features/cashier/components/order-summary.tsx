"use client";

import { formatPrice } from "@/features/cashier/mock-data";

type OrderSummaryProps = {
  servicesCount: number;
  subtotal: number;
  discount: number;
  total: number;
  disabled?: boolean;
};

export function OrderSummary({
  servicesCount,
  subtotal,
  discount,
  total,
  disabled,
}: OrderSummaryProps) {
  return (
    <section className="border border-[color:var(--border)] bg-white p-2.5">
      <p className="text-sm font-semibold text-[color:var(--foreground)]">
        Сводка заказа
      </p>

      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-center justify-between border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2">
          <span className="text-sm text-[color:var(--muted)]">Услуг в заказе</span>
          <span className="text-sm font-semibold text-[color:var(--foreground)]">
            {servicesCount}
          </span>
        </div>
        <div className="flex items-center justify-between border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2">
          <span className="text-sm text-[color:var(--muted)]">
            Сумма без скидки
          </span>
          <span className="text-sm font-semibold text-[color:var(--foreground)]">
            {formatPrice(subtotal)}
          </span>
        </div>
        <div className="flex items-center justify-between border border-[color:var(--border)] bg-[color:var(--background)] px-3 py-2">
          <span className="text-sm text-[color:var(--muted)]">Скидка</span>
          <span className="text-sm font-semibold text-[color:var(--foreground)]">
            {formatPrice(discount)}
          </span>
        </div>
      </div>

      <div className="mt-2.5 border border-[color:var(--primary)]/25 bg-[color:var(--primary)]/6 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-[color:var(--muted)]">Итог</span>
          <span className="text-lg font-semibold text-[color:var(--foreground)]">
            {formatPrice(total)}
          </span>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        className="mt-2.5 w-full border border-[color:var(--primary)] bg-[color:var(--primary)] px-4 py-2 text-sm font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
      >
        Оформить заказ
      </button>

      <p className="mt-2 text-center text-xs text-[color:var(--muted)]">
        Черновик: заказ не сохраняется в БД
      </p>
    </section>
  );
}

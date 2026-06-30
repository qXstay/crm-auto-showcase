"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { formatPrice } from "@/features/cashier/mock-data";
import type { CartItem } from "@/features/cashier/types";

type OrderCartProps = {
  items: CartItem[];
  onIncrease: (key: string) => void;
  onDecrease: (key: string) => void;
  onRemove: (key: string) => void;
};

export function OrderCart({
  items,
  onIncrease,
  onDecrease,
  onRemove,
}: OrderCartProps) {
  return (
    <section className="border border-[color:var(--border)] bg-white">
      <div className="flex items-center gap-2 border-b border-[color:var(--border)] px-3 py-2">
        <ShoppingCart className="h-4 w-4 text-[color:var(--primary)]" />
        <h2 className="text-sm font-semibold text-[color:var(--foreground)]">
          Корзина заказа
        </h2>
      </div>

      {items.length === 0 ? (
        <div className="m-2.5 border border-dashed border-[color:var(--border)] bg-[color:var(--background)] px-3.5 py-5 text-center">
          <p className="text-sm font-medium text-[color:var(--foreground)]">
            Корзина пока пуста
          </p>
          <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
            Выберите услугу в центральной колонке, чтобы добавить её в заказ.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-[color:var(--border)]">
          {items.map((item) => (
            <article
              key={item.key}
              className="px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
                    {item.serviceName}
                  </h3>
                  <p className="mt-1 text-xs text-[color:var(--muted)]">
                    {item.vehicleLabel} · {item.radius}
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--muted)]">
                    {formatPrice(item.unitPrice)} за единицу
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onRemove(item.key)}
                  className="border border-[color:var(--border)] p-2 text-[color:var(--muted)] transition hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                  aria-label={`Удалить ${item.serviceName}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="inline-flex items-center border border-[color:var(--border)] bg-[color:var(--background)] p-0.5">
                  <button
                    type="button"
                    onClick={() => onDecrease(item.key)}
                    className="p-1.5 text-[color:var(--foreground)] transition hover:bg-white"
                    aria-label={`Уменьшить количество ${item.serviceName}`}
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="min-w-10 px-3 text-center text-sm font-semibold text-[color:var(--foreground)]">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onIncrease(item.key)}
                    className="p-1.5 text-[color:var(--foreground)] transition hover:bg-white"
                    aria-label={`Увеличить количество ${item.serviceName}`}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>

                <div className="text-right">
                  <p className="text-xs uppercase tracking-[0.14em] text-[color:var(--muted)]">
                    Сумма по строке
                  </p>
                  <p className="mt-1 text-lg font-semibold text-[color:var(--foreground)]">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

"use client";

import { Plus } from "lucide-react";
import { formatPrice } from "@/features/cashier/mock-data";
import type { Service, ServiceCategory } from "@/features/cashier/types";

type ServiceListProps = {
  category: ServiceCategory;
  items: Array<{
    service: Service;
    price: number;
    disabled: boolean;
  }>;
  onAdd: (service: Service) => void;
};

export function ServiceList({ category, items, onAdd }: ServiceListProps) {
  return (
    <div className="bg-white">
      <div className="border-b border-[color:var(--border)] px-3 py-2">
        <h2 className="text-sm font-semibold text-[color:var(--foreground)]">
          {category.label}
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--muted)]">
          {category.description}
        </p>
      </div>

      <div className="divide-y divide-[color:var(--border)]">
        {items.map(({ service, price, disabled }) => (
          <article
            key={service.id}
            className="grid gap-2.5 px-3 py-2.5 lg:grid-cols-[minmax(0,1fr)_136px_92px] lg:items-center"
          >
            <div className="min-w-0">
              <div>
                <h3 className="text-sm font-semibold text-[color:var(--foreground)]">
                  {service.name}
                </h3>
                <p className="mt-0.5 text-xs leading-5 text-[color:var(--muted)]">
                  {service.description}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 lg:justify-end">
              <span className="border border-[color:var(--border)] bg-[color:var(--background)] px-2 py-1 text-[11px] font-medium text-[color:var(--primary)]">
                {service.pricing.kind === "matrix" ? "По параметрам" : "Фикс"}
              </span>
              <div>
                <p className="text-xs text-[color:var(--muted)]">Стоимость</p>
                <p className="mt-0.5 text-base font-semibold text-[color:var(--foreground)]">
                  {disabled ? "Недоступно" : formatPrice(price)}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 lg:justify-end">
              <p className="text-xs text-[color:var(--muted)] lg:hidden">
                {disabled
                  ? "Для выбранного типа автомобиля услуга недоступна."
                  : "Цена сохранится на момент добавления."}
              </p>
              <button
                type="button"
                onClick={() => onAdd(service)}
                disabled={disabled}
                className="inline-flex items-center justify-center gap-1.5 border border-[color:var(--primary)] bg-[color:var(--primary)] px-2.5 py-1.5 text-sm font-medium text-white transition hover:brightness-105 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-200 disabled:text-slate-500"
              >
                <Plus className="h-4 w-4" />
                Добавить
              </button>
            </div>

            <p className="hidden text-xs text-[color:var(--muted)] lg:block lg:col-span-3">
              {disabled
                ? "Для выбранного типа автомобиля услуга недоступна."
                : "Цена сохранится в корзине на момент добавления."}
            </p>
          </article>
        ))}
      </div>
    </div>
  );
}

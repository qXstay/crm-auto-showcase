"use client";

import clsx from "clsx";
import type { ServiceCategory, ServiceCategoryId } from "@/features/cashier/types";

type ServiceCategoryListProps = {
  categories: ServiceCategory[];
  activeCategoryId: ServiceCategoryId;
  onSelect: (categoryId: ServiceCategoryId) => void;
};

export function ServiceCategoryList({
  categories,
  activeCategoryId,
  onSelect,
}: ServiceCategoryListProps) {
  return (
    <div className="space-y-0.5">
      {categories.map((category) => {
        const isActive = category.id === activeCategoryId;

        return (
          <button
            key={category.id}
            type="button"
            onClick={() => onSelect(category.id)}
            className={clsx(
              "w-full border px-3 py-2 text-left transition-colors",
              isActive
                ? "border-[color:var(--primary)] bg-white text-[color:var(--primary)]"
                : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)]/25 hover:bg-white",
            )}
          >
            <p className="text-sm font-medium">{category.label}</p>
            <p
              className={clsx(
                "mt-0.5 text-xs leading-[18px]",
                isActive ? "text-[color:var(--primary)]/80" : "text-[color:var(--muted)]",
              )}
            >
              {category.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}

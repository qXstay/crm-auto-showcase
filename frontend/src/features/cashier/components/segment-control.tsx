"use client";

import clsx from "clsx";
import type { SegmentOption } from "@/features/cashier/types";

type SegmentControlProps<T extends string> = {
  options: ReadonlyArray<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: SegmentControlProps<T>) {
  return (
    <div className={clsx("grid gap-1", className)}>
      {options.map((option) => {
        const isActive = option.id === value;

        return (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={clsx(
              "border px-3 py-1.5 text-left transition-colors",
              isActive
                ? "border-[color:var(--primary)] bg-[color:var(--primary)] text-white"
                : "border-[color:var(--border)] bg-white text-[color:var(--foreground)] hover:border-[color:var(--primary)]/35 hover:bg-[color:var(--background)]",
            )}
          >
            <span className="block text-sm font-medium">{option.label}</span>
            {option.hint ? (
              <span
                className={clsx(
                  "mt-0.5 block text-xs",
                  isActive ? "text-white/80" : "text-[color:var(--muted)]",
                )}
              >
                {option.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import type { Executor } from "@/features/orders/utils";

/**
 * ExecutorSelect — dropdown for selecting the order executor (employee).
 * Extracted from /orders/page.tsx (step 2.3 of decomposition).
 * Behavior is identical to the original inline component.
 */

type ExecutorSelectProps = {
  value: string;
  options: Executor[];
  emptyLabel?: string;
  onChange: (value: string) => void;
};

export function ExecutorSelect({
  value,
  options,
  emptyLabel = "Нет сотрудников в смене",
  onChange,
}: ExecutorSelectProps) {
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const availableOptions =
    options.length > 0 ? options : [{ id: "", label: emptyLabel }];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedExecutor =
    availableOptions.find((executor) => executor.id === value) ?? availableOptions[0];

  return (
    <div ref={dropdownRef} className="relative w-full sm:min-w-[178px]">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        disabled={options.length === 0}
        className="flex h-10 w-full items-center justify-between border border-[color:var(--border)] bg-white px-3 text-[14px] text-[color:var(--foreground)]"
      >
        <span className="min-w-0 truncate">{selectedExecutor.label}</span>
        <ChevronDown className="h-4 w-4 text-[color:var(--muted)]" />
      </button>

      {open ? (
        <div className="absolute bottom-full right-0 z-20 mb-1 min-w-full overflow-hidden border border-[color:var(--border)] bg-white">
          {availableOptions.map((executor) => {
            const isSelected = executor.id === value;

            return (
              <button
                key={executor.id}
                type="button"
                onClick={() => {
                  onChange(executor.id);
                  setOpen(false);
                }}
                className={clsx(
                  "flex w-full items-center justify-between gap-4 px-3 py-2.5 text-left text-[14px]",
                  isSelected
                    ? "bg-[color:var(--primary)]/5 text-[color:var(--primary)]"
                    : executor.isLeft
                      ? "text-[color:var(--muted)] hover:bg-[color:var(--background)]"
                      : "text-[color:var(--foreground)] hover:bg-[color:var(--background)]",
                )}
              >
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate">{executor.label}</span>
                    {executor.isLeft ? (
                      <span
                        className={clsx(
                          "shrink-0 border px-1.5 py-0.5 text-[10px] font-medium leading-none",
                          isSelected
                            ? "border-[color:var(--primary)]/30 text-[color:var(--primary)]"
                            : "border-[color:var(--border)] text-[color:var(--muted)]",
                        )}
                      >
                        ушёл
                      </span>
                    ) : null}
                  </div>
                  {executor.subtitle ? (
                    <div className="mt-0.5 text-xs text-[color:var(--muted)]">
                      {executor.subtitle}
                    </div>
                  ) : null}
                </div>
                <span
                  className={clsx(
                    "text-xs",
                    isSelected ? "text-[color:var(--primary)]" : "text-transparent",
                  )}
                >
                  ✓
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

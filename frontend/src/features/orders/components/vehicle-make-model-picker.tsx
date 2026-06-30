"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { ChevronDown, X } from "lucide-react";
import {
  getVehicleMakeOptions,
  getVehicleModelOptions,
  resolveVehicleMakeLabel,
} from "@/features/orders/vehicle-catalog";

type VehicleMakeModelPickerProps = {
  brandValue: string;
  modelValue: string;
  onBrandChange: (value: string) => void;
  onModelChange: (value: string) => void;
  brandLabel?: string;
  modelLabel?: string;
  compact?: boolean;
};

export function VehicleMakeModelPicker({
  brandValue,
  modelValue,
  onBrandChange,
  onModelChange,
  brandLabel = "Марка автомобиля",
  modelLabel = "Модель автомобиля",
  compact = false,
}: VehicleMakeModelPickerProps) {
  const brandDropdownRef = useRef<HTMLLabelElement | null>(null);
  const modelDropdownRef = useRef<HTMLLabelElement | null>(null);
  const [brandOpen, setBrandOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const selectedMake = resolveVehicleMakeLabel(brandValue);
  const brandHasValue = brandValue.trim().length > 0;
  const modelHasValue = modelValue.trim().length > 0;
  const brandOptions = useMemo(() => getVehicleMakeOptions(brandValue), [brandValue]);
  const modelOptions = useMemo(
    () => getVehicleModelOptions(brandValue, modelValue),
    [brandValue, modelValue],
  );
  const fieldClassName = clsx(
    "h-10 w-full border border-[color:var(--border)] bg-white px-3 pr-9 text-[14px] text-[color:var(--foreground)] outline-none placeholder:text-[#9ca3af] focus:border-[color:var(--primary)] disabled:bg-[color:var(--background)] disabled:text-[color:var(--muted)]",
    compact ? "text-[13px]" : "",
  );
  const labelClassName = compact
    ? "text-[13px] font-medium text-[color:var(--foreground)]"
    : "text-[14px] text-[color:var(--foreground)]";

  useEffect(() => {
    function handleOutsideClick(event: MouseEvent) {
      if (!brandDropdownRef.current?.contains(event.target as Node)) {
        setBrandOpen(false);
      }

      if (!modelDropdownRef.current?.contains(event.target as Node)) {
        setModelOpen(false);
      }
    }

    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, []);

  function handleBrandInputChange(value: string) {
    onBrandChange(value);

    if (resolveVehicleMakeLabel(value) !== selectedMake) {
      onModelChange("");
    }

    setBrandOpen(true);
    setModelOpen(false);
  }

  function handleBrandSelect(nextBrand: string) {
    onBrandChange(nextBrand);
    onModelChange("");
    setBrandOpen(false);
  }

  function handleBrandClear() {
    onBrandChange("");
    onModelChange("");
    setBrandOpen(true);
    setModelOpen(false);
  }

  function handleModelClear() {
    onModelChange("");
    setModelOpen(Boolean(brandValue.trim()));
    setBrandOpen(false);
  }

  function handleModelInputChange(value: string) {
    onModelChange(value);
    setModelOpen(true);
  }

  function handleModelSelect(nextModel: string) {
    onModelChange(nextModel);
    setModelOpen(false);
  }

  return (
    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
      <label ref={brandDropdownRef} className="relative space-y-1.5">
        <span className={labelClassName}>{brandLabel}</span>
        <div className="relative">
          <input
            value={brandValue}
            onFocus={() => setBrandOpen(true)}
            onChange={(event) => handleBrandInputChange(event.target.value)}
            placeholder="Начните вводить марку"
            className={clsx(fieldClassName, brandHasValue ? "pr-16" : "")}
          />
          {brandHasValue ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleBrandClear}
              className="absolute right-8 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:bg-red-50 focus-visible:text-red-600"
              aria-label="Очистить марку автомобиля"
              title="Очистить марку автомобиля"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-[color:var(--muted)]">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
        {brandOpen ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto border border-[color:var(--border)] bg-white shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
            {brandOptions.length > 0 ? (
              brandOptions.map((make) => (
                <button
                  key={make}
                  type="button"
                  onClick={() => handleBrandSelect(make)}
                  className="block w-full px-3 py-2 text-left text-[14px] text-[color:var(--foreground)] hover:bg-[color:var(--background)]"
                >
                  {make}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-[13px] text-[color:var(--muted)]">
                Просто продолжите ввод вручную
              </div>
            )}
          </div>
        ) : null}
      </label>

      <label ref={modelDropdownRef} className="relative space-y-1.5">
        <span className={labelClassName}>{modelLabel}</span>
        <div className="relative">
          <input
            value={modelValue}
            onFocus={() => {
              if (brandValue.trim()) {
                setModelOpen(true);
              }
            }}
            onChange={(event) => handleModelInputChange(event.target.value)}
            placeholder={
              brandValue.trim() ? "Начните вводить (или оставьте пустым)" : "Сначала введите марку"
            }
            disabled={!brandValue.trim()}
            className={clsx(fieldClassName, modelHasValue ? "pr-16" : "")}
          />
          {modelHasValue ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={handleModelClear}
              className="absolute right-8 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 focus:outline-none focus-visible:bg-red-50 focus-visible:text-red-600"
              aria-label="Очистить модель автомобиля"
              title="Очистить модель автомобиля"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <span className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center text-[color:var(--muted)]">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
        {brandValue.trim() && modelOpen ? (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto border border-[color:var(--border)] bg-white shadow-[0_6px_20px_rgba(15,23,42,0.06)]">
            {modelOptions.length > 0 ? (
              modelOptions.map((model) => (
                <button
                  key={`${selectedMake || brandValue}-${model}`}
                  type="button"
                  onClick={() => handleModelSelect(model)}
                  className="block w-full px-3 py-2 text-left text-[14px] text-[color:var(--foreground)] hover:bg-[color:var(--background)]"
                >
                  {model}
                </button>
              ))
            ) : (
              <div className="px-3 py-2 text-[13px] text-[color:var(--muted)]">
                Просто введите модель вручную
              </div>
            )}
          </div>
        ) : null}
      </label>
    </div>
  );
}

"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import clsx from "clsx";
import { PlateKeyboard } from "@/features/orders/components/plate-keyboard";
import {
  RUSSIAN_PLATE_BODY_LENGTH,
  RUSSIAN_PLATE_REGION_MAX_LENGTH,
  composeRussianPlate,
  isCompleteRussianPlate,
  normalizePlate,
  parseRussianPlateParts,
} from "@/features/clients/client-contract";

type PlateInputProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  compact?: boolean;
  required?: boolean;
  className?: string;
  inputClassName?: string;
};

type ActivePlateField = "body" | "region";

export function normalizePlateInput(value: string) {
  return normalizePlate(value);
}

export function PlateInput({
  value,
  onChange,
  label = "Госномер",
  placeholder = "А123АА",
  compact = false,
  required = false,
  className,
  inputClassName,
}: PlateInputProps) {
  const bodyInputRef = useRef<HTMLInputElement | null>(null);
  const regionInputRef = useRef<HTMLInputElement | null>(null);
  const [activeField, setActiveField] = useState<ActivePlateField>("body");
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const plateParts = useMemo(() => parseRussianPlateParts(value), [value]);
  const incompleteRequiredValue = required && Boolean(value) && !isCompleteRussianPlate(value);

  function focusField(field: ActivePlateField) {
    window.requestAnimationFrame(() => {
      const input = field === "body" ? bodyInputRef.current : regionInputRef.current;

      if (!input) {
        return;
      }

      input.focus();
    });
  }

  function applyParts(body: string, region: string, nextFocusField: ActivePlateField = activeField) {
    onChange(composeRussianPlate(body, region));
    focusField(nextFocusField);
  }

  function handleBodyChange(event: ChangeEvent<HTMLInputElement>) {
    const nextBody = normalizePlateInput(event.currentTarget.value).slice(0, RUSSIAN_PLATE_BODY_LENGTH);
    const nextFocusField =
      nextBody.length >= RUSSIAN_PLATE_BODY_LENGTH ? "region" : "body";

    applyParts(nextBody, plateParts.region, nextFocusField);
  }

  function handleRegionChange(event: ChangeEvent<HTMLInputElement>) {
    const nextRegion = normalizePlateInput(event.currentTarget.value)
      .replace(/\D/g, "")
      .slice(0, RUSSIAN_PLATE_REGION_MAX_LENGTH);

    applyParts(plateParts.body, nextRegion, "region");
  }

  function handleKeyboardKey(symbol: string) {
    if (activeField === "region") {
      const nextRegion = normalizePlateInput(`${plateParts.region}${symbol}`)
        .replace(/\D/g, "")
        .slice(0, RUSSIAN_PLATE_REGION_MAX_LENGTH);

      applyParts(plateParts.body, nextRegion, "region");
      return;
    }

    const nextBody = normalizePlateInput(`${plateParts.body}${symbol}`).slice(
      0,
      RUSSIAN_PLATE_BODY_LENGTH,
    );
    const nextFocusField =
      nextBody.length >= RUSSIAN_PLATE_BODY_LENGTH ? "region" : "body";

    applyParts(nextBody, plateParts.region, nextFocusField);
  }

  function handleBackspace() {
    if (activeField === "region") {
      if (plateParts.region) {
        applyParts(plateParts.body, plateParts.region.slice(0, -1), "region");
        return;
      }

      setActiveField("body");
      focusField("body");
      return;
    }

    applyParts(plateParts.body.slice(0, -1), plateParts.region, "body");
  }

  return (
    <div className={clsx("space-y-1.5", className)}>
      <fieldset className="space-y-1">
        <span
          className={clsx(
            "font-medium text-[color:var(--foreground)]",
            compact ? "text-[13px]" : "text-[14px]",
          )}
        >
          {label}
          {required ? " *" : ""}
        </span>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_82px] items-stretch">
          <label className="min-w-0">
            <span className="sr-only">{label}</span>
            <input
              ref={bodyInputRef}
              value={plateParts.body}
              onFocus={() => {
                setActiveField("body");
                setKeyboardOpen(true);
              }}
              onChange={handleBodyChange}
              placeholder={placeholder}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={RUSSIAN_PLATE_BODY_LENGTH}
              className={clsx(
                "h-10 w-full min-w-0 border border-[color:var(--border)] bg-white px-3 text-center text-[15px] font-semibold tracking-normal text-[color:var(--foreground)] outline-none placeholder:text-[#9ca3af] focus:border-[color:var(--primary)]",
                inputClassName,
              )}
            />
          </label>
          <label className="min-w-0 border-y border-r border-[color:var(--border)] bg-white focus-within:border-[color:var(--primary)]">
            <span className="sr-only">Регион</span>
            <input
              ref={regionInputRef}
              value={plateParts.region}
              onFocus={() => {
                setActiveField("region");
                setKeyboardOpen(true);
              }}
              onChange={handleRegionChange}
              placeholder="196"
              inputMode="numeric"
              autoComplete="off"
              maxLength={RUSSIAN_PLATE_REGION_MAX_LENGTH}
              className="h-6 w-full min-w-0 bg-transparent px-1 text-center text-[13px] font-semibold tracking-normal text-[color:var(--foreground)] outline-none placeholder:text-[#9ca3af]"
            />
            <span className="flex h-4 items-center justify-center gap-1 text-[8px] font-semibold leading-none text-[color:var(--foreground)]">
              RUS
              <span aria-hidden="true" className="grid h-2.5 w-4 overflow-hidden border border-slate-300">
                <span className="bg-white" />
                <span className="bg-[#1f55a5]" />
                <span className="bg-[#d52b1e]" />
              </span>
            </span>
          </label>
        </div>
      </fieldset>

      {incompleteRequiredValue ? (
        <p className="text-[11px] leading-4 text-[#c45b5b]">Укажите номер и регион.</p>
      ) : null}

      {keyboardOpen ? (
        <div className="max-w-full sm:max-w-[360px]">
          <PlateKeyboard
            onKeyPress={handleKeyboardKey}
            onBackspace={handleBackspace}
            onClose={() => setKeyboardOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

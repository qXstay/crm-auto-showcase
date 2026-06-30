"use client";

import React from "react";
import { X, Delete } from "lucide-react";

interface PlateKeyboardProps {
  onKeyPress: (key: string) => void;
  onBackspace: () => void;
  onClose: () => void;
}

export const PLATE_LETTERS = ["А", "В", "Е", "К", "М", "Н", "О", "Р", "С", "Т", "У", "Х"];
export const PLATE_NUMBERS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function PlateKeyboard({ onKeyPress, onBackspace, onClose }: PlateKeyboardProps) {
  return (
    <div className="rounded-[4px] border border-[color:var(--border)] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
      <div className="mb-1.5 flex items-center justify-between border-b border-[color:var(--border)] pb-1.5">
        <span className="text-[11px] font-semibold uppercase text-[color:var(--muted)]">
          Номерной знак
        </span>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center text-[color:var(--muted)] hover:text-[color:var(--foreground)]"
          aria-label="Закрыть клавиатуру госномера"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-10 gap-1">
        {PLATE_NUMBERS.map((num) => (
          <button
            key={num}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onKeyPress(num)}
            className="flex h-8 min-w-0 items-center justify-center rounded-[4px] border border-[#dfe3ee] bg-[#f8fafc] text-[14px] font-semibold text-[color:var(--foreground)] active:bg-[#e2e8f0]"
          >
            {num}
          </button>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-6 gap-1">
        {PLATE_LETTERS.map((letter) => (
          <button
            key={letter}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onKeyPress(letter)}
            className="flex h-8 min-w-0 items-center justify-center rounded-[4px] border border-[#dfe3ee] bg-white text-[14px] font-semibold text-[color:var(--foreground)] active:bg-[#f1f5f9]"
          >
            {letter}
          </button>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-6 gap-1">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onBackspace}
          className="col-span-2 flex h-8 items-center justify-center rounded-[4px] border border-[#f3c6c6] bg-[#fff1f1] text-[#c45b5b] active:bg-[#fee2e2]"
          aria-label="Удалить"
        >
          <Delete className="h-4 w-4" />
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClose}
          className="col-span-4 flex h-8 items-center justify-center rounded-[4px] border border-[#dfe3ee] bg-white text-[13px] font-medium text-[color:var(--foreground)] active:bg-[#f1f5f9]"
        >
          Готово
        </button>
      </div>
    </div>
  );
}

import clsx from "clsx";
import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

/**
 * Form primitives — Input, Select, Textarea.
 * Single style baseline for all form fields in the project.
 *
 * Usage:
 *   <Input placeholder="Имя клиента" value={name} onChange={...} />
 *   <InputField label="Телефон" error="Обязательное поле"><Input .../></InputField>
 *   <AppSelect value={v} onChange={...}><option>...</option></AppSelect>
 */

// ── Shared field base styles ───────────────────────────────────────────────

const FIELD_BASE = clsx(
  "w-full rounded-md border border-[color:var(--border)] bg-white",
  "text-[14px] text-[color:var(--foreground)] placeholder:text-[color:var(--muted)]",
  "transition-colors",
  "focus:outline-none focus:border-[color:var(--primary)] focus:ring-1 focus:ring-[color:var(--primary)]",
  "disabled:bg-[#f7f8fa] disabled:text-[color:var(--muted)] disabled:pointer-events-none",
);

// ── Input ──────────────────────────────────────────────────────────────────

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  error?: boolean;
};

export function Input({ className, error, ...props }: InputProps) {
  return (
    <input
      {...props}
      className={clsx(
        FIELD_BASE,
        "h-9 px-3",
        error && "border-[color:var(--danger)] focus:border-[color:var(--danger)] focus:ring-[color:var(--danger)]",
        className,
      )}
    />
  );
}

// ── Select ─────────────────────────────────────────────────────────────────

type AppSelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean;
};

export function AppSelect({ className, error, children, ...props }: AppSelectProps) {
  return (
    <select
      {...props}
      className={clsx(
        FIELD_BASE,
        "h-9 px-3 pr-8",
        "appearance-none bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%236f7687' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")] bg-[right_8px_center] bg-no-repeat",
        error && "border-[color:var(--danger)] focus:border-[color:var(--danger)] focus:ring-[color:var(--danger)]",
        className,
      )}
    >
      {children}
    </select>
  );
}

// ── Textarea ───────────────────────────────────────────────────────────────

type AppTextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: boolean;
};

export function AppTextarea({ className, error, ...props }: AppTextareaProps) {
  return (
    <textarea
      {...props}
      className={clsx(
        FIELD_BASE,
        "px-3 py-2.5 resize-none leading-5",
        error && "border-[color:var(--danger)] focus:border-[color:var(--danger)] focus:ring-[color:var(--danger)]",
        className,
      )}
    />
  );
}

// ── InputField wrapper with label and error message ────────────────────────

type InputFieldProps = {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
};

export function InputField({ label, error, hint, required, children, className }: InputFieldProps) {
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <label className="text-[13px] font-medium text-[color:var(--foreground)]">
          {label}
          {required && <span className="ml-0.5 text-[color:var(--danger)]">*</span>}
        </label>
      ) : null}
      {children}
      {error ? (
        <p className="text-[12px] text-[color:var(--danger)]">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-[color:var(--muted)]">{hint}</p>
      ) : null}
    </div>
  );
}

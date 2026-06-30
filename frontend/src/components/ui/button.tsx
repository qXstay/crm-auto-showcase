import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

/**
 * Unified Button component for the whole project.
 * Replaces ad-hoc button styles scattered across pages.
 *
 * Usage:
 *   <Button>Сохранить</Button>
 *   <Button variant="ghost">Отмена</Button>
 *   <Button variant="danger" size="sm">Удалить</Button>
 *   <Button loading>Сохранение...</Button>
 */

export type ButtonVariant = "primary" | "ghost" | "danger" | "outline";
export type ButtonSize = "sm" | "md" | "lg";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  fullWidth?: boolean;
};

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-[color:var(--primary)] text-white border-transparent hover:opacity-90 active:opacity-80",
  ghost:
    "bg-transparent border-transparent text-[color:var(--foreground)] hover:bg-[#f1f3f8] active:bg-[#e8eaf0]",
  danger:
    "bg-[color:var(--danger-bg)] text-[color:var(--danger)] border-[color:var(--danger)] hover:bg-[color:var(--danger)] hover:text-white",
  outline:
    "bg-white text-[color:var(--foreground)] border-[color:var(--border)] hover:bg-[#f7f8fa] active:bg-[#f1f3f8]",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-7 px-2.5 text-[13px] gap-1.5",
  md: "h-8 px-3 text-[13px] gap-2",
  lg: "h-9 px-4 text-[14px] gap-2",
};

export function Button({
  variant = "outline",
  size = "md",
  loading = false,
  fullWidth = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={clsx(
        "inline-flex items-center justify-center whitespace-nowrap",
        "rounded-md border font-medium",
        "transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)] focus-visible:ring-offset-1",
        "disabled:pointer-events-none disabled:opacity-50",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {loading ? (
        <>
          <span
            className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          {children}
        </>
      ) : (
        children
      )}
    </button>
  );
}

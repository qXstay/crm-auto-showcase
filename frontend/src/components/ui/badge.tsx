import clsx from "clsx";

/**
 * Status badges — used for order status, payment status, etc.
 * Single source of truth so all screens show the same colors.
 *
 * Usage:
 *   <Badge variant="success">Оплачен</Badge>
 *   <Badge variant="warning">В работе</Badge>
 *   <OrderStatusBadge status="Оплачен" />
 */

export type BadgeVariant = "success" | "warning" | "danger" | "info" | "neutral" | "draft";

type BadgeProps = {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
  size?: "sm" | "md";
};

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  success: "bg-[color:var(--success-bg)] text-[color:var(--success)]",
  warning: "bg-[color:var(--warning-bg)] text-[color:var(--warning)]",
  danger:  "bg-[color:var(--danger-bg)] text-[color:var(--danger)]",
  info:    "bg-[color:var(--info-bg)] text-[color:var(--info)]",
  neutral: "bg-[#f1f3f8] text-[color:var(--muted)]",
  draft:   "bg-[#f1f3f8] text-[color:var(--muted)]",
};

export function Badge({ variant = "neutral", children, className, size = "md" }: BadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center whitespace-nowrap rounded font-medium",
        size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-[11px]",
        VARIANT_CLASSES[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

// ── Typed order status badge ───────────────────────────────────────────────

export type OrderStatus =
  | "Черновик"
  | "В работе"
  | "Ожидает оплаты"
  | "Оплачен"
  | "Выполнен"
  | "Отменён"
  | "Пометить на удаление";

const ORDER_STATUS_VARIANT: Record<OrderStatus, BadgeVariant> = {
  "Черновик":         "draft",
  "В работе":         "info",
  "Ожидает оплаты":   "warning",
  "Оплачен":          "success",
  "Выполнен":         "warning",
  "Отменён":          "danger",
  "Пометить на удаление": "danger",
};

export function OrderStatusBadge({
  status,
  size,
  className,
}: {
  status: OrderStatus | string;
  size?: "sm" | "md";
  className?: string;
}) {
  const variant =
    ORDER_STATUS_VARIANT[status as OrderStatus] ?? "neutral";

  return (
    <Badge variant={variant} size={size} className={className}>
      {status}
    </Badge>
  );
}

// ── Payment status badge ───────────────────────────────────────────────────

export type PaymentStatus = "Оплачен" | "Не оплачено";

const PAYMENT_STATUS_VARIANT: Record<PaymentStatus, BadgeVariant> = {
  "Оплачен":      "success",
  "Не оплачено":  "neutral",
};

export function PaymentStatusBadge({
  status,
  size,
  className,
}: {
  status: PaymentStatus | string;
  size?: "sm" | "md";
  className?: string;
}) {
  const variant =
    PAYMENT_STATUS_VARIANT[status as PaymentStatus] ?? "neutral";

  return (
    <Badge variant={variant} size={size} className={className}>
      {status}
    </Badge>
  );
}

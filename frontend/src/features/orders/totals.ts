import type { DemoOrder, DemoOrderTotals } from "@/features/orders/types";

export const MAX_ORDER_DISCOUNT_PERCENT = 100;

function roundMoney(value: number) {
  return Math.max(0, Math.round(value));
}

export function normalizeOrderDiscountPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }

  return Math.min(
    MAX_ORDER_DISCOUNT_PERCENT,
    Math.max(0, Math.round(value * 100) / 100),
  );
}

export function calculateOrderTotalsFromSubtotal(
  subtotal: number,
  discountPercentInput: number | null | undefined = 0,
): DemoOrderTotals {
  const normalizedSubtotal = roundMoney(subtotal);
  const discountPercent = normalizeOrderDiscountPercent(discountPercentInput);
  const total = roundMoney((normalizedSubtotal * (100 - discountPercent)) / 100);
  const discount = Math.max(0, normalizedSubtotal - total);

  return {
    servicesCount: 0,
    subtotal: normalizedSubtotal,
    discount,
    discountPercent,
    total,
  };
}

export function calculateOrderTotals(
  lines: DemoOrder["lines"],
  discountPercentInput: number | null | undefined = 0,
): DemoOrderTotals {
  const subtotal = lines.reduce(
    (total, line) => total + line.unitPrice * line.quantity,
    0,
  );
  const totals = calculateOrderTotalsFromSubtotal(subtotal, discountPercentInput);

  return {
    ...totals,
    servicesCount: lines.reduce((total, line) => total + line.quantity, 0),
  };
}

export function inferOrderDiscountPercent(input: {
  subtotal?: number | null;
  discount?: number | null;
}) {
  const subtotal = input.subtotal ?? 0;
  const discount = input.discount ?? 0;

  if (!Number.isFinite(subtotal) || subtotal <= 0 || !Number.isFinite(discount) || discount <= 0) {
    return 0;
  }

  return normalizeOrderDiscountPercent((discount / subtotal) * 100);
}

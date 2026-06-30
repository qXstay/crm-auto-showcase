import type { Prisma } from "@/server/db/prisma-client";
import { PEGAS_OPERATIONAL_TIME_ZONE } from "@/shared/operational-time";

export function decimalToNumber(value: Prisma.Decimal | { toString(): string } | number | null | undefined) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "number") {
    return value;
  }

  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseJsonValue<T>(value: Prisma.JsonValue | null | undefined, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  return value as T;
}

export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDateOnly(value: Date | string | null | undefined) {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function splitDateTimeLabel(value: string) {
  if (value.includes(", ")) {
    const [dateLabel, timeLabel] = value.split(", ");
    return {
      dateLabel: dateLabel ?? value,
      timeLabel: timeLabel ?? "",
    };
  }

  return {
    dateLabel: value,
    timeLabel: "",
  };
}

export function buildCarLabel(input: {
  brand?: string | null;
  model?: string | null;
  plateNumber?: string | null;
}) {
  const brandModel = [input.brand, input.model].filter(Boolean).join(" ").trim();

  return brandModel || "Не указан";
}

export function getClientDisplayName(input: {
  clientKind?: string | null;
  organizationName?: string | null;
  anonymous?: boolean | null;
  name?: string | null;
  label?: string | null;
}) {
  if (input.anonymous) {
    return "Анонимный клиент";
  }

  if (input.clientKind === "legal" && input.organizationName?.trim()) {
    return input.organizationName.trim();
  }

  return input.name?.trim() || input.label?.trim() || "Не указан";
}

export function buildClientDisplay(input: {
  anonymous?: boolean | null;
  name?: string | null;
  label?: string | null;
  phone?: string | null;
}) {
  const baseLabel = getClientDisplayName(input);
  return input.phone?.trim() ? `${baseLabel} · ${input.phone.trim()}` : baseLabel;
}

function normalizedPaymentKey(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/ё/g, "е")
    .toLocaleLowerCase("ru-RU");
}

function isStandalonePaymentMethodLabel(value: string | null | undefined) {
  const normalized = normalizedPaymentKey(value);
  return normalized === "менеджер" || normalized === "расчетный счет";
}

function splitPaymentLabelParts(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .split(/[·•]/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function getPaymentMethodLabel(paymentMethod: string | null | undefined) {
  switch (paymentMethod) {
    case "cash":
      return "Наличные";
    case "card":
      return "Карта";
    case "transfer":
      return "Перевод";
    case "ildar":
      return "Перевод";
    case "bank_account":
      return "Расчётный счёт";
    default:
      return null;
  }
}

export function formatPaymentMethodDisplay(input: {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentLabel?: string | null;
}) {
  if (normalizedPaymentKey(input.paymentStatus) === "не оплачено") {
    return "Не оплачено";
  }

  const methodLabel = getPaymentMethodLabel(input.paymentMethod);

  if (methodLabel) {
    return methodLabel;
  }

  const firstPaymentLabel = splitPaymentLabelParts(input.paymentLabel)[0] ?? null;
  const normalizedLabel = normalizedPaymentKey(firstPaymentLabel);

  if (normalizedLabel === "наличный расчет" || normalizedLabel === "наличные") {
    return "Наличные";
  }

  if (
    normalizedLabel === "безнал (эквайринг)" ||
    normalizedLabel === "эквайринг (карта)" ||
    normalizedLabel === "карта"
  ) {
    return "Карта";
  }

  if (normalizedLabel === "перевод" || normalizedLabel === "перевод на карту") {
    return "Перевод";
  }

  return firstPaymentLabel || "Не оплачено";
}

export function formatPaymentAccountDisplay(input: {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentLabel?: string | null;
  accountNameSnapshot?: string | null;
}) {
  const paymentMethodLabel = formatPaymentMethodDisplay(input);

  if (paymentMethodLabel === "Не оплачено") {
    return null;
  }

  const paymentLabelParts = splitPaymentLabelParts(input.paymentLabel);
  const candidates = [
    ...splitPaymentLabelParts(input.accountNameSnapshot),
    ...paymentLabelParts.slice(1),
  ];
  const seen = new Set<string>();
  const accountParts = candidates.filter((part) => {
    const key = normalizedPaymentKey(part);

    if (
      !key ||
      key === normalizedPaymentKey(paymentMethodLabel) ||
      key === "наличные" ||
      key === "наличный расчет" ||
      key === "карта" ||
      key === "безнал (эквайринг)" ||
      key === "эквайринг (карта)" ||
      key === "перевод" ||
      key === "перевод на карту" ||
      seen.has(key)
    ) {
      return false;
    }

    seen.add(key);
    return true;
  });

  return accountParts.join(" · ") || null;
}

export function formatPaymentDisplay(input: {
  paymentStatus?: string | null;
  paymentMethod?: string | null;
  paymentLabel?: string | null;
  accountNameSnapshot?: string | null;
}) {
  if (isStandalonePaymentMethodLabel(input.paymentLabel)) {
    return input.paymentLabel?.trim() || "Не оплачено";
  }

  const seen = new Set<string>();
  const parts = [input.paymentLabel, input.accountNameSnapshot]
    .flatMap((value) =>
      (value ?? "")
        .normalize("NFKC")
        .split(/[·•]/)
        .map((part) => part.replace(/\s+/g, " ").trim())
        .filter(Boolean),
    )
    .filter((part) => {
      const key = normalizedPaymentKey(part);

      if (!key || seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });

  return parts.join(" · ") || "Не оплачено";
}

export function formatShiftLabel(number: number, openedAt: Date | string) {
  const date = openedAt instanceof Date ? openedAt : new Date(openedAt);

  return `№${number} от ${new Intl.DateTimeFormat("ru-RU", {
    timeZone: PEGAS_OPERATIONAL_TIME_ZONE,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date)}`;
}

export function formatDurationLabel(start: Date | string, end: Date | string | null | undefined) {
  if (!end) {
    return "—";
  }

  const startDate = start instanceof Date ? start : new Date(start);
  const endDate = end instanceof Date ? end : new Date(end);
  const diffMinutes = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60000));

  if (diffMinutes % 10 === 1 && diffMinutes % 100 !== 11) {
    return `${diffMinutes} минута`;
  }

  if (
    diffMinutes % 10 >= 2 &&
    diffMinutes % 10 <= 4 &&
    (diffMinutes % 100 < 12 || diffMinutes % 100 > 14)
  ) {
    return `${diffMinutes} минуты`;
  }

  return `${diffMinutes} минут`;
}

export function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return "0 ₽";
  }

  return `${new Intl.NumberFormat("ru-RU").format(Math.round(value))} ₽`;
}

export function buildWorkSummary(
  lines: Array<{ serviceNameSnapshot: string; quantity: number; lineTotal: number }>,
) {
  if (lines.length === 0) {
    return "Работы не зафиксированы";
  }

  return lines
    .slice(0, 2)
    .map((line) => `${line.serviceNameSnapshot} ${formatPrice(line.lineTotal)} x ${line.quantity}`)
    .join(", ");
}

export function getVehicleTypeLabel(vehicleType: string | null | undefined) {
  switch (vehicleType) {
    case "passenger":
      return "Легковой";
    case "suv":
      return "Кроссовер";
    case "offroad":
      return "Внедорожник";
    case "commercial":
      return "Коммерческий";
    default:
      return "Не указан";
  }
}

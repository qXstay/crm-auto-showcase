import { formatPrice } from "@/features/pricing/config";
import type { DemoBranchPrintSettings, DemoBranchProfile, DemoBranchSummary } from "@/features/branches/types";
import type { CartItem } from "@/features/cashier/types";
import type { DemoOrder, DemoOrderDetail } from "@/features/orders/types";
import { formatPlateForDisplay } from "@/features/clients/client-contract";

export type PrintableOrderLine = {
  key: string;
  serviceName: string;
  contextLabel: string | null;
  detailsLabel: string | null;
  quantityLabel: string;
  unitPriceLabel: string;
  totalPriceLabel: string;
};

export type PrintableOrderDocument = {
  id: string;
  number: string;
  dateLabel: string;
  receiptTitle: string;
  locationLabel: string | null;
  branchPhone: string | null;
  clientName: string;
  clientPhone: string;
  clientInn: string | null;
  carLabel: string;
  plateNumber: string;
  paymentLabel: string;
  accountLabel: string | null;
  paymentNote: string | null;
  executorLabel: string;
  shiftLabel: string;
  totalLabel: string;
  recommendationText: string | null;
  footerNote: string | null;
  lines: PrintableOrderLine[];
};

function dedupeLabels(values: Array<string | null | undefined>) {
  const seen = new Set<string>();

  return values.filter((value): value is string => {
    if (!value) {
      return false;
    }

    const normalized = value.trim().toLocaleLowerCase("ru-RU");

    if (!normalized || seen.has(normalized)) {
      return false;
    }

    seen.add(normalized);
    return true;
  });
}

function buildCarLabel(order: DemoOrder) {
  const brandModel = [order.client.carBrand, order.client.carModel]
    .filter(Boolean)
    .join(" ")
    .trim();

  return brandModel || "Не указан";
}

function getClientDisplayName(order: DemoOrder) {
  if (order.client.anonymous) {
    return "Анонимный клиент";
  }

  if (order.client.clientKind === "legal" && order.client.organizationName?.trim()) {
    return order.client.organizationName.trim();
  }

  return order.client.name || order.client.label || "Не указан";
}

function buildPrintableLineContext(line: CartItem) {
  const modifierLabels = [
    line.lowProfile ? "Низкий профиль" : null,
    line.runflat ? "RunFlat" : null,
  ];

  if (line.pricingSnapshot.priceType === "matrix") {
    const bits = dedupeLabels([
      line.vehicleLabel || null,
      line.radius || null,
      ...modifierLabels,
    ]);

    return bits.join(" · ") || null;
  }

  const bits = dedupeLabels([
    line.pricingSnapshot.selectedOptionLabel,
    ...modifierLabels,
  ]);

  return bits.join(" · ") || null;
}

function buildPrintableOrderLine(line: CartItem): PrintableOrderLine {
  return {
    key: line.key,
    serviceName: line.serviceNameSnapshot,
    contextLabel: buildPrintableLineContext(line),
    detailsLabel:
      line.serviceId === "main-package"
        ? "снятие/установка, демонтаж/монтаж автошины, балансировка колеса"
        : null,
    quantityLabel: String(line.quantity),
    unitPriceLabel: formatPrice(line.unitPrice),
    totalPriceLabel: formatPrice(line.unitPrice * line.quantity),
  };
}

function getPrintableAccountLabel(
  paymentLabel: string,
  accountLabel: string | null | undefined,
) {
  if (!accountLabel) {
    return null;
  }

  const normalizeValue = (value: string) =>
    value
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("ru-RU");
  const normalizedPayment = normalizeValue(paymentLabel);
  const normalizedAccount = normalizeValue(accountLabel);

  if (
    normalizedPayment === "менеджер" ||
    normalizedPayment === "расчетный счет"
  ) {
    return null;
  }

  if (!normalizedAccount || normalizedAccount === normalizedPayment) {
    return null;
  }

  const paymentAliases = new Set(
    normalizedPayment.includes("налич")
      ? ["наличные", "наличный расчет", "наличный расчёт", "касса"]
      : normalizedPayment.includes("карт") || normalizedPayment.includes("безнал")
        ? ["карта", "безнал", "безналичный расчет", "безналичный расчёт"]
        : normalizedPayment.includes("перев")
          ? ["перевод", "банковский перевод"]
          : [normalizedPayment],
  );

  if (paymentAliases.has(normalizedAccount)) {
    return null;
  }

  return accountLabel;
}

export function buildPrintableOrderDocument(input: {
  order: DemoOrder;
  detail: DemoOrderDetail;
  branch: DemoBranchSummary;
  profile: DemoBranchProfile | null;
  printSettings: DemoBranchPrintSettings | null;
}): PrintableOrderDocument {
  const { order, detail, branch, profile, printSettings } = input;
  const receiptTitle =
    printSettings?.receiptTitle?.trim() ||
    profile?.displayName?.trim() ||
    branch.displayName;
  const locationLabel =
    printSettings?.showAddress === false
      ? null
      : profile?.address?.trim() || branch.address || null;
  const branchPhone =
    printSettings?.showPhone === false
      ? null
      : profile?.phone?.trim() || branch.phone || null;
  const paymentLabel = detail.paymentLabel || "Не указано";

  return {
    id: order.id,
    number: order.number,
    dateLabel: detail.completedAt || detail.createdAt,
    receiptTitle,
    locationLabel,
    branchPhone,
    clientName: getClientDisplayName(order),
    clientPhone: order.client.phone || "Не указан",
    clientInn:
      order.client.clientKind === "legal" && order.client.inn?.trim()
        ? order.client.inn.trim()
        : null,
    carLabel: buildCarLabel(order),
    plateNumber: formatPlateForDisplay(order.client.plateNumber) || "Не указан",
    paymentLabel,
    accountLabel: getPrintableAccountLabel(
      paymentLabel,
      detail.paymentAccountLabel ?? order.payment.accountNameSnapshot,
    ),
    paymentNote: order.payment.note?.trim() || null,
    executorLabel: detail.executorLabel || "Не указан",
    shiftLabel: detail.shiftLabel || "Не указана",
    totalLabel: formatPrice(order.totals.total),
    recommendationText: order.note.trim() || null,
    footerNote: printSettings?.footerNote?.trim() || null,
    lines:
      order.lines.length > 0
        ? order.lines.map((line) => buildPrintableOrderLine(line))
        : [
            {
              key: `${order.id}-empty`,
              serviceName: "Услуги по заказу не сохранены",
              contextLabel: null,
              detailsLabel: null,
              quantityLabel: "—",
              unitPriceLabel: "—",
              totalPriceLabel: formatPrice(order.payment.paidAmount ?? order.totals.total),
            },
          ],
  };
}

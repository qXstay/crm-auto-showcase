import type { OrderDraft } from "@/features/order-draft/types";

const ORDER_DRAFT_STORAGE_KEY = "pegas-order-draft";

const EMPTY_ORDER_DRAFT: OrderDraft = {
  mode: "anonymous",
  selectedClientId: "",
  clientName: "",
  phone: "",
  carBrand: "",
  carModel: "",
  plateNumber: "",
  preferredRadius: "",
};

export function getOrderDraft(): OrderDraft | null {
  if (typeof window === "undefined") {
    return null;
  }

  const rawValue = window.localStorage.getItem(ORDER_DRAFT_STORAGE_KEY);

  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<OrderDraft>;

    return {
      ...EMPTY_ORDER_DRAFT,
      ...parsed,
    };
  } catch {
    return null;
  }
}

export function setOrderDraft(draft: OrderDraft): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(ORDER_DRAFT_STORAGE_KEY, JSON.stringify(draft));
}

export function clearOrderDraft(): void {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(ORDER_DRAFT_STORAGE_KEY);
}

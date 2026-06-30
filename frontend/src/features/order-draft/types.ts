import type { Radius } from "@/features/pricing/types";

export type OrderDraftMode = "existing" | "new" | "anonymous";

export type OrderDraft = {
  mode: OrderDraftMode;
  clientKind?: "individual" | "legal";
  inn?: string;
  organizationName?: string;
  contractNumber?: string;
  selectedClientId: string;
  clientName: string;
  phone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
  preferredRadius: Radius | "";
};

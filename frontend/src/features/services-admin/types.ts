import type {
  ModifierPriceMatrixMap,
  PriceMatrix,
  PricingMode,
  PricingModifierType,
  PricingPriceType,
  SalaryRuleType,
} from "@/features/pricing/types";

export type ServicesAdminPriceType = PricingPriceType;

export type ServicesAdminServiceType = "base" | "additional";

export type ServicesAdminSalaryRuleType = SalaryRuleType;

export type ServicesAdminPriceMatrix = PriceMatrix;

export type ServicesAdminPriceBand = {
  label: string;
  radiusLabels: string[];
  price: number;
};

export type ServicesAdminModifierEnabledMap = Record<PricingModifierType, boolean>;

export type ServicesAdminModifierExplicitlyClearedMap = Record<
  PricingModifierType,
  boolean
>;

export type ServicesAdminService = {
  id: string;
  categoryId: string;
  name: string;
  serviceType: ServicesAdminServiceType;
  pricingMode: PricingMode;
  priceType: ServicesAdminPriceType;
  fixedPrice: number;
  priceFrom: number;
  matrixPrices: ServicesAdminPriceMatrix;
  modifierMatrixPrices: ModifierPriceMatrixMap;
  modifierEnabled: ServicesAdminModifierEnabledMap;
  modifierExplicitlyCleared: ServicesAdminModifierExplicitlyClearedMap;
  displayPriceLabel: string;
  displayPriceLabelOverride?: string;
  priceBands: ServicesAdminPriceBand[];
  salaryRuleType: ServicesAdminSalaryRuleType;
  salaryPercent: number;
  salaryFixedAmount: number;
  salaryPerUnitAmount: number;
  usesCostPrice: boolean;
  costPrice: number;
  reducedEmployeePercentEnabled: boolean;
  reducedEmployeePercentValue: number;
};

export type ServicesAdminCategory = {
  id: string;
  name: string;
  services: ServicesAdminService[];
};

export type DemoServicesStore = {
  categories: ServicesAdminCategory[];
};

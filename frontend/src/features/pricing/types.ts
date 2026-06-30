export type VehicleTypeId =
  | "passenger"
  | "suv"
  | "offroad"
  | "commercial";

export type Radius =
  | "R13"
  | "R14"
  | "R15"
  | "R16"
  | "R17"
  | "R18"
  | "R19"
  | "R20"
  | "R21"
  | "R22"
  // R23 is currently exposed for offroad only, with runtime fallback to the R22 price band
  // where legacy matrices still do not carry a dedicated R23 row.
  | "R23";

export type PricingPriceType = "matrix" | "fixed" | "from" | "manual";

export type PricingMode = "package" | "service" | "product";

export type PricingModifierType = "low_profile" | "runflat";

export type PriceMatrix = Record<Radius, Record<VehicleTypeId, number>>;

export type ModifierPriceMatrixMap = Partial<
  Record<PricingModifierType, PriceMatrix>
>;

export type PricingContext = {
  vehicleType: VehicleTypeId;
  radius: Radius;
  lowProfile: boolean;
  runflat: boolean;
};

export type SalaryRuleType =
  | "percent_of_work"
  | "percent_of_profit"
  | "fixed"
  | "per_unit";

export type SalaryRuleSnapshot = {
  ruleType: SalaryRuleType;
  percent: number;
  fixedAmount: number;
  perUnitAmount: number;
  usesCostPrice: boolean;
  reducedEmployeePercentEnabled: boolean;
  reducedEmployeePercentValue: number;
};

export type PricingInputKind = "none" | "from" | "manual";

export type PricingSelectionMode = "automatic" | "price_band" | "manual_input";

export type PricingOption = {
  label: string;
  price: number;
};

export type PricingSnapshot = {
  source: "services_admin" | "extra_catalog";
  priceType: PricingPriceType;
  pricingMode: PricingMode;
  inputKind: PricingInputKind;
  selectionMode: PricingSelectionMode;
  vehicleType: VehicleTypeId | null;
  radius: Radius | null;
  lowProfile: boolean;
  runflat: boolean;
  appliedModifiers: PricingModifierType[];
  baseUnitPrice: number | null;
  resolvedUnitPrice: number | null;
  displayLabel: string;
  selectedOptionLabel: string | null;
  operatorNote: string | null;
  priceOptions: PricingOption[];
};

export type ResolvedPricing = {
  disabled: boolean;
  unitPrice: number | null;
  displayLabel: string;
  inputKind: PricingInputKind;
  priceOptions: PricingOption[];
  pricingSnapshot: PricingSnapshot;
  salaryRuleSnapshot: SalaryRuleSnapshot | null;
  costPrice: number | null;
};

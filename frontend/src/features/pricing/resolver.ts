import { formatPrice } from "@/features/pricing/config";
import type {
  PriceMatrix,
  PricingContext,
  PricingModifierType,
  PricingOption,
  ResolvedPricing,
  SalaryRuleSnapshot,
} from "@/features/pricing/types";
import type {
  ServicesAdminCategory,
  ServicesAdminService,
} from "@/features/services-admin/types";

const HIDDEN_ORDER_SERVICE_IDS = new Set<string>();
const STAGE22_MATRIX_PAYROLL_CATEGORY_ID = "main";

type Stage22SalaryRuleSnapshot = SalaryRuleSnapshot & {
  stage22PayrollRule?: {
    type: "matrix";
  };
};

function getMatrixValue(
  matrixPrices: PriceMatrix,
  context: Pick<PricingContext, "vehicleType" | "radius">,
) {
  const requestedRow = matrixPrices[context.radius];

  if (requestedRow && typeof requestedRow[context.vehicleType] === "number") {
    return requestedRow[context.vehicleType];
  }

  const fallbackRow = matrixPrices.R22;

  if (fallbackRow && typeof fallbackRow[context.vehicleType] === "number") {
    return fallbackRow[context.vehicleType];
  }

  return 0;
}

function createSalaryRuleSnapshot(
  service: ServicesAdminService,
): SalaryRuleSnapshot {
  const snapshot: Stage22SalaryRuleSnapshot = {
    ruleType: service.salaryRuleType,
    percent: service.salaryPercent,
    fixedAmount: service.salaryFixedAmount,
    perUnitAmount: service.salaryPerUnitAmount,
    usesCostPrice: service.usesCostPrice,
    reducedEmployeePercentEnabled: service.reducedEmployeePercentEnabled,
    reducedEmployeePercentValue: service.reducedEmployeePercentValue,
  };

  if (
    service.categoryId === STAGE22_MATRIX_PAYROLL_CATEGORY_ID &&
    service.salaryRuleType === "percent_of_work"
  ) {
    snapshot.stage22PayrollRule = { type: "matrix" };
  }

  return snapshot;
}

function createPriceOptions(service: ServicesAdminService): PricingOption[] {
  return service.priceBands.map((band) => ({
    label: band.label,
    price: band.price,
  }));
}

function applyMatrixModifiers(
  service: ServicesAdminService,
  basePrice: number,
  context: PricingContext,
) {
  let resolvedPrice = basePrice;
  const appliedModifiers: PricingModifierType[] = [];
  const modifierCandidates: Partial<Record<PricingModifierType, number>> = {};

  const modifierEntries: Array<[PricingModifierType, boolean]> = [
    ["low_profile", context.lowProfile],
    ["runflat", context.runflat],
  ];

  modifierEntries.forEach(([modifierType, enabled]) => {
    if (!enabled) {
      return;
    }

    if (!service.modifierEnabled[modifierType]) {
      return;
    }

    const modifierMatrix = service.modifierMatrixPrices[modifierType];

    if (!modifierMatrix) {
      return;
    }

    const modifierPrice = getMatrixValue(modifierMatrix, context);

    if (modifierPrice <= 0) {
      return;
    }

    const safeModifierPrice = Math.max(basePrice, modifierPrice);

    modifierCandidates[modifierType] = safeModifierPrice;
    resolvedPrice = Math.max(resolvedPrice, safeModifierPrice);

    if (safeModifierPrice > basePrice) {
      appliedModifiers.push(modifierType);
    }
  });

  return {
    resolvedPrice: Math.max(basePrice, resolvedPrice),
    appliedModifiers: Array.from(new Set(appliedModifiers)),
  };
}

export function resolveServicesAdminPrice(
  service: ServicesAdminService,
  context: PricingContext,
): ResolvedPricing {
  const salaryRuleSnapshot = createSalaryRuleSnapshot(service);

  if (service.priceType === "manual") {
    return {
      disabled: false,
      unitPrice: null,
      displayLabel: "Свободная цена",
      inputKind: "manual",
      priceOptions: [],
      pricingSnapshot: {
        source: "services_admin",
        priceType: service.priceType,
        pricingMode: service.pricingMode,
        inputKind: "manual",
        selectionMode: "manual_input",
        vehicleType: null,
        radius: null,
        lowProfile: context.lowProfile,
        runflat: context.runflat,
        appliedModifiers: [],
        baseUnitPrice: null,
        resolvedUnitPrice: null,
        displayLabel: "Свободная цена",
        selectedOptionLabel: null,
        operatorNote: null,
        priceOptions: [],
      },
      salaryRuleSnapshot,
      costPrice: service.usesCostPrice && service.costPrice >= 0 ? service.costPrice : null,
    };
  }

  if (service.priceType === "fixed") {
    return {
      disabled: service.fixedPrice <= 0,
      unitPrice: service.fixedPrice,
      displayLabel: formatPrice(service.fixedPrice),
      inputKind: "none",
      priceOptions: [],
      pricingSnapshot: {
        source: "services_admin",
        priceType: service.priceType,
        pricingMode: service.pricingMode,
        inputKind: "none",
        selectionMode: "automatic",
        vehicleType: null,
        radius: null,
        lowProfile: context.lowProfile,
        runflat: context.runflat,
        appliedModifiers: [],
        baseUnitPrice: service.fixedPrice,
        resolvedUnitPrice: service.fixedPrice,
        displayLabel: formatPrice(service.fixedPrice),
        selectedOptionLabel: null,
        operatorNote: null,
        priceOptions: [],
      },
      salaryRuleSnapshot,
      costPrice: service.usesCostPrice && service.costPrice >= 0 ? service.costPrice : null,
    };
  }

  if (service.priceType === "from") {
    const displayLabel =
      service.displayPriceLabelOverride ?? `от ${formatPrice(service.priceFrom)}`;
    const priceOptions = createPriceOptions(service);

    return {
      disabled: service.priceFrom <= 0,
      unitPrice: service.priceFrom,
      displayLabel,
      inputKind: "from",
      priceOptions,
      pricingSnapshot: {
        source: "services_admin",
        priceType: service.priceType,
        pricingMode: service.pricingMode,
        inputKind: "from",
        selectionMode: "manual_input",
        vehicleType: null,
        radius: null,
        lowProfile: context.lowProfile,
        runflat: context.runflat,
        appliedModifiers: [],
        baseUnitPrice: service.priceFrom,
        resolvedUnitPrice: service.priceFrom,
        displayLabel,
        selectedOptionLabel: null,
        operatorNote: null,
        priceOptions,
      },
      salaryRuleSnapshot,
      costPrice: service.usesCostPrice && service.costPrice >= 0 ? service.costPrice : null,
    };
  }

  const basePrice = getMatrixValue(service.matrixPrices, context);

  if (basePrice <= 0) {
    return {
    disabled: true,
      unitPrice: null,
      displayLabel: "Недоступно",
      inputKind: "none",
      priceOptions: [],
      pricingSnapshot: {
        source: "services_admin",
        priceType: service.priceType,
        pricingMode: service.pricingMode,
        inputKind: "none",
        selectionMode: "automatic",
        vehicleType: context.vehicleType,
        radius: context.radius,
        lowProfile: context.lowProfile,
        runflat: context.runflat,
        appliedModifiers: [],
        baseUnitPrice: basePrice,
        resolvedUnitPrice: null,
        displayLabel: "Недоступно",
        selectedOptionLabel: null,
        operatorNote: null,
        priceOptions: [],
      },
      salaryRuleSnapshot,
      costPrice: service.usesCostPrice && service.costPrice >= 0 ? service.costPrice : null,
    };
  }

  const { resolvedPrice, appliedModifiers } = applyMatrixModifiers(
    service,
    basePrice,
    context,
  );

  return {
    disabled: false,
    unitPrice: resolvedPrice,
    displayLabel: formatPrice(resolvedPrice),
    inputKind: "none",
    priceOptions: [],
    pricingSnapshot: {
      source: "services_admin",
      priceType: service.priceType,
      pricingMode: service.pricingMode,
      inputKind: "none",
      selectionMode: "automatic",
      vehicleType: context.vehicleType,
      radius: context.radius,
      lowProfile: context.lowProfile,
      runflat: context.runflat,
      appliedModifiers,
      baseUnitPrice: basePrice,
      resolvedUnitPrice: resolvedPrice,
      displayLabel: formatPrice(resolvedPrice),
      selectedOptionLabel: null,
      operatorNote: null,
      priceOptions: [],
    },
    salaryRuleSnapshot,
    costPrice: service.usesCostPrice && service.costPrice >= 0 ? service.costPrice : null,
  };
}

export function getOrderServicesByCategory(
  categoryId: string,
  categories: ServicesAdminCategory[],
) {
  const category = categories.find((item) => item.id === categoryId);

  if (!category) {
    return [];
  }

  return category.services.filter((service) => !HIDDEN_ORDER_SERVICE_IDS.has(service.id));
}

import { RADII, VEHICLE_TYPES, formatPrice } from "@/features/pricing/config";
import type {
  ModifierPriceMatrixMap,
  PricingModifierType,
  VehicleTypeId,
} from "@/features/pricing/types";
import type {
  ServicesAdminCategory,
  ServicesAdminModifierEnabledMap,
  ServicesAdminModifierExplicitlyClearedMap,
  ServicesAdminPriceBand,
  ServicesAdminPriceMatrix,
  ServicesAdminPriceType,
  ServicesAdminSalaryRuleType,
  ServicesAdminService,
  ServicesAdminServiceType,
} from "@/features/services-admin/types";
import initialCatalog from "./initial-catalog.json";


export const SETTINGS_SECTIONS = [
  "Услуги",
  "Зарплата",
  "Клиенты",
  "Хранение",
] as const;

export const SERVICE_TYPE_OPTIONS: Array<{
  value: ServicesAdminServiceType;
  label: string;
}> = [
  { value: "base", label: "Базовая услуга" },
  { value: "additional", label: "Дополнительная услуга" },
];

export const PRICE_TYPE_OPTIONS: Array<{
  value: ServicesAdminPriceType;
  label: string;
}> = [
  { value: "matrix", label: "Матричная" },
  { value: "fixed", label: "Фиксированная" },
  { value: "from", label: "Цена от" },
  { value: "manual", label: "Свободная цена" },
];

export const SALARY_RULE_OPTIONS: Array<{
  value: ServicesAdminSalaryRuleType;
  label: string;
}> = [
  { value: "percent_of_work", label: "% от работ" },
  { value: "percent_of_profit", label: "% от прибыли" },
  { value: "fixed", label: "Фиксированная сумма" },
  { value: "per_unit", label: "Начисление за штуку" },
];

export const EMPLOYEE_PERCENT_OPTIONS = [10, 15, 20, 25, 30, 35, 40, 50, 100];

type ServiceFactoryOptions = {
  pricingMode?: ServicesAdminService["pricingMode"];
  fixedPrice?: number;
  priceFrom?: number;
  matrixPrices?: ServicesAdminPriceMatrix;
  modifierMatrixPrices?: ModifierPriceMatrixMap;
  modifierEnabled?: Partial<ServicesAdminModifierEnabledMap>;
  modifierExplicitlyCleared?: Partial<ServicesAdminModifierExplicitlyClearedMap>;
  displayPriceLabelOverride?: string;
  priceBands?: ServicesAdminPriceBand[];
  salaryRuleType?: ServicesAdminSalaryRuleType;
  salaryPercent?: number;
  salaryFixedAmount?: number;
  salaryPerUnitAmount?: number;
  usesCostPrice?: boolean;
  costPrice?: number;
  reducedEmployeePercentEnabled?: boolean;
  reducedEmployeePercentValue?: number;
};

function buildMatrix(values: Record<VehicleTypeId, number[]>): ServicesAdminPriceMatrix {
  return RADII.reduce((accumulator, radius, index) => {
    const passengerValue = values.passenger[index] ?? values.passenger[values.passenger.length - 1] ?? 0;
    const suvValue = values.suv[index] ?? values.suv[values.suv.length - 1] ?? 0;
    const offroadValue = values.offroad[index] ?? values.offroad[values.offroad.length - 1] ?? 0;
    const commercialValue =
      values.commercial[index] ?? values.commercial[values.commercial.length - 1] ?? 0;

    accumulator[radius] = {
      passenger: passengerValue,
      suv: suvValue,
      offroad: offroadValue,
      commercial: commercialValue,
    };

    return accumulator;
  }, {} as ServicesAdminPriceMatrix);
}

function buildSharedMatrix(values: number[], commercialValues?: number[]) {
  return buildMatrix({
    passenger: values,
    suv: values,
    offroad: values,
    commercial: commercialValues ?? values,
  });
}

export function createEmptyPriceMatrix(): ServicesAdminPriceMatrix {
  return RADII.reduce((accumulator, radius) => {
    accumulator[radius] = {
      passenger: 0,
      suv: 0,
      offroad: 0,
      commercial: 0,
    };

    return accumulator;
  }, {} as ServicesAdminPriceMatrix);
}

function getSafeMatrixRow(
  matrixPrices: Partial<ServicesAdminPriceMatrix> | undefined,
  radius: (typeof RADII)[number],
) {
  const requestedRow = matrixPrices?.[radius];

  if (requestedRow) {
    return {
      passenger: requestedRow.passenger ?? 0,
      suv: requestedRow.suv ?? 0,
      offroad: requestedRow.offroad ?? 0,
      commercial: requestedRow.commercial ?? 0,
    };
  }

  const fallbackRow = matrixPrices?.R22;

  if (fallbackRow) {
    return {
      passenger: fallbackRow.passenger ?? 0,
      suv: fallbackRow.suv ?? 0,
      offroad: fallbackRow.offroad ?? 0,
      commercial: fallbackRow.commercial ?? 0,
    };
  }

  return {
    passenger: 0,
    suv: 0,
    offroad: 0,
    commercial: 0,
  };
}

export function clonePriceMatrix(matrixPrices: ServicesAdminPriceMatrix): ServicesAdminPriceMatrix {
  return RADII.reduce((accumulator, radius) => {
    accumulator[radius] = getSafeMatrixRow(matrixPrices, radius);

    return accumulator;
  }, {} as ServicesAdminPriceMatrix);
}

function createEmptyModifierEnabledMap(): ServicesAdminModifierEnabledMap {
  return {
    low_profile: false,
    runflat: false,
  };
}

function createEmptyModifierExplicitlyClearedMap(): ServicesAdminModifierExplicitlyClearedMap {
  return {
    low_profile: false,
    runflat: false,
  };
}

function normalizeModifierEnabled(
  modifierMatrixPrices: ModifierPriceMatrixMap,
  modifierEnabled?: Partial<ServicesAdminModifierEnabledMap>,
): ServicesAdminModifierEnabledMap {
  const normalized = createEmptyModifierEnabledMap();

  (["low_profile", "runflat"] satisfies PricingModifierType[]).forEach((modifierType) => {
    normalized[modifierType] =
      typeof modifierEnabled?.[modifierType] === "boolean"
        ? modifierEnabled[modifierType]
        : Boolean(modifierMatrixPrices[modifierType]);
  });

  return normalized;
}

function normalizeModifierExplicitlyCleared(
  modifierExplicitlyCleared?: Partial<ServicesAdminModifierExplicitlyClearedMap>,
): ServicesAdminModifierExplicitlyClearedMap {
  const normalized = createEmptyModifierExplicitlyClearedMap();

  (["low_profile", "runflat"] satisfies PricingModifierType[]).forEach((modifierType) => {
    normalized[modifierType] = Boolean(modifierExplicitlyCleared?.[modifierType]);
  });

  return normalized;
}

function cloneModifierMatrixMap(
  modifierMatrixPrices: ModifierPriceMatrixMap,
): ModifierPriceMatrixMap {
  return {
    low_profile: modifierMatrixPrices.low_profile
      ? clonePriceMatrix(modifierMatrixPrices.low_profile)
      : undefined,
    runflat: modifierMatrixPrices.runflat
      ? clonePriceMatrix(modifierMatrixPrices.runflat)
      : undefined,
  };
}

function isZeroPriceMatrix(matrixPrices: ServicesAdminPriceMatrix) {
  return RADII.every((radius) =>
    VEHICLE_TYPES.every((vehicleType) => getSafeMatrixRow(matrixPrices, radius)[vehicleType.id] <= 0),
  );
}

export function buildDisplayPriceLabel(service: Pick<
  ServicesAdminService,
  "priceType" | "fixedPrice" | "priceFrom" | "matrixPrices" | "displayPriceLabelOverride"
>): string {
  if (service.displayPriceLabelOverride) {
    return service.displayPriceLabelOverride;
  }

  if (service.priceType === "manual") {
    return "свободная цена";
  }

  if (service.priceType === "fixed") {
    return formatPrice(service.fixedPrice);
  }

  if (service.priceType === "from") {
    return `от ${formatPrice(service.priceFrom)}`;
  }

  const values = RADII.flatMap((radius) =>
    Object.values(getSafeMatrixRow(service.matrixPrices, radius)).filter((value) => value > 0),
  );

  if (values.length === 0) {
    return `от ${formatPrice(0)} до ${formatPrice(0)}`;
  }

  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);

  if (minValue === maxValue) {
    return formatPrice(minValue);
  }

  return `от ${formatPrice(minValue)} до ${formatPrice(maxValue)}`;
}

export function normalizeService(
  categoryId: string,
  service: ServicesAdminService,
): ServicesAdminService {
  const normalizedModifierExplicitlyCleared = normalizeModifierExplicitlyCleared(
    service.modifierExplicitlyCleared,
  );
  const restoredModifierMatrixPrices = restoreDefaultModifierMatrices(
    service.id,
    service.modifierMatrixPrices,
    normalizedModifierExplicitlyCleared,
  );

  const normalized: ServicesAdminService = {
    ...service,
    categoryId,
    matrixPrices: clonePriceMatrix(service.matrixPrices),
    modifierMatrixPrices: restoredModifierMatrixPrices,
    modifierEnabled: normalizeModifierEnabled(
      restoredModifierMatrixPrices,
      service.modifierEnabled,
    ),
    modifierExplicitlyCleared: normalizedModifierExplicitlyCleared,
    priceBands: service.priceBands.map((band) => ({
      ...band,
      radiusLabels: [...band.radiusLabels],
    })),
    displayPriceLabel: "",
  };

  normalized.displayPriceLabel = buildDisplayPriceLabel(normalized);

  return normalized;
}

export function cloneService(service: ServicesAdminService): ServicesAdminService {
  return {
    ...service,
    matrixPrices: clonePriceMatrix(service.matrixPrices),
    modifierMatrixPrices: {
      low_profile: service.modifierMatrixPrices.low_profile
        ? clonePriceMatrix(service.modifierMatrixPrices.low_profile)
        : undefined,
      runflat: service.modifierMatrixPrices.runflat
        ? clonePriceMatrix(service.modifierMatrixPrices.runflat)
        : undefined,
    },
    modifierEnabled: {
      ...service.modifierEnabled,
    },
    modifierExplicitlyCleared: {
      ...(service.modifierExplicitlyCleared ?? createEmptyModifierExplicitlyClearedMap()),
    },
    priceBands: service.priceBands.map((band) => ({
      ...band,
      radiusLabels: [...band.radiusLabels],
    })),
  };
}

export function cloneCategory(category: ServicesAdminCategory): ServicesAdminCategory {
  return {
    ...category,
    services: category.services.map(cloneService),
  };
}

function createService(
  categoryId: string,
  id: string,
  name: string,
  serviceType: ServicesAdminServiceType,
  priceType: ServicesAdminPriceType,
  options: ServiceFactoryOptions = {},
): ServicesAdminService {
  return normalizeService(categoryId, {
    id,
    categoryId,
    name,
    serviceType,
    pricingMode: options.pricingMode ?? "service",
    priceType,
    fixedPrice: options.fixedPrice ?? 0,
    priceFrom: options.priceFrom ?? 0,
    matrixPrices: options.matrixPrices ?? createEmptyPriceMatrix(),
    modifierMatrixPrices: options.modifierMatrixPrices ?? {},
    modifierEnabled: normalizeModifierEnabled(
      options.modifierMatrixPrices ?? {},
      options.modifierEnabled,
    ),
    modifierExplicitlyCleared: normalizeModifierExplicitlyCleared(
      options.modifierExplicitlyCleared,
    ),
    displayPriceLabel: "",
    displayPriceLabelOverride: options.displayPriceLabelOverride,
    priceBands: options.priceBands ?? [],
    salaryRuleType: options.salaryRuleType ?? "percent_of_work",
    salaryPercent: options.salaryPercent ?? 35,
    salaryFixedAmount: options.salaryFixedAmount ?? 0,
    salaryPerUnitAmount: options.salaryPerUnitAmount ?? 0,
    usesCostPrice: options.usesCostPrice ?? false,
    costPrice: options.costPrice ?? 0,
    reducedEmployeePercentEnabled: options.reducedEmployeePercentEnabled ?? false,
    reducedEmployeePercentValue: options.reducedEmployeePercentValue ?? 30,
  });
}

const mainPackageMatrix = buildMatrix({
  passenger: [2520, 2520, 2680, 2880, 3440, 3680, 4160, 4160, 0, 0, 0],
  suv: [2880, 2880, 2880, 3200, 3520, 3920, 4280, 4280, 0, 0, 0],
  offroad: [0, 0, 3320, 3640, 3840, 4200, 4720, 4720, 5360, 5360, 5360],
  commercial: [4000, 4000, 4000, 4000, 0, 0, 0, 0, 0, 0, 0],
});

const installationMatrix = buildMatrix({
  passenger: [230, 230, 230, 240, 250, 280, 310, 310, 360, 360, 0],
  suv: [250, 250, 250, 265, 290, 315, 360, 360, 400, 400, 0],
  offroad: [0, 0, 290, 310, 335, 370, 400, 400, 450, 450, 450],
  commercial: [325, 325, 325, 325, 0, 0, 0, 0, 0, 0, 0],
});

const demountMatrix = buildMatrix({
  passenger: [100, 100, 120, 130, 185, 185, 210, 210, 0, 0, 0],
  suv: [120, 120, 120, 145, 165, 190, 180, 180, 0, 0, 0],
  offroad: [0, 0, 145, 170, 180, 190, 215, 215, 250, 250, 250],
  commercial: [170, 170, 170, 170, 0, 0, 0, 0, 0, 0, 0],
});

const mountMatrix = buildMatrix({
  passenger: [100, 100, 120, 130, 185, 185, 210, 210, 0, 0, 0],
  suv: [120, 120, 120, 145, 165, 190, 180, 180, 0, 0, 0],
  offroad: [0, 0, 145, 170, 180, 190, 215, 215, 250, 250, 250],
  commercial: [170, 170, 170, 170, 0, 0, 0, 0, 0, 0, 0],
});

const balancingMatrix = buildMatrix({
  passenger: [200, 200, 200, 220, 240, 270, 310, 310, 350, 350, 0],
  suv: [230, 230, 230, 245, 260, 285, 350, 350, 380, 380, 0],
  offroad: [0, 0, 250, 260, 265, 300, 350, 350, 390, 390, 390],
  commercial: [335, 335, 335, 335, 0, 0, 0, 0, 0, 0, 0],
});

const washingMatrix = buildMatrix({
  passenger: [60, 60, 60, 80, 80, 90, 90, 90, 110, 110, 0],
  suv: [80, 80, 80, 80, 90, 90, 110, 110, 110, 110, 0],
  offroad: [0, 0, 110, 110, 110, 130, 150, 150, 150, 150, 150],
  commercial: [150, 150, 150, 150, 0, 0, 0, 0, 0, 0, 0],
});

const castDiskMatrix = buildSharedMatrix(
  [1400, 1400, 1500, 1800, 2100, 2500, 3000, 3500, 4000, 4000, 4000],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
);

const castDiskEightMatrix = buildSharedMatrix(
  [2000, 2000, 2400, 2600, 3000, 3600, 4000, 5000, 5600, 5600, 5600],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
);

const forgedDiskMatrix = buildSharedMatrix(
  [1700, 1700, 2000, 2400, 2600, 3300, 3900, 4500, 5200, 5200, 5200],
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
);

const wheelOptimizationMatrix = buildMatrix({
  passenger: [80, 80, 90, 90, 100, 100, 150, 170, 200, 200],
  suv: [80, 80, 90, 90, 100, 100, 150, 170, 200, 200],
  offroad: [80, 80, 90, 90, 100, 100, 150, 170, 200, 200],
  commercial: [220, 220, 220, 220, 220, 220, 220, 220, 220, 220],
});

const lowProfilePackageMatrix = buildMatrix({
  passenger: [0, 0, 0, 3360, 3560, 3680, 4160, 4160, 5120, 5120, 0],
  suv: [0, 0, 0, 3760, 4120, 4480, 5120, 5120, 5680, 5680, 0],
  offroad: [0, 0, 0, 4120, 4320, 4680, 5200, 5200, 5760, 5760, 5760],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const runFlatPackageMatrix = buildMatrix({
  passenger: [0, 0, 0, 3760, 3920, 4160, 4640, 4640, 5600, 5600, 0],
  suv: [0, 0, 0, 0, 4600, 4880, 5600, 5600, 6160, 6160, 0],
  offroad: [0, 0, 0, 4120, 4320, 4680, 5200, 5200, 5760, 5760, 5760],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const lowProfileDemountMatrix = buildMatrix({
  passenger: [0, 0, 0, 190, 200, 0, 0, 0, 285, 285, 0],
  suv: [0, 0, 0, 215, 240, 260, 285, 285, 320, 320, 0],
  offroad: [0, 0, 0, 230, 240, 250, 275, 275, 300, 300, 300],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const runFlatDemountMatrix = buildMatrix({
  passenger: [0, 0, 0, 240, 245, 245, 270, 270, 345, 345, 0],
  suv: [0, 0, 0, 0, 300, 310, 345, 345, 380, 380, 0],
  offroad: [0, 0, 0, 230, 240, 250, 275, 275, 300, 300, 300],
  commercial: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
});

const lowProfileMountMatrix = clonePriceMatrix(lowProfileDemountMatrix);
const runFlatMountMatrix = clonePriceMatrix(runFlatDemountMatrix);

const DEFAULT_MODIFIER_MATRICES_BY_SERVICE_ID: Partial<
  Record<string, ModifierPriceMatrixMap>
> = {
  "main-package": {
    low_profile: lowProfilePackageMatrix,
    runflat: runFlatPackageMatrix,
  },
  demount: {
    low_profile: lowProfileDemountMatrix,
    runflat: runFlatDemountMatrix,
  },
  mount: {
    low_profile: lowProfileMountMatrix,
    runflat: runFlatMountMatrix,
  },
};

function restoreDefaultModifierMatrices(
  serviceId: string,
  modifierMatrixPrices: ModifierPriceMatrixMap,
  modifierExplicitlyCleared: ServicesAdminModifierExplicitlyClearedMap,
): ModifierPriceMatrixMap {
  const restored = cloneModifierMatrixMap(modifierMatrixPrices);
  const defaults = DEFAULT_MODIFIER_MATRICES_BY_SERVICE_ID[serviceId];

  (["low_profile", "runflat"] satisfies PricingModifierType[]).forEach((modifierType) => {
    if (modifierExplicitlyCleared[modifierType]) {
      if (!restored[modifierType]) {
        restored[modifierType] = createEmptyPriceMatrix();
      }

      return;
    }

    if (!defaults?.[modifierType]) {
      return;
    }

    const currentMatrix = restored[modifierType];
    const shouldRestore = !currentMatrix || isZeroPriceMatrix(currentMatrix);

    if (!shouldRestore) {
      return;
    }

    restored[modifierType] = clonePriceMatrix(defaults[modifierType]);
  });

  return restored;
}

export function getDefaultModifierMatrix(
  serviceId: string,
  modifierType: PricingModifierType,
) {
  const matrix = DEFAULT_MODIFIER_MATRICES_BY_SERVICE_ID[serviceId]?.[modifierType];

  return matrix ? clonePriceMatrix(matrix) : null;
}

const sensorMatrix = buildMatrix({
  passenger: [0, 0, 800, 1200, 1400, 1600, 1800, 2200, 2500, 2500],
  suv: [0, 0, 900, 1300, 1500, 1700, 1900, 2300, 2500, 2500],
  offroad: [0, 0, 1000, 1400, 1600, 1800, 2000, 2400, 2500, 2500],
  commercial: [0, 0, 1000, 1400, 1600, 1800, 2000, 2400, 2500, 2500],
});

export const INITIAL_SERVICE_CATEGORIES: ServicesAdminCategory[] = initialCatalog as ServicesAdminCategory[];

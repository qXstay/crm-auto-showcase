import {
  GENERATED_VEHICLE_CATALOG,
  type VehicleCatalogMake,
} from "@/features/orders/generated-vehicle-catalog";

const PINNED_NO_NAME_MAKE: VehicleCatalogMake = {
  makeId: "PINNED_NO_NAME",
  makeName: "Без имени",
  makeDisplayName: "Без имени",
  makeSearchAliases: ["без имени", "no name", "noname", "без"],
  models: [],
};

const PINNED_CHINESE_MAKE: VehicleCatalogMake = {
  makeId: "PINNED_CHINESE",
  makeName: "Китаец",
  makeDisplayName: "Китаец",
  makeSearchAliases: ["китаец", "китай", "china", "chinese"],
  models: [],
};

const PINNED_VEHICLE_MAKES = [PINNED_NO_NAME_MAKE, PINNED_CHINESE_MAKE] as const;
const VEHICLE_MAKE_CATALOG = [...PINNED_VEHICLE_MAKES, ...GENERATED_VEHICLE_CATALOG];

function normalizeVehicleLookupValue(value: string) {
  return value.trim().toLowerCase();
}

function matchesCatalogValue(query: string, ...values: Array<string | null | undefined>) {
  const normalizedQuery = normalizeVehicleLookupValue(query);

  if (!normalizedQuery) {
    return true;
  }

  return values.some((value) =>
    normalizeVehicleLookupValue(value ?? "").includes(normalizedQuery),
  );
}

function resolveVehicleMake(value: string): VehicleCatalogMake | null {
  const normalizedValue = normalizeVehicleLookupValue(value);

  if (!normalizedValue) {
    return null;
  }

  return (
    VEHICLE_MAKE_CATALOG.find((make) =>
      [make.makeId, make.makeName, make.makeDisplayName, ...make.makeSearchAliases].some(
        (candidate) => normalizeVehicleLookupValue(candidate) === normalizedValue,
      ),
    ) ?? null
  );
}

const VEHICLE_MAKE_LABELS = VEHICLE_MAKE_CATALOG.map((make) => make.makeDisplayName);

export function getVehicleMakeOptions(query: string) {
  return VEHICLE_MAKE_CATALOG
    .filter((make) =>
      matchesCatalogValue(
        query,
        make.makeDisplayName,
        make.makeName,
        make.makeId,
        ...make.makeSearchAliases,
      ),
    )
    .map((make) => make.makeDisplayName);
}

export function resolveVehicleMakeLabel(value: string) {
  return resolveVehicleMake(value)?.makeDisplayName ?? null;
}

export function getVehicleModelOptions(makeValue: string, query: string) {
  const resolvedMake = resolveVehicleMake(makeValue);

  if (!resolvedMake) {
    return [];
  }

  return resolvedMake.models
    .filter((model) =>
      matchesCatalogValue(
        query,
        model.modelDisplayName,
        model.modelName,
        model.modelId,
        ...model.modelSearchAliases,
      ),
    )
    .map((model) => model.modelDisplayName);
}

export function getVehicleMakeCatalogSize() {
  return VEHICLE_MAKE_LABELS.length;
}

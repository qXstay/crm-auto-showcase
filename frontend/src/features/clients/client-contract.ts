export type ClientKind = "individual" | "legal";

type ClientContractInput = {
  clientKind?: ClientKind | null;
  fullName?: string | null;
  firstName?: string | null;
  phone?: string | null;
  carBrand?: string | null;
  carModel?: string | null;
  plateNumber?: string | null;
  organizationName?: string | null;
};

export const CLIENT_NAME_FALLBACK = "Клиент без имени";
export const PLATE_ALLOWED_LETTERS = ["А", "В", "Е", "К", "М", "Н", "О", "Р", "С", "Т", "У", "Х"] as const;
export const PLATE_ALLOWED_NUMBERS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;
export const RUSSIAN_PLATE_BODY_LENGTH = 6;
export const RUSSIAN_PLATE_REGION_MAX_LENGTH = 3;
export const RUSSIAN_PLATE_REGION_REQUIRED_MESSAGE = "Укажите регион номера.";

const RUSSIAN_PLATE_PATTERN = /^([АВЕКМНОРСТУХ])(\d{3})([АВЕКМНОРСТУХ]{2})(\d{2,3})$/u;

const LATIN_TO_CYRILLIC_PLATE_LETTER: Record<string, string> = {
  A: "А",
  B: "В",
  E: "Е",
  K: "К",
  M: "М",
  H: "Н",
  O: "О",
  P: "Р",
  C: "С",
  T: "Т",
  Y: "У",
  X: "Х",
};

const PLATE_ALLOWED_SYMBOLS = new Set<string>([
  ...PLATE_ALLOWED_LETTERS,
  ...PLATE_ALLOWED_NUMBERS,
]);

export type ClientContractState = {
  clientKind: ClientKind;
  firstName: string;
  phone: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
  organizationName: string;
  hasVehicleIdentity: boolean;
  hasContactMinimumRequiredFields: boolean;
  hasOrderMinimumRequiredFields: boolean;
  hasCreateClientMinimumRequiredFields: boolean;
};

export type SamePlateVehicleDuplicateReason =
  | "same_vehicle_identity"
  | "same_plate_different_vehicle_requires_confirmation"
  | "same_plate_vehicle_identity_ambiguous_requires_confirmation";

type VehicleIdentityInput = {
  carBrand?: string | null;
  carModel?: string | null;
  brand?: string | null;
  model?: string | null;
  plateNumber?: string | null;
};

export function sanitizeClientKind(value: string | null | undefined): ClientKind {
  return value === "legal" ? "legal" : "individual";
}

export function normalizePhone(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  const localDigits =
    digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))
      ? digits.slice(1)
      : digits.length > 10
        ? digits.slice(-10)
        : digits;

  if (localDigits.length !== 10) {
    return "";
  }

  return `+7 ${localDigits.slice(0, 3)} ${localDigits.slice(3, 6)}-${localDigits.slice(6, 8)}-${localDigits.slice(8, 10)}`;
}

export function normalizeInn(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "").slice(0, 12);
}

export function validateInn(value: string | null | undefined) {
  const inn = normalizeInn(value);

  return !inn || inn.length === 10 || inn.length === 12;
}

export function normalizeClientFullName(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

export function parseClientFullName(value: string | null | undefined) {
  const fullName = normalizeClientFullName(value);
  const parts = fullName.split(" ").filter(Boolean);

  if (parts.length === 0) {
    return {
      fullName: "",
      firstName: "",
      lastName: "",
      middleName: "",
    };
  }

  if (parts.length === 1) {
    return {
      fullName,
      firstName: parts[0] ?? "",
      lastName: "",
      middleName: "",
    };
  }

  if (parts.length === 2) {
    return {
      fullName,
      firstName: parts[0] ?? "",
      lastName: parts[1] ?? "",
      middleName: "",
    };
  }

  return {
    fullName,
    firstName: parts[1] ?? "",
    lastName: parts[0] ?? "",
    middleName: parts.slice(2).join(" "),
  };
}

export function formatClientFullName(input: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
}) {
  const fullName = normalizeClientFullName(input.fullName);

  if (fullName) {
    return fullName;
  }

  return [input.firstName, input.lastName, input.middleName]
    .map((value) => normalizeClientFullName(value))
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function normalizePlate(value: string | null | undefined) {
  return Array.from((value ?? "").toLocaleUpperCase("ru-RU"))
    .map((symbol) => LATIN_TO_CYRILLIC_PLATE_LETTER[symbol] ?? symbol)
    .filter((symbol) => PLATE_ALLOWED_SYMBOLS.has(symbol))
    .join("");
}

export function parseRussianPlateParts(value: string | null | undefined) {
  const normalized = normalizePlate(value);
  const body = normalized.slice(0, RUSSIAN_PLATE_BODY_LENGTH);
  const region = normalized
    .slice(RUSSIAN_PLATE_BODY_LENGTH)
    .replace(/\D/g, "")
    .slice(0, RUSSIAN_PLATE_REGION_MAX_LENGTH);

  return {
    body,
    region,
    normalized: `${body}${region}`,
  };
}

export function composeRussianPlate(body: string, region: string) {
  const normalizedBody = normalizePlate(body).slice(0, RUSSIAN_PLATE_BODY_LENGTH);
  const normalizedRegion = normalizePlate(region)
    .replace(/\D/g, "")
    .slice(0, RUSSIAN_PLATE_REGION_MAX_LENGTH);

  return `${normalizedBody}${normalizedRegion}`;
}

export function isCompleteRussianPlate(value: string | null | undefined) {
  const normalized = normalizePlate(value);
  return normalized.length > 0;
}

export function isRussianPlateBodyWithoutRegion(value?: unknown) {
  if (value) {
    // no-op
  }
  return false;
}

export function normalizeVehicleIdentityPart(value: string | null | undefined) {
  return normalizeClientFullName(value)
    .normalize("NFKC")
    .toLocaleUpperCase("ru-RU");
}

export function getNormalizedVehicleIdentity(input: VehicleIdentityInput) {
  return {
    brand: normalizeVehicleIdentityPart(input.carBrand ?? input.brand),
    model: normalizeVehicleIdentityPart(input.carModel ?? input.model),
    plateNumber: normalizePlate(input.plateNumber),
  };
}

export function isCompleteVehicleIdentity(input: VehicleIdentityInput) {
  const identity = getNormalizedVehicleIdentity(input);

  return Boolean(identity.brand && identity.model && identity.plateNumber);
}

export function getSamePlateVehicleDuplicateReason(
  target: VehicleIdentityInput,
  existing: VehicleIdentityInput,
): SamePlateVehicleDuplicateReason | null {
  const targetIdentity = getNormalizedVehicleIdentity(target);
  const existingIdentity = getNormalizedVehicleIdentity(existing);

  if (!targetIdentity.plateNumber || targetIdentity.plateNumber !== existingIdentity.plateNumber) {
    return null;
  }

  const targetComplete = isCompleteVehicleIdentity(target);
  const existingComplete = isCompleteVehicleIdentity(existing);

  if (
    targetComplete &&
    existingComplete &&
    targetIdentity.brand === existingIdentity.brand &&
    targetIdentity.model === existingIdentity.model
  ) {
    return "same_vehicle_identity";
  }

  return targetComplete && existingComplete
    ? "same_plate_different_vehicle_requires_confirmation"
    : "same_plate_vehicle_identity_ambiguous_requires_confirmation";
}

export function duplicateReasonRequiresSamePlateConfirmation(
  reason: SamePlateVehicleDuplicateReason | null | undefined,
) {
  return (
    reason === "same_plate_different_vehicle_requires_confirmation" ||
    reason === "same_plate_vehicle_identity_ambiguous_requires_confirmation"
  );
}

export function formatPlateForDisplay(value: string | null | undefined) {
  const normalized = normalizePlate(value);
  const russianPlateMatch = normalized.match(RUSSIAN_PLATE_PATTERN);

  if (!russianPlateMatch) {
    return normalized;
  }

  return `${russianPlateMatch[1]}${russianPlateMatch[2]}${russianPlateMatch[3]} ${russianPlateMatch[4]}`;
}

export function getClientDisplayName(input: {
  clientKind?: ClientKind | string | null;
  organizationName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  middleName?: string | null;
  fullName?: string | null;
  fallback?: string;
}) {
  const clientKind = sanitizeClientKind(input.clientKind);
  const organizationName = input.organizationName?.trim() ?? "";

  if (clientKind === "legal" && organizationName) {
    return organizationName;
  }

  const humanName = formatClientFullName(input);

  if (humanName) {
    return humanName;
  }

  if (clientKind === "legal") {
    return input.fallback ?? CLIENT_NAME_FALLBACK;
  }

  const fullName = input.fullName?.trim() ?? "";

  return fullName || input.fallback || CLIENT_NAME_FALLBACK;
}

export function buildVehicleIdentityLabel(input: {
  carBrand?: string | null;
  carModel?: string | null;
  plateNumber?: string | null;
}) {
  return [input.carBrand, input.carModel, formatPlateForDisplay(input.plateNumber)]
    .map((value) => value?.trim() ?? "")
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function getClientContractState(input: ClientContractInput): ClientContractState {
  const clientKind = sanitizeClientKind(input.clientKind);
  const firstName = normalizeClientFullName(input.fullName) || input.firstName?.trim() || "";
  const phone = input.phone?.trim() ?? "";
  const carBrand = input.carBrand?.trim() ?? "";
  const carModel = input.carModel?.trim() ?? "";
  const plateNumber = input.plateNumber?.trim() ?? "";
  const organizationName = input.organizationName?.trim() ?? "";
  const hasVehicleIdentity = true;
  const hasContactMinimumRequiredFields = true;
  const hasOrderMinimumRequiredFields =
    clientKind === "legal"
      ? Boolean(organizationName)
      : true;

  return {
    clientKind,
    firstName,
    phone,
    carBrand,
    carModel,
    plateNumber,
    organizationName,
    hasVehicleIdentity,
    hasContactMinimumRequiredFields,
    hasOrderMinimumRequiredFields,
    hasCreateClientMinimumRequiredFields: true,
  };
}

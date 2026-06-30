import {
  buildVehicleIdentityLabel,
  duplicateReasonRequiresSamePlateConfirmation,
  formatPlateForDisplay,
  getNormalizedVehicleIdentity,
  getSamePlateVehicleDuplicateReason,
  type SamePlateVehicleDuplicateReason,
  normalizePhone,
  normalizePlate,
} from "@/features/clients/client-contract";
import type { ClientVehicle, DemoClient } from "@/features/clients/types";

export type ClientDuplicateConflict = {
  kind: "phone" | "plate";
  reason:
    | "duplicate_phone"
    | SamePlateVehicleDuplicateReason;
  requiresConfirmation: boolean;
  clientId: string;
  clientName: string;
  phone: string;
  vehicleId: string | null;
  vehicleLabel: string;
  plateNumber: string;
  sameClient: boolean;
};

const CLIENT_DUPLICATE_REASONS = new Set<ClientDuplicateConflict["reason"]>([
  "duplicate_phone",
  "same_vehicle_identity",
  "same_plate_different_vehicle_requires_confirmation",
  "same_plate_vehicle_identity_ambiguous_requires_confirmation",
]);

type DuplicateSearchOptions = {
  excludeClientId?: string | null;
  excludeVehicleId?: string | null;
  targetClientId?: string | null;
  carBrand?: string | null;
  carModel?: string | null;
};

export function buildSamePlateConfirmationKey(input: {
  scope: string;
  clientId?: string | null;
  vehicleId?: string | null;
  carBrand?: string | null;
  carModel?: string | null;
  plateNumber?: string | null;
}) {
  const identity = getNormalizedVehicleIdentity(input);

  return [
    input.scope,
    input.clientId ?? "",
    input.vehicleId ?? "",
    identity.plateNumber,
    identity.brand,
    identity.model,
  ].join(":");
}

function getVehicleLabel(vehicle: ClientVehicle | null | undefined) {
  if (!vehicle) {
    return "";
  }

  return (
    buildVehicleIdentityLabel({
      carBrand: vehicle.brand,
      carModel: vehicle.model,
      plateNumber: vehicle.plateNumber,
    }) || vehicle.label
  );
}

function buildConflict(
  kind: ClientDuplicateConflict["kind"],
  client: DemoClient,
  vehicle: ClientVehicle | null,
  options: DuplicateSearchOptions = {},
  reason: ClientDuplicateConflict["reason"] = "duplicate_phone",
): ClientDuplicateConflict {
  return {
    kind,
    reason,
    requiresConfirmation: duplicateReasonRequiresSamePlateConfirmation(
      reason === "duplicate_phone" ? null : reason,
    ),
    clientId: client.id,
    clientName: client.name || "Клиент без имени",
    phone: client.phone,
    vehicleId: vehicle?.id ?? null,
    vehicleLabel: getVehicleLabel(vehicle),
    plateNumber: formatPlateForDisplay(vehicle?.plateNumber) || normalizePlate(vehicle?.plateNumber),
    sameClient: Boolean(options.targetClientId && client.id === options.targetClientId),
  };
}

export function coerceClientDuplicateConflict(value: unknown): ClientDuplicateConflict | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const kind = record.kind;
  const reason = record.reason;

  if (
    (kind !== "phone" && kind !== "plate") ||
    typeof reason !== "string" ||
    !CLIENT_DUPLICATE_REASONS.has(reason as ClientDuplicateConflict["reason"]) ||
    typeof record.clientId !== "string"
  ) {
    return null;
  }

  return {
    kind,
    reason: reason as ClientDuplicateConflict["reason"],
    requiresConfirmation: Boolean(record.requiresConfirmation),
    clientId: record.clientId,
    clientName: typeof record.clientName === "string" ? record.clientName : "Клиент без имени",
    phone: typeof record.phone === "string" ? record.phone : "",
    vehicleId: typeof record.vehicleId === "string" ? record.vehicleId : null,
    vehicleLabel: typeof record.vehicleLabel === "string" ? record.vehicleLabel : "",
    plateNumber: typeof record.plateNumber === "string" ? record.plateNumber : "",
    sameClient: Boolean(record.sameClient),
  };
}

export function findClientPhoneDuplicate(
  clients: DemoClient[],
  phone: string | null | undefined,
  options: DuplicateSearchOptions = {},
) {
  const normalizedPhone = normalizePhone(phone);

  if (!normalizedPhone) {
    return null;
  }

  const client = clients.find(
    (item) =>
      item.id !== options.excludeClientId &&
      normalizePhone(item.phone) === normalizedPhone,
  );

  return client ? buildConflict("phone", client, client.vehicles[0] ?? null, options) : null;
}

export function findClientPlateDuplicate(
  clients: DemoClient[],
  plateNumber: string | null | undefined,
  options: DuplicateSearchOptions = {},
) {
  const normalizedPlate = normalizePlate(plateNumber);

  if (!normalizedPlate) {
    return null;
  }

  let confirmationConflict: ClientDuplicateConflict | undefined;

  for (const client of clients) {
    for (const vehicle of client.vehicles) {
      if (vehicle.id === options.excludeVehicleId) {
        continue;
      }

      if (normalizePlate(vehicle.plateNumber) === normalizedPlate) {
        const reason = getSamePlateVehicleDuplicateReason(
          {
            carBrand: options.carBrand,
            carModel: options.carModel,
            plateNumber,
          },
          {
            carBrand: vehicle.brand,
            carModel: vehicle.model,
            plateNumber: vehicle.plateNumber,
          },
        );

        if (!reason) {
          continue;
        }

        const conflict = buildConflict("plate", client, vehicle, options, reason);

        if (reason === "same_vehicle_identity") {
          return conflict;
        }

        if (
          !confirmationConflict ||
          confirmationConflict.reason !== "same_plate_vehicle_identity_ambiguous_requires_confirmation"
        ) {
          confirmationConflict = conflict;
        }
      }
    }
  }

  return confirmationConflict ?? null;
}

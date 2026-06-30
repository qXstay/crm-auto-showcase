import {
  formatPlateForDisplay,
  normalizePlate,
  parseRussianPlateParts,
} from "@/features/clients/client-contract";
import type { ClientVehicle, DemoClient } from "@/features/clients/types";

export type ClientSearchResult = {
  client: DemoClient;
  selectedVehicle: ClientVehicle | null;
};

function getClientPrimaryVehicle(client: DemoClient) {
  return client.vehicles[0] ?? null;
}

function shouldRankVehiclePlateQuery(query: string, normalizedPlateQuery: string) {
  if (!query.trim() || !normalizedPlateQuery) {
    return false;
  }

  if (/[^\d]/u.test(normalizedPlateQuery)) {
    return true;
  }

  return /^\d{1,3}$/.test(normalizedPlateQuery);
}

function getVehiclePlateMatchRank(vehicle: ClientVehicle, normalizedPlateQuery: string) {
  const normalizedVehiclePlate = normalizePlate(vehicle.plateNumber);

  if (!normalizedVehiclePlate || !normalizedPlateQuery) {
    return 0;
  }

  if (normalizedVehiclePlate === normalizedPlateQuery) {
    return 400;
  }

  const vehicleParts = parseRussianPlateParts(vehicle.plateNumber);
  const queryIsDigitsOnly = /^\d+$/.test(normalizedPlateQuery);

  if (!queryIsDigitsOnly && vehicleParts.body === normalizedPlateQuery) {
    return 350;
  }

  if (queryIsDigitsOnly && vehicleParts.region === normalizedPlateQuery) {
    return 340;
  }

  if (normalizedVehiclePlate.includes(normalizedPlateQuery)) {
    return 220;
  }

  if (queryIsDigitsOnly) {
    if (vehicleParts.region.includes(normalizedPlateQuery)) {
      return 210;
    }

    const bodyDigits = vehicleParts.body.replace(/\D/g, "");

    if (bodyDigits.includes(normalizedPlateQuery)) {
      return 200;
    }
  }

  return 0;
}

function findBestVehiclePlateMatch(
  vehicles: ClientVehicle[],
  query: string,
  normalizedPlateQuery: string,
): { vehicle: ClientVehicle; rank: number; index: number } | null {
  if (!shouldRankVehiclePlateQuery(query, normalizedPlateQuery)) {
    return null;
  }

  let bestMatch: { vehicle: ClientVehicle; rank: number; index: number } | null = null;

  vehicles.forEach((vehicle, index) => {
    const rank = getVehiclePlateMatchRank(vehicle, normalizedPlateQuery);

    if (!rank) {
      return;
    }

    if (!bestMatch || rank > bestMatch.rank || (rank === bestMatch.rank && index < bestMatch.index)) {
      bestMatch = { vehicle, rank, index };
    }
  });

  return bestMatch;
}

export function buildClientSearchResults(clients: DemoClient[], query: string): ClientSearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedPlateQuery = normalizePlate(query);

  return clients
    .map((client, index) => {
      const bestVehicleMatch = findBestVehiclePlateMatch(
        client.vehicles,
        query,
        normalizedPlateQuery,
      );
      const selectedVehicle = bestVehicleMatch?.vehicle ?? getClientPrimaryVehicle(client);
      const haystack = [
        client.name,
        client.firstName,
        client.lastName,
        client.middleName,
        client.phone,
        ...client.vehicles.flatMap((vehicle) => [
          vehicle.label,
          vehicle.brand,
          vehicle.model,
          vehicle.plateNumber,
          formatPlateForDisplay(vehicle.plateNumber),
        ]),
      ];
      const textMatch =
        !normalizedQuery ||
        haystack.join(" ").toLowerCase().includes(normalizedQuery);
      const vehicleMatchRank = bestVehicleMatch?.rank ?? 0;

      return {
        client,
        selectedVehicle,
        index,
        score: vehicleMatchRank > 0 ? vehicleMatchRank : textMatch ? 100 : 0,
        matches: !normalizedQuery || textMatch || vehicleMatchRank > 0,
      };
    })
    .filter((result) => result.matches)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map(({ client, selectedVehicle }) => ({
      client,
      selectedVehicle,
    }));
}

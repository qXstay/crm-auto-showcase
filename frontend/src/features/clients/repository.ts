"use client";

import { apiRequest } from "@/lib/api/client";
import {
  clearCachedClientResource,
  readCachedClientResource,
} from "@/lib/client-resource-cache";
import type { DemoClient, DemoClientsStore } from "@/features/clients/types";

type UpdateClientInput = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  email?: string;
  note?: string;
  source?: string;
};

type CreateClientInput = {
  clientKind?: "individual" | "legal";
  organizationName?: string;
  inn?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  phone?: string;
  carBrand?: string;
  carModel?: string;
  plateNumber?: string;
  radius?: string;
  allowSamePlateDifferentVehicle?: boolean;
};

type VehicleInput = {
  brand?: string;
  model?: string;
  plateNumber?: string;
  radius?: string;
  allowSamePlateDifferentVehicle?: boolean;
};

const CLIENTS_STORE_CACHE_KEY = "clients-store";
const CLIENTS_STORE_TTL_MS = 60_000;

export async function fetchClientsStore(options?: { force?: boolean }) {
  return readCachedClientResource(
    CLIENTS_STORE_CACHE_KEY,
    () => apiRequest<DemoClientsStore>("/api/clients"),
    {
      ttlMs: CLIENTS_STORE_TTL_MS,
      force: options?.force,
    },
  );
}

export async function createClientViaApi(input: CreateClientInput) {
  clearCachedClientResource(CLIENTS_STORE_CACHE_KEY);
  return apiRequest<{ client: DemoClient }>("/api/clients", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateClientViaApi(clientId: string, input: UpdateClientInput) {
  clearCachedClientResource(CLIENTS_STORE_CACHE_KEY);
  return apiRequest<{ client: DemoClient }>(`/api/clients/${clientId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function createClientVehicleViaApi(clientId: string, input: VehicleInput) {
  clearCachedClientResource(CLIENTS_STORE_CACHE_KEY);
  return apiRequest<{ client: DemoClient }>(`/api/clients/${clientId}/vehicles`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateClientVehicleViaApi(
  clientId: string,
  vehicleId: string,
  input: VehicleInput,
) {
  clearCachedClientResource(CLIENTS_STORE_CACHE_KEY);
  return apiRequest<{ client: DemoClient }>(`/api/clients/${clientId}/vehicles/${vehicleId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

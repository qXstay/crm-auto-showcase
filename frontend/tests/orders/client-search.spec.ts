import { expect, test } from "@playwright/test";

import { buildClientSearchResults } from "../../src/features/orders/client-search";
import type { DemoClient } from "../../src/features/clients/types";

function createClient(input: Partial<DemoClient> & Pick<DemoClient, "id" | "name">): DemoClient {
  return {
    id: input.id,
    name: input.name,
    shortName: input.shortName ?? input.name,
    firstName: input.firstName ?? "",
    lastName: input.lastName ?? "",
    middleName: input.middleName ?? "",
    phone: input.phone ?? "",
    email: "",
    registrationDate: "",
    source: "Не выбран",
    sourceOptions: [],
    note: "",
    lastVisitDate: "",
    ordersCount: 0,
    averageCheck: 0,
    totalSpent: 0,
    averageVisitGapLabel: "",
    vehicles: input.vehicles ?? [],
    orders: [],
    visits: [],
    storages: [],
    bookings: [],
  };
}

test("multi-vehicle client search selects the matched vehicle by plate fragment", () => {
  const client = createClient({
    id: "client-1",
    name: "Иван Петров",
    vehicles: [
      {
        id: "vehicle-1",
        label: "",
        brand: "Toyota",
        model: "Camry",
        plateNumber: "А111АА196",
        radius: "R16",
      },
      {
        id: "vehicle-2",
        label: "",
        brand: "Kia",
        model: "Rio",
        plateNumber: "Х117ХХ196",
        radius: "R15",
      },
    ],
  });

  const results = buildClientSearchResults([client], "117");

  expect(results).toHaveLength(1);
  expect(results[0]?.selectedVehicle?.id).toBe("vehicle-2");
});

test("exact normalized plate match returns the exact vehicle first", () => {
  const exactClient = createClient({
    id: "client-exact",
    name: "Точный клиент",
    vehicles: [
      {
        id: "vehicle-exact",
        label: "",
        brand: "Kia",
        model: "Rio",
        plateNumber: "Х117ХХ196",
        radius: "R15",
      },
    ],
  });
  const containsClient = createClient({
    id: "client-contains",
    name: "Частичный клиент",
    vehicles: [
      {
        id: "vehicle-contains",
        label: "",
        brand: "Lada",
        model: "Vesta",
        plateNumber: "А117АА196",
        radius: "R16",
      },
    ],
  });

  const results = buildClientSearchResults([containsClient, exactClient], "x117xx196");

  expect(results.map((result) => result.client.id)).toEqual(["client-exact"]);
  expect(results[0]?.selectedVehicle?.id).toBe("vehicle-exact");
});

test("name search keeps current primary-vehicle fallback behavior", () => {
  const client = createClient({
    id: "client-1",
    name: "Иван Петров",
    phone: "+7 912 000 00 00",
    vehicles: [
      {
        id: "vehicle-1",
        label: "",
        brand: "Toyota",
        model: "Camry",
        plateNumber: "А111АА196",
        radius: "R16",
      },
      {
        id: "vehicle-2",
        label: "",
        brand: "Kia",
        model: "Rio",
        plateNumber: "Х117ХХ196",
        radius: "R15",
      },
    ],
  });

  const results = buildClientSearchResults([client], "Иван");

  expect(results).toHaveLength(1);
  expect(results[0]?.selectedVehicle?.id).toBe("vehicle-1");
});

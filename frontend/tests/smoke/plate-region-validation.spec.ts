import { expect, test } from "@playwright/test";
import { loginAsSmokeUser } from "./support";

function uniquePhone() {
  return `79${Math.floor(100000000 + Math.random() * 899999999)}`;
}

function minimalOrderWithPlate(plateNumber: string) {
  const now = new Date().toISOString();

  return {
    order: {
      id: `smoke-plate-${crypto.randomUUID()}`,
      number: "",
      createdAt: now,
      updatedAt: now,
      status: "Черновик",
      client: {
        mode: "anonymous",
        clientId: "anonymous",
        clientKind: "individual",
        label: "Анонимный клиент",
        details: "Lada Vesta",
        name: "Анонимный клиент",
        phone: "",
        carBrand: "Lada",
        carModel: "Vesta",
        plateNumber,
        preferredRadius: "R16",
        anonymous: true,
      },
      vehicleType: "passenger",
      radius: "R16",
      lowProfile: false,
      runflat: false,
      executorId: null,
      executorEmployeeId: null,
      executorNameSnapshot: null,
      executorEmployeeIds: [],
      shiftId: null,
      shiftLabelSnapshot: null,
      shiftOpenedAtSnapshot: null,
      lines: [],
      salaryAccrualTotal: null,
      totals: {
        servicesCount: 0,
        subtotal: 0,
        discount: 0,
        total: 0,
      },
      note: "",
      payment: {
        paymentStatus: "Не оплачено",
        paymentMethod: null,
        paymentLabel: null,
        accountId: null,
        accountNameSnapshot: null,
        paidAt: null,
        paidAmount: null,
        note: null,
      },
    },
  };
}

test.describe("plate region API validation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSmokeUser(page);
  });

  test("Russian plate writes canonicalize Latin lookalikes before storage and duplicate checks", async ({ page }) => {
    const plateSuffix = String(Math.floor(100 + Math.random() * 900));
    const latinPlate = `a${plateSuffix}kx196`;
    const cyrillicPlate = `А${plateSuffix}КХ196`;
    const firstClientResponse = await page.request.post("/api/clients", {
      data: {
        clientKind: "individual",
        fullName: `Smoke Latin Plate ${crypto.randomUUID()}`,
        phone: uniquePhone(),
        carBrand: "Lada",
        carModel: "Vesta",
        plateNumber: latinPlate,
        radius: "R16",
      },
    });

    expect(firstClientResponse.ok(), await firstClientResponse.text()).toBeTruthy();

    const clientsResponse = await page.request.get("/api/clients");
    expect(clientsResponse.ok(), await clientsResponse.text()).toBeTruthy();
    const clientsPayload = await clientsResponse.json();
    const createdClient = clientsPayload.clients.find((item: {
      vehicles?: Array<{ plateNumber?: string }>;
    }) => item.vehicles?.some((vehicle) => vehicle.plateNumber === cyrillicPlate));

    expect(createdClient, "Latin lookalike plate is stored canonically").toBeTruthy();

    const duplicateResponse = await page.request.post("/api/clients", {
      data: {
        clientKind: "individual",
        fullName: `Smoke Cyrillic Plate Duplicate ${crypto.randomUUID()}`,
        phone: uniquePhone(),
        carBrand: "Lada",
        carModel: "Vesta",
        plateNumber: cyrillicPlate,
        radius: "R16",
      },
    });

    expect(duplicateResponse.status()).toBe(409);
    expect(await duplicateResponse.text()).toContain(
      `${cyrillicPlate.slice(0, 6)} ${cyrillicPlate.slice(6)}`,
    );
  });

  test("client and vehicle write APIs reject Russian plate body without region", async ({ page }) => {
    const noRegionClientResponse = await page.request.post("/api/clients", {
      data: {
        clientKind: "individual",
        fullName: `Smoke No Region ${crypto.randomUUID()}`,
        phone: uniquePhone(),
        carBrand: "Lada",
        carModel: "Vesta",
        plateNumber: "А021КХ",
        radius: "R16",
      },
    });

    expect(noRegionClientResponse.status()).toBe(400);
    expect(await noRegionClientResponse.text()).toContain("Укажите регион номера");

    const clientsResponse = await page.request.get("/api/clients");
    expect(clientsResponse.ok(), await clientsResponse.text()).toBeTruthy();
    const clientsPayload = await clientsResponse.json();
    const client = clientsPayload.clients.find((item: {
      id: string;
      vehicles?: Array<{ id: string; plateNumber?: string; brand?: string; model?: string; radius?: string }>;
    }) => item.vehicles?.some((vehicle) => vehicle.plateNumber === "А021КХ196"));
    expect(client, "existing А021КХ196 client").toBeTruthy();
    const vehicle = client.vehicles.find((item: { plateNumber?: string }) => item.plateNumber === "А021КХ196");
    expect(vehicle, "existing А021КХ196 vehicle").toBeTruthy();
    const vehicleId = vehicle!.id as string;

    const fullPlateResponse = await page.request.patch(`/api/clients/${client.id}/vehicles/${vehicleId}`, {
      data: {
        brand: vehicle!.brand || "Toyota",
        model: vehicle!.model || "",
        plateNumber: "А021КХ196",
        radius: vehicle!.radius || "R16",
        allowSamePlateDifferentVehicle: true,
      },
    });
    expect(fullPlateResponse.ok(), await fullPlateResponse.text()).toBeTruthy();

    const addVehicleResponse = await page.request.post(`/api/clients/${client.id}/vehicles`, {
      data: {
        brand: "Lada",
        model: "Granta",
        plateNumber: "А021КХ",
        radius: "R15",
      },
    });
    expect(addVehicleResponse.status()).toBe(400);
    expect(await addVehicleResponse.text()).toContain("Укажите регион номера");

    const updateVehicleResponse = await page.request.patch(`/api/clients/${client.id}/vehicles/${vehicleId}`, {
      data: {
        brand: "Lada",
        model: "Vesta",
        plateNumber: "А021КХ",
        radius: "R16",
      },
    });
    expect(updateVehicleResponse.status()).toBe(400);
    expect(await updateVehicleResponse.text()).toContain("Укажите регион номера");
  });

  test("order write API rejects Russian plate body without region", async ({ page }) => {
    const orderResponse = await page.request.post("/api/orders", {
      data: minimalOrderWithPlate("А021КХ"),
    });

    expect(orderResponse.status()).toBe(400);
    expect(await orderResponse.text()).toContain("Укажите регион номера");
  });
});

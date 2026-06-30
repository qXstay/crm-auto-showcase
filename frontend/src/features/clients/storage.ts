import { DEMO_CLIENTS } from "@/features/clients/mock-data";
import { getClientBookingItems } from "@/features/booking/storage";
import type { BookingEntry, BookingPost } from "@/features/booking/types";
import type {
  ClientOrderHistoryItem,
  ClientVehicle,
  DemoClient,
  DemoClientsStore,
} from "@/features/clients/types";
import {
  buildDemoOrderWorkSummary,
  formatDemoOrderCarLabel,
  formatDemoOrderDateTime,
  getDemoOrderClientDisplayName,
  getStoredDemoOrders,
} from "@/features/orders/storage";

const CLIENTS_STORAGE_KEY = "pegas-demo-clients";

function cloneVehicle(vehicle: ClientVehicle): ClientVehicle {
  return { ...vehicle };
}

function cloneClient(client: DemoClient): DemoClient {
  return {
    ...client,
    vehicles: client.vehicles.map(cloneVehicle),
    orders: client.orders.map((order) => ({ ...order })),
    visits: client.visits.map((visit) => ({ ...visit })),
    storages: client.storages.map((storage) => ({ ...storage })),
    bookings: client.bookings.map((booking) => ({ ...booking })),
    sourceOptions: [...client.sourceOptions],
  };
}

function createInitialStore(): DemoClientsStore {
  return {
    clients: DEMO_CLIENTS.map(cloneClient),
  };
}

export function getInitialDemoClientsStore(): DemoClientsStore {
  return createInitialStore();
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function normalizeDemoClientPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return digits.slice(1);
  }

  if (digits.length > 10) {
    return digits.slice(-10);
  }

  return digits;
}

function normalizeClientName(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim();
}

function formatClientRegistrationDate(value: Date) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

function normalizeStore(value: unknown): DemoClientsStore {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as DemoClientsStore).clients)
  ) {
    return createInitialStore();
  }

  const clients = (value as DemoClientsStore).clients.filter(
    (client): client is DemoClient =>
      Boolean(client) &&
      typeof client.id === "string" &&
      typeof client.name === "string" &&
      typeof client.shortName === "string" &&
      typeof client.firstName === "string" &&
      typeof client.lastName === "string" &&
      typeof client.middleName === "string" &&
      typeof client.phone === "string" &&
      typeof client.email === "string" &&
      typeof client.registrationDate === "string" &&
      typeof client.source === "string" &&
      Array.isArray(client.sourceOptions) &&
      typeof client.note === "string" &&
      typeof client.lastVisitDate === "string" &&
      typeof client.ordersCount === "number" &&
      typeof client.averageCheck === "number" &&
      typeof client.totalSpent === "number" &&
      typeof client.averageVisitGapLabel === "string" &&
      Array.isArray(client.vehicles) &&
      Array.isArray(client.orders) &&
      Array.isArray(client.visits) &&
      Array.isArray(client.storages) &&
      Array.isArray(client.bookings),
  );

  return {
    clients: clients.length > 0 ? clients.map(cloneClient) : createInitialStore().clients,
  };
}

export function loadDemoClientsStore(): DemoClientsStore {
  if (!canUseStorage()) {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(CLIENTS_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return createInitialStore();
  }
}

export function saveDemoClientsStore(store: DemoClientsStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    CLIENTS_STORAGE_KEY,
    JSON.stringify({
      clients: store.clients.map(cloneClient),
    } satisfies DemoClientsStore),
  );
}

export function getDemoClientById(store: DemoClientsStore, clientId: string) {
  return store.clients.find((client) => client.id === clientId) ?? null;
}

export function upsertDemoClient(store: DemoClientsStore, nextClient: DemoClient) {
  const existingIndex = store.clients.findIndex((client) => client.id === nextClient.id);
  const nextClients = [...store.clients];

  if (existingIndex >= 0) {
    nextClients[existingIndex] = cloneClient(nextClient);
  } else {
    nextClients.unshift(cloneClient(nextClient));
  }

  return {
    clients: nextClients,
  } satisfies DemoClientsStore;
}

export function createDemoClientFromOrderInput(input: {
  firstName: string;
  lastName: string;
  phone: string;
  source?: string;
  note?: string;
  carBrand: string;
  carModel: string;
  plateNumber: string;
}): DemoClient {
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const phone = input.phone.trim();
  const carBrand = input.carBrand.trim();
  const carModel = input.carModel.trim();
  const plateNumber = input.plateNumber.trim();
  const name = [firstName, lastName].filter(Boolean).join(" ").trim() || "Новый клиент";
  const brandModel = [carBrand, carModel].filter(Boolean).join(" ").trim();

  return {
    id: `client-${Date.now()}`,
    name,
    shortName: name,
    firstName,
    lastName,
    middleName: "",
    phone,
    email: "",
    registrationDate: formatClientRegistrationDate(new Date()),
    source: input.source?.trim() ?? "",
    sourceOptions: ["Не выбран"],
    note: input.note?.trim() ?? "",
    lastVisitDate: "",
    ordersCount: 0,
    averageCheck: 0,
    totalSpent: 0,
    averageVisitGapLabel: "—",
    vehicles:
      brandModel || plateNumber
        ? [
            {
              id: `vehicle-${Date.now()}`,
              label: brandModel || "Не указан",
              brand: carBrand,
              model: carModel,
              plateNumber,
              radius: "",
              totalSpent: 0,
            },
          ]
        : [],
    orders: [],
    visits: [],
    storages: [],
    bookings: [],
  };
}

function mapStoredOrderToClientHistory(order: ReturnType<typeof getStoredDemoOrders>[number]) {
  return {
    id: order.id,
    orderNumber: order.number,
    dateTime: formatDemoOrderDateTime(order.payment.paidAt ?? order.createdAt),
    branch: "Северный",
    carLabel: formatDemoOrderCarLabel(order),
    amount: order.payment.paidAmount ?? order.totals.total,
    status: order.payment.paymentStatus === "Оплачен" ? "Оплачен" : order.status,
    servicesLabel: buildDemoOrderWorkSummary(order),
  } satisfies ClientOrderHistoryItem;
}

function isOrderLinkedToClient(
  client: DemoClient,
  order: ReturnType<typeof getStoredDemoOrders>[number],
) {
  if (order.client.anonymous) {
    return false;
  }

  if (order.client.clientId && order.client.clientId === client.id) {
    return true;
  }

  const clientPhone = normalizeDemoClientPhone(client.phone);
  const orderPhone = normalizeDemoClientPhone(order.client.phone);

  if (clientPhone && orderPhone && clientPhone === orderPhone) {
    return true;
  }

  const clientNames = new Set(
    [client.name, [client.firstName, client.lastName].filter(Boolean).join(" ").trim()]
      .map(normalizeClientName)
      .filter(Boolean),
  );
  const orderName = normalizeClientName(getDemoOrderClientDisplayName(order.client));

  return Boolean(orderName && clientNames.has(orderName));
}

export function getDemoClientOrderHistory(
  client: DemoClient,
  storedOrders: ReturnType<typeof getStoredDemoOrders> = [],
) {
  const baseOrders = client.orders.map((order) => ({ ...order }));
  const dynamicOrders = storedOrders
    .filter((order) => isOrderLinkedToClient(client, order))
    .sort((a, b) =>
      (b.payment.paidAt ?? b.createdAt).localeCompare(a.payment.paidAt ?? a.createdAt),
    )
    .map(mapStoredOrderToClientHistory);

  return [
    ...dynamicOrders,
    ...baseOrders.filter((order) => !dynamicOrders.some((item) => item.id === order.id)),
  ];
}

function addAmountToVehicle(
  vehicles: ClientVehicle[],
  carLabel: string,
  amount: number,
) {
  if (!carLabel || carLabel === "Не указан") {
    return;
  }

  const [brandModel = "", plateNumber = ""] = carLabel.split(" · ");
  const [brand = "", ...modelParts] = brandModel.split(" ");
  const model = modelParts.join(" ").trim();
  const existingIndex = vehicles.findIndex(
    (vehicle) =>
      normalizeClientName(vehicle.brand) === normalizeClientName(brand) &&
      normalizeClientName(vehicle.model) === normalizeClientName(model) &&
      normalizeClientName(vehicle.plateNumber) === normalizeClientName(plateNumber),
  );

  if (existingIndex >= 0) {
    const currentVehicle = vehicles[existingIndex];

    vehicles[existingIndex] = {
      ...currentVehicle,
      totalSpent: (currentVehicle.totalSpent ?? 0) + amount,
    };
    return;
  }

  if (!brandModel && !plateNumber) {
    return;
  }

  vehicles.push({
    id: `vehicle-derived-${vehicles.length + 1}`,
    label: brandModel || "Не указан",
    brand,
    model,
    plateNumber,
    radius: "",
    totalSpent: amount,
  });
}

export function buildDemoClientViewModel(
  client: DemoClient,
  storedOrders: ReturnType<typeof getStoredDemoOrders> = [],
  bookingEntries: BookingEntry[] = [],
  bookingPosts: BookingPost[] = [],
) {
  const mergedOrders = getDemoClientOrderHistory(client, storedOrders);
  const baseOrderIds = new Set(client.orders.map((order) => order.id));
  const dynamicUniqueOrders = mergedOrders.filter((order) => !baseOrderIds.has(order.id));
  const dynamicAmount = dynamicUniqueOrders.reduce((total, order) => total + order.amount, 0);
  const ordersCount = client.ordersCount + dynamicUniqueOrders.length;
  const totalSpent = client.totalSpent + dynamicAmount;
  const averageCheck = ordersCount > 0 ? Math.round(totalSpent / ordersCount) : 0;
  const vehicles = client.vehicles.map(cloneVehicle);

  dynamicUniqueOrders.forEach((order) => addAmountToVehicle(vehicles, order.carLabel, order.amount));

  return {
    ...cloneClient(client),
    orders: mergedOrders,
    bookings:
      bookingEntries.length > 0 && bookingPosts.length > 0
        ? getClientBookingItems(client, bookingEntries, bookingPosts)
        : client.bookings.map((booking) => ({ ...booking })),
    vehicles,
    ordersCount,
    totalSpent,
    averageCheck,
    lastVisitDate:
      dynamicUniqueOrders.length > 0
        ? (() => {
            const latestOrder = dynamicUniqueOrders[0];
            const [dateLabel = ""] = latestOrder.dateTime.split(",");
            return dateLabel.trim();
          })()
        : client.lastVisitDate,
    averageVisitGapLabel:
      ordersCount > 1 ? client.averageVisitGapLabel || "—" : client.averageVisitGapLabel || "—",
  } satisfies DemoClient;
}

export function getClientSourceUsageCount(
  sourceName: string,
  clients: DemoClient[],
) {
  const normalizedSourceName = normalizeClientName(sourceName);

  return clients.filter(
    (client) => normalizeClientName(client.source) === normalizedSourceName,
  ).length;
}

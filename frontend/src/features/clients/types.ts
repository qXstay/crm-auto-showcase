import type { DemoOrderStatus } from "@/features/orders/types";

export type ClientVehicle = {
  id: string;
  label: string;
  brand: string;
  model: string;
  plateNumber: string;
  radius: string;
  totalSpent?: number;
};

export type ClientOrderHistoryItem = {
  id: string;
  orderNumber: string;
  dateTime: string;
  branch: string;
  carLabel: string;
  amount: number;
  status: DemoOrderStatus;
  servicesLabel: string;
};

export type ClientVisitHistoryItem = {
  id: string;
  dateTime: string;
  branch: string;
  post: string;
  serviceLabel: string;
  resultLabel: string;
};

export type ClientStorageItem = {
  id: string;
  name: string;
  status: string;
  branch?: string;
};

export type ClientBookingItem = {
  id: string;
  date: string;
  note: string;
  branch?: string;
};

export type ClientKpi = {
  id: string;
  label: string;
  value: string;
};

export type DemoClient = {
  id: string;
  name: string;
  shortName: string;
  firstName: string;
  lastName: string;
  middleName: string;
  phone: string;
  email: string;
  registrationDate: string;
  source: string;
  sourceOptions: string[];
  note: string;
  lastVisitDate: string;
  ordersCount: number;
  averageCheck: number;
  totalSpent: number;
  averageVisitGapLabel: string;
  vehicles: ClientVehicle[];
  orders: ClientOrderHistoryItem[];
  visits: ClientVisitHistoryItem[];
  storages: ClientStorageItem[];
  bookings: ClientBookingItem[];
};

export type DemoClientsStore = {
  clients: DemoClient[];
};

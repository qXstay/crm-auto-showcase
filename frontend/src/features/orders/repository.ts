"use client";

import { apiRequest } from "@/lib/api/client";
import { readCachedClientResource } from "@/lib/client-resource-cache";
import type {
  DemoOrder,
  DemoOrderDetail,
  DemoOrderPaymentSnapshot,
  OrderExecutorOption,
} from "@/features/orders/types";

type OrderReadPayload = {
  order: DemoOrder;
  detail: DemoOrderDetail;
};

const ORDER_EXECUTORS_CACHE_KEY = "order-executor-options";
const ORDER_EXECUTORS_TTL_MS = 60_000;

export async function fetchOrderForEditor(orderId: string) {
  return apiRequest<OrderReadPayload>(`/api/orders/${orderId}`);
}

export async function fetchOrderExecutorOptions() {
  return readCachedClientResource(
    ORDER_EXECUTORS_CACHE_KEY,
    () => apiRequest<{ executors: OrderExecutorOption[] }>("/api/orders/executors"),
    {
      ttlMs: ORDER_EXECUTORS_TTL_MS,
    },
  );
}

type OrderWriteOptions = {
  allowSamePlateDifferentVehicle?: boolean;
};

export async function createOrderViaApi(order: DemoOrder, options: OrderWriteOptions = {}) {
  return apiRequest<OrderReadPayload>("/api/orders", {
    method: "POST",
    body: JSON.stringify({ order, ...options }),
  });
}

export async function updateOrderViaApi(
  orderId: string,
  order: DemoOrder,
  options: OrderWriteOptions = {},
) {
  return apiRequest<OrderReadPayload>(`/api/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({ order, ...options }),
  });
}

type AppendPaymentInput = {
  payment: DemoOrderPaymentSnapshot;
  shiftId?: string | null;
  shiftLabelSnapshot?: string | null;
  shiftOpenedAtSnapshot?: string | null;
};

export async function appendOrderPaymentViaApi(orderId: string, input: AppendPaymentInput) {
  return apiRequest<OrderReadPayload>(`/api/orders/${orderId}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type OrderDeleteLifecycleResult =
  | { deleted: true }
  | { markedForDeletion: true };

export async function deleteOrderLifecycleViaApi(orderId: string) {
  return apiRequest<OrderDeleteLifecycleResult>(`/api/orders/${orderId}`, {
    method: "DELETE",
  });
}

export async function deleteDraftOrderViaApi(orderId: string) {
  return deleteOrderLifecycleViaApi(orderId) as Promise<{ deleted: true }>;
}

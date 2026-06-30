import { NextRequest } from "next/server";
import { listOrdersForBranch } from "@/server/repositories/order-read-repository";
import {
  createOrderForBranch,
  InvalidOrderClientAccessError,
  InvalidOrderExecutorError,
  InvalidOrderPaymentError,
  InvalidOrderServiceCatalogError,
} from "@/server/repositories/order-write-repository";
import { requireApiPermission } from "@/server/api/guards";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { badRequest, okJson } from "@/server/api/responses";
import type { DemoOrder } from "@/features/orders/types";

function parsePageParam(value: string | null) {
  const parsed = Number.parseInt(value ?? "1", 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export async function GET(request: NextRequest) {
  const auth = await requireApiPermission("order.view");

  if (!auth.ok) {
    return auth.response;
  }

  return okJson(
    await listOrdersForBranch(auth.context.currentBranch.id, {
      page: parsePageParam(request.nextUrl.searchParams.get("page")),
    }),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiPermission("order.create");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as
    | { order?: DemoOrder; allowSamePlateDifferentVehicle?: boolean }
    | null;

  if (!body?.order) {
    return badRequest("Не удалось прочитать данные заказа.");
  }

  if (
    body.allowSamePlateDifferentVehicle !== undefined &&
    typeof body.allowSamePlateDifferentVehicle !== "boolean"
  ) {
    return badRequest("Некорректный флаг подтверждения госномера.");
  }

  try {
    const orderRecord = await createOrderForBranch(auth.context.currentBranch.id, body.order, {
      allowSamePlateDifferentVehicle: body.allowSamePlateDifferentVehicle,
      allowNetworkClientAccess: await canReadNetworkClients(auth.context),
    });

    if (!orderRecord) {
      return badRequest("Не удалось создать заказ.");
    }

    return okJson(orderRecord);
  } catch (error) {
    if (
      error instanceof InvalidOrderClientAccessError ||
      error instanceof InvalidOrderExecutorError ||
      error instanceof InvalidOrderServiceCatalogError ||
      error instanceof InvalidOrderPaymentError
    ) {
      return badRequest(
        error.message,
        error instanceof InvalidOrderClientAccessError ? error.status : 400,
        error instanceof InvalidOrderClientAccessError && error.reason
          ? { reason: error.reason, duplicate: error.duplicate }
          : undefined,
      );
    }

    throw error;
  }
}

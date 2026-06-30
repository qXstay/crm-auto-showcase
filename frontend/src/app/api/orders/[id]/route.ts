import { NextRequest } from "next/server";
import { notFound, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import { canReadNetworkClients } from "@/server/auth/client-network-access";
import { getOrderByIdForBranch } from "@/server/repositories/order-read-repository";
import {
  deleteOrMarkOrderForBranch,
  InvalidOrderClientAccessError,
  InvalidOrderExecutorError,
  InvalidOrderPaymentError,
  InvalidOrderServiceCatalogError,
  updateOrderForBranch,
} from "@/server/repositories/order-write-repository";
import { badRequest } from "@/server/api/responses";
import type { DemoOrder } from "@/features/orders/types";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("order.view");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;
  const order = await getOrderByIdForBranch(auth.context.currentBranch.id, id);

  if (!order) {
    return notFound("Заказ не найден.");
  }

  return okJson(order);
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
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

  const { id } = await context.params;
  try {
    const order = await updateOrderForBranch(auth.context.currentBranch.id, id, body.order, {
      allowSamePlateDifferentVehicle: body.allowSamePlateDifferentVehicle,
      allowNetworkClientAccess: await canReadNetworkClients(auth.context),
    });

    if (!order) {
      return notFound("Заказ не найден.");
    }

    return okJson(order);
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

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("order.create");

  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await context.params;

  try {
    const result = await deleteOrMarkOrderForBranch(auth.context.currentBranch.id, id);

    if (!result) {
      return notFound("Заказ не найден.");
    }

    if (result.action === "deleted") {
      return okJson({ deleted: true as const });
    }

    return okJson({ markedForDeletion: true as const });
  } catch (error) {
    if (error instanceof InvalidOrderPaymentError) {
      return badRequest(error.message);
    }

    throw error;
  }
}

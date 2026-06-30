import { NextRequest } from "next/server";
import { badRequest, notFound, okJson } from "@/server/api/responses";
import { requireApiPermission } from "@/server/api/guards";
import {
  appendPaymentForOrderBranch,
  InvalidOrderExecutorError,
  InvalidOrderPaymentError,
} from "@/server/repositories/order-write-repository";
import type { AppendOrderPaymentInput } from "@/server/repositories/order-write-repository";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiPermission("order.create");

  if (!auth.ok) {
    return auth.response;
  }

  const body = (await request.json().catch(() => null)) as AppendOrderPaymentInput | null;

  if (!body?.payment) {
    return badRequest("Не удалось прочитать данные оплаты.");
  }

  const { id } = await context.params;

  try {
    const order = await appendPaymentForOrderBranch(auth.context.currentBranch.id, id, body);

    if (!order) {
      return notFound("Заказ не найден.");
    }

    return okJson(order);
  } catch (error) {
    if (error instanceof InvalidOrderPaymentError || error instanceof InvalidOrderExecutorError) {
      return badRequest(error.message);
    }

    throw error;
  }
}

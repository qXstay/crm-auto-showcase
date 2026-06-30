import { NextRequest } from "next/server";
import { switchCurrentBranch } from "@/server/repositories/auth-repository";
import { badRequest, okJson } from "@/server/api/responses";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { branchId?: string } | null;
  const branchId = body?.branchId?.trim() ?? "";

  if (!branchId) {
    return badRequest("Не указан филиал.");
  }

  const result = await switchCurrentBranch(branchId);

  if (!result.ok) {
    return badRequest(
      result.reason === "forbidden"
        ? "Нет доступа к выбранному филиалу."
        : "Требуется авторизация.",
      result.reason === "forbidden" ? 403 : 401,
    );
  }

  return okJson(result);
}

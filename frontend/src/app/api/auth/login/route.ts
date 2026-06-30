import { NextRequest } from "next/server";
import { signInEmployee } from "@/server/repositories/auth-repository";
import { badRequest, okJson } from "@/server/api/responses";

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as
    | { loginOrPhone?: string; pin?: string; password?: string; demoEntry?: boolean }
    | null;

  const loginOrPhone = body?.loginOrPhone?.trim() ?? "";

  if (!loginOrPhone) {
    return badRequest("Укажите логин или номер телефона.");
  }

  const result = await signInEmployee({
    loginOrPhone,
    pin: body?.pin,
    password: body?.password,
    demoEntry: body?.demoEntry === true,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "no_branch_access":
        return badRequest("Для сотрудника не настроен доступ к филиалу.", 403);
      case "invalid_credentials":
        return badRequest("Неверный PIN или пароль.", 401);
      default:
        return badRequest("Сотрудник не найден.", 404);
    }
  }

  return okJson(result);
}

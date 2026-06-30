import { NextResponse } from "next/server";

export function okJson<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function badRequest(message: string, status = 400, details?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...(details ?? {}) }, { status });
}

export function unauthorized(message = "Требуется авторизация") {
  return badRequest(message, 401);
}

export function forbidden(message = "Недостаточно прав") {
  return badRequest(message, 403);
}

export function notFound(message = "Не найдено") {
  return badRequest(message, 404);
}

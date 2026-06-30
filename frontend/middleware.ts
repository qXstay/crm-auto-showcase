import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "pegas_stage1_session";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const nextHeaders = new Headers(request.headers);
  nextHeaders.set("x-pegas-pathname", pathname);

  if (pathname.startsWith("/api/auth") || pathname.startsWith("/api/public/")) {
    return NextResponse.next({
      request: { headers: nextHeaders },
    });
  }

  if (pathname.startsWith("/api")) {
    const hasSessionCookie = Boolean(request.cookies.get(SESSION_COOKIE_NAME)?.value);

    if (!hasSessionCookie) {
      return NextResponse.json({ error: "Требуется авторизация" }, { status: 401 });
    }
  }

  if (pathname === "/login") {
    return NextResponse.next({
      request: { headers: nextHeaders },
    });
  }

  const protectedRoute =
    pathname.startsWith("/shift") ||
    pathname.startsWith("/orders") ||
    pathname.startsWith("/booking") ||
    pathname.startsWith("/storage") ||
    pathname.startsWith("/clients") ||
    pathname.startsWith("/settings");

  if (protectedRoute && !request.cookies.get(SESSION_COOKIE_NAME)?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next({
    request: { headers: nextHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const DEFAULT_COOKIE_NAME = "pegas_stage1_session";
const SESSION_TTL_DAYS = 30;

export function getSessionCookieName() {
  return process.env.SESSION_COOKIE_NAME || DEFAULT_COOKIE_NAME;
}

function getSessionSecret() {
  if (process.env.APP_SESSION_SECRET) {
    return process.env.APP_SESSION_SECRET;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_SESSION_SECRET is required in production");
  }

  return "local-demo-session-secret";
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(`${getSessionSecret()}:${token}`).digest("hex");
}

export function createSessionToken() {
  return randomUUID();
}

export function createSessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export async function readSessionTokenFromCookies() {
  const cookieStore = await cookies();
  return cookieStore.get(getSessionCookieName())?.value ?? null;
}

export async function writeSessionCookie(token: string, expiresAt: Date) {
  const cookieStore = await cookies();
  cookieStore.set(getSessionCookieName(), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(getSessionCookieName());
}

export function safeCompareText(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

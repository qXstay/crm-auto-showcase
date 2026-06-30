"use client";

import { apiRequest, isApiRequestError } from "@/lib/api/client";
import {
  clearDemoAuthCache,
  getDemoAuthContext,
  setDemoAuthContextCache,
} from "@/features/auth/storage";
import type { DemoAuthContext } from "@/features/auth/types";

export async function fetchAuthMe() {
  const payload = await apiRequest<{ context: DemoAuthContext | null }>("/api/auth/me");

  if (payload.context) {
    setDemoAuthContextCache(payload.context);
  }

  return payload.context;
}

export async function loginByPhoneOrLogin(input: {
  loginOrPhone: string;
  pin?: string;
  password?: string;
  demoEntry?: boolean;
}) {
  const requestLogin = () =>
    apiRequest<
      | {
          ok: true;
          previewOnly: true;
          employee: { id: string; phone: string; firstName: string; lastName: string };
        }
      | {
          ok: true;
          previewOnly: false;
          context: DemoAuthContext;
        }
    >("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });

  let payload;

  for (let attempt = 0; attempt < (input.demoEntry ? 10 : 1); attempt += 1) {
    try {
      payload = await requestLogin();
      break;
    } catch (error) {
      const shouldRetry =
        input.demoEntry &&
        isApiRequestError(error) &&
        (error.status === 404 || error.status === 409 || error.status >= 500);

      if (!shouldRetry || attempt === 9) {
        throw error;
      }

      await new Promise((resolve) => window.setTimeout(resolve, 800));
    }
  }

  if (!payload) {
    throw new Error("Не удалось открыть CRM.");
  }

  if (!payload.previewOnly) {
    setDemoAuthContextCache(payload.context);
  }

  return payload;
}

export async function logoutCurrentSession() {
  await apiRequest<{ ok: true }>("/api/auth/logout", {
    method: "POST",
    body: JSON.stringify({}),
  });
  clearDemoAuthCache();
}

export async function switchCurrentBranch(branchId: string) {
  const payload = await apiRequest<{ ok: true; context: DemoAuthContext }>(
    "/api/auth/switch-branch",
    {
      method: "POST",
      body: JSON.stringify({ branchId }),
    },
  );
  setDemoAuthContextCache(payload.context);
  return payload.context;
}

export function getCachedAuthContext() {
  return getDemoAuthContext();
}

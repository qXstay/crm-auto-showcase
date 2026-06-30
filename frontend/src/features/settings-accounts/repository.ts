"use client";

import { apiRequest } from "@/lib/api/client";
import type { DemoAccountRecord, DemoAccountsStore } from "@/features/settings-accounts/types";

export async function fetchAccountsStore() {
  return apiRequest<DemoAccountsStore>("/api/settings/accounts");
}

export async function createAccountViaApi(name: string) {
  return apiRequest<{ account: DemoAccountRecord }>("/api/settings/accounts", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateAccountViaApi(
  accountId: string,
  input: { name?: string; isArchived?: boolean },
) {
  return apiRequest<{ account: DemoAccountRecord }>(`/api/settings/accounts/${accountId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

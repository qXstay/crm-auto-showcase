"use client";

import type { DemoAuthContext, DemoAuthSession } from "@/features/auth/types";
import type { DemoEmployeeRecord } from "@/features/settings-employees/types";
import { formatEmployeeDisplayName } from "@/features/settings-employees/storage";

const AUTH_CONTEXT_STORAGE_KEY = "pegas-stage1-auth-context-cache";

export function getInitialDemoAuthSession() {
  return null as DemoAuthSession | null;
}

function canUseStorage() {
  return typeof window !== "undefined";
}

export function normalizeAuthPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return digits.slice(1);
  }

  if (digits.length > 10) {
    return digits.slice(-10);
  }

  return digits;
}

export function normalizeAuthPhoneInput(value: string) {
  return normalizeAuthPhone(value).slice(0, 10);
}

export function formatAuthPhoneInput(value: string) {
  const digits = normalizeAuthPhoneInput(value);
  const first = digits.slice(0, 3);
  const second = digits.slice(3, 6);
  const third = digits.slice(6, 8);
  const fourth = digits.slice(8, 10);

  let formatted = "";

  if (first) {
    formatted += first;
  }

  if (second) {
    formatted += ` ${second}`;
  }

  if (third) {
    formatted += `-${third}`;
  }

  if (fourth) {
    formatted += `-${fourth}`;
  }

  return formatted;
}

export function formatAuthPhoneDisplay(value: string) {
  const formatted = formatAuthPhoneInput(value);
  return formatted ? `+7 ${formatted}` : "+7";
}

export function sanitizePin(value: string) {
  return value.replace(/\D/g, "").slice(0, 6);
}

function normalizeAuthContext(value: unknown): DemoAuthContext | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Partial<DemoAuthContext>;

  if (
    !parsed.session ||
    typeof parsed.session.currentEmployeeId !== "string" ||
    typeof parsed.session.currentBranchId !== "string" ||
    typeof parsed.employeeLabel !== "string" ||
    typeof parsed.employeeDisplayLabel !== "string" ||
    typeof parsed.roleLabel !== "string" ||
    !parsed.employee ||
    !parsed.currentBranch ||
    !Array.isArray(parsed.permissionIds) ||
    !Array.isArray(parsed.availableBranches)
  ) {
    return null;
  }

  return parsed as DemoAuthContext;
}

export function getDemoAuthContext() {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const rawValue = window.localStorage.getItem(AUTH_CONTEXT_STORAGE_KEY);
    return rawValue ? normalizeAuthContext(JSON.parse(rawValue)) : null;
  } catch {
    return null;
  }
}

export function setDemoAuthContextCache(context: DemoAuthContext) {
  if (!canUseStorage()) {
    return;
  }

  const safeContext: DemoAuthContext = {
    ...context,
    employeeDisplayLabel: context.employeeDisplayLabel || formatEmployeeDisplayName(context.employee),
  };

  window.localStorage.setItem(AUTH_CONTEXT_STORAGE_KEY, JSON.stringify(safeContext));
}

export function clearDemoAuthCache() {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.removeItem(AUTH_CONTEXT_STORAGE_KEY);
}

export function clearDemoAuthSession() {
  clearDemoAuthCache();
}

export function hasDemoPermission(
  context: DemoAuthContext | null | undefined,
  permissionId: string,
) {
  return Boolean(context?.permissionIds.includes(permissionId));
}

export function formatDemoEmployeeShortAuthLabel(employee: DemoEmployeeRecord) {
  const lastName = employee.lastName.trim();
  const firstName = employee.firstName.trim();

  if (lastName && firstName) {
    const firstLetter = firstName.replace(".", "").trim().charAt(0);

    if (firstLetter) {
      return `${firstLetter.toUpperCase()}. ${lastName}`;
    }
  }

  return formatEmployeeDisplayName(employee);
}

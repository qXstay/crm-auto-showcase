const BRANCH_CANONICAL_OVERRIDES = {
  "branch-gotvalda-9": {
    code: "severny",
    name: "Северный",
    displayName: "Северный",
    address: "ул. Сервисная, 10",
  },
  "branch-shorsa-7": {
    code: "centralny",
    name: "Центральный",
    displayName: "Центральный",
    address: "ул. Центральная, 24",
  },
  "branch-pobedy-14": {
    code: "yuzhny",
    name: "Южный",
    displayName: "Южный",
    address: "ул. Южная, 7",
  },
} as const;

export function getCanonicalBranchOverride(branchId: string | null | undefined) {
  if (!branchId) {
    return null;
  }

  return BRANCH_CANONICAL_OVERRIDES[
    branchId as keyof typeof BRANCH_CANONICAL_OVERRIDES
  ] ?? null;
}

export function applyCanonicalBranchSummary<T extends {
  id: string;
  code: string;
  name: string;
  displayName: string;
  address: string;
}>(input: T): T {
  const override = getCanonicalBranchOverride(input.id);

  if (!override) {
    return input;
  }

  return {
    ...input,
    code: override.code,
    name: override.name,
    displayName: override.displayName,
    address: override.address,
  };
}

export function applyCanonicalBranchProfile<T extends {
  branchId: string;
  displayName: string;
  address: string;
}>(input: T): T {
  const override = getCanonicalBranchOverride(input.branchId);

  if (!override) {
    return input;
  }

  return {
    ...input,
    displayName: override.displayName,
    address: override.address,
  };
}

export function getCanonicalBranchDisplayName(
  branchId: string | null | undefined,
  fallbackDisplayName: string,
) {
  return getCanonicalBranchOverride(branchId)?.displayName ?? fallbackDisplayName;
}

export function getCanonicalBranchAddress(
  branchId: string | null | undefined,
  fallbackAddress: string,
) {
  return getCanonicalBranchOverride(branchId)?.address ?? fallbackAddress;
}

export function getCanonicalBranchCode(
  branchId: string | null | undefined,
  fallbackCode: string | null | undefined,
) {
  return getCanonicalBranchOverride(branchId)?.code ?? (fallbackCode ?? "");
}

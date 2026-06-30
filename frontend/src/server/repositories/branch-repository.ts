import { prisma } from "@/server/db/prisma";
import {
  applyCanonicalBranchProfile,
  applyCanonicalBranchSummary,
} from "@/features/branches/canonical";
import type { DemoBranchProfile, DemoBranchPrintSettings, DemoBranchSummary } from "@/features/branches/types";

function mapBranch(record: {
  id: string;
  code: string;
  name: string;
  displayName: string;
  address: string;
  phone: string | null;
}): DemoBranchSummary {
  return applyCanonicalBranchSummary({
    id: record.id,
    code: record.code,
    name: record.name,
    displayName: record.displayName,
    address: record.address,
    phone: record.phone ?? null,
  });
}

export async function listBranchesByEmployee(employeeId: string) {
  const accesses = await prisma.employeeBranchAccess.findMany({
    where: { employeeId, canSwitchInto: true, branch: { isActive: true } },
    include: { branch: true },
    orderBy: [{ isDefault: "desc" }, { branch: { displayName: "asc" } }],
  });

  return accesses.map((access) => mapBranch(access.branch));
}

export async function listAllBranches() {
  const branches = await prisma.branch.findMany({
    where: { isActive: true },
    orderBy: { displayName: "asc" },
  });

  return branches.map(mapBranch);
}

export async function getBranchById(branchId: string) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
  });

  return branch ? mapBranch(branch) : null;
}

export async function getBranchProfile(branchId: string): Promise<DemoBranchProfile | null> {
  const profile = await prisma.branchProfile.findUnique({
    where: { branchId },
  });

  if (!profile) {
    return null;
  }

  return applyCanonicalBranchProfile({
    branchId: profile.branchId,
    legalName: profile.legalName,
    displayName: profile.displayName,
    address: profile.address,
    phone: profile.phone ?? "",
    timezoneLabel: profile.timezoneLabel,
    workStart: profile.workStart,
    workEnd: profile.workEnd,
  });
}

export async function updateBranchProfile(
  branchId: string,
  input: Omit<DemoBranchProfile, "branchId">,
) {
  const profile = await prisma.branchProfile.update({
    where: { branchId },
    data: {
      legalName: input.legalName,
      displayName: input.displayName,
      address: input.address,
      phone: input.phone || null,
      timezoneLabel: input.timezoneLabel,
      workStart: input.workStart,
      workEnd: input.workEnd,
    },
  });

  await prisma.branch.update({
    where: { id: branchId },
    data: {
      name: input.displayName,
      displayName: input.displayName,
      address: input.address,
      phone: input.phone || null,
    },
  });

  return applyCanonicalBranchProfile({
    branchId: profile.branchId,
    legalName: profile.legalName,
    displayName: profile.displayName,
    address: profile.address,
    phone: profile.phone ?? "",
    timezoneLabel: profile.timezoneLabel,
    workStart: profile.workStart,
    workEnd: profile.workEnd,
  } satisfies DemoBranchProfile);
}

export async function getBranchPrintSettings(
  branchId: string,
): Promise<DemoBranchPrintSettings | null> {
  const settings = await prisma.branchPrintSettings.findUnique({
    where: { branchId },
  });

  if (!settings) {
    return null;
  }

  return {
    branchId: settings.branchId,
    receiptTitle: settings.receiptTitle,
    footerNote: settings.footerNote ?? "",
    showPhone: settings.showPhone,
    showAddress: settings.showAddress,
  };
}

export async function updateBranchPrintSettings(
  branchId: string,
  input: Omit<DemoBranchPrintSettings, "branchId">,
) {
  const settings = await prisma.branchPrintSettings.update({
    where: { branchId },
    data: {
      receiptTitle: input.receiptTitle,
      footerNote: input.footerNote || null,
      showPhone: input.showPhone,
      showAddress: input.showAddress,
    },
  });

  return {
    branchId: settings.branchId,
    receiptTitle: settings.receiptTitle,
    footerNote: settings.footerNote ?? "",
    showPhone: settings.showPhone,
    showAddress: settings.showAddress,
  } satisfies DemoBranchPrintSettings;
}

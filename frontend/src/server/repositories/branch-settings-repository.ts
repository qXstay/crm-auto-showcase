import { randomUUID } from "node:crypto";
import { Prisma } from "@/server/db/prisma-client";
import { getCanonicalBranchCode } from "@/features/branches/canonical";
import { prisma } from "@/server/db/prisma";
import type { DemoAccountsStore, DemoAccountRecord } from "@/features/settings-accounts/types";
import { resolvePublicBookingSlug } from "@/features/booking/public-slug";
import type { DemoBookingSettingsStore } from "@/features/settings-booking/types";
import type { DemoClientSourcesStore } from "@/features/settings-client-sources/types";
import type { DemoStorageSettingsStore } from "@/features/settings-storage/types";
import type { DemoBranchPrintSettings } from "@/features/branches/types";
import {
  createInitialClientSourcesStore,
  normalizeClientSourcesStore,
} from "@/features/settings-client-sources/defaults";

function mapAccount(account: {
  id: string;
  name: string;
  isArchived: boolean;
  isProtected: boolean;
  createdAt: Date;
  updatedAt: Date;
}): DemoAccountRecord {
  return {
    id: account.id,
    name: account.name,
    isArchived: account.isArchived,
    protected: account.isProtected,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export async function getAccountsForBranch(branchId: string): Promise<DemoAccountsStore> {
  const accounts = await prisma.paymentAccount.findMany({
    where: { branchId },
    orderBy: [{ isArchived: "asc" }, { createdAt: "asc" }],
  });

  return {
    accounts: accounts.map(mapAccount),
  };
}

export async function createAccountForBranch(branchId: string, name: string) {
  const account = await prisma.paymentAccount.create({
    data: {
      id: `account-${randomUUID()}`,
      branchId,
      name: name.trim(),
      isArchived: false,
      isProtected: false,
    },
  });

  return mapAccount(account);
}

export async function updateAccountForBranch(
  branchId: string,
  accountId: string,
  input: { name?: string; isArchived?: boolean },
) {
  const existingAccount = await prisma.paymentAccount.findFirstOrThrow({
    where: { id: accountId, branchId },
  });

  const account = await prisma.paymentAccount.update({
    where: { id: existingAccount.id },
    data: {
      name: input.name?.trim(),
      isArchived: input.isArchived,
    },
  });

  return mapAccount(account);
}

export async function getBookingSettingsForBranch(
  branchId: string,
): Promise<DemoBookingSettingsStore & {
  onlineEnabled: boolean;
  slotWindowMinutes: number;
  allowPostChoice: boolean;
  allowMultipleWindows: boolean;
  metricsId: string;
  telegramChatId: string;
}> {
  const globalPolicy = await getGlobalBookingPolicy();
  const settings = await prisma.bookingSettings.findUniqueOrThrow({
    where: { branchId },
    include: {
      branch: {
        select: {
          code: true,
        },
      },
    },
  });

  return {
    publicSlug: resolvePublicBookingSlug({
      storedValue: settings.publicSlug,
      branchCode: getCanonicalBranchCode(branchId, settings.branch.code),
    }),
    posts: Array.isArray(settings.postsJson) ? (settings.postsJson as DemoBookingSettingsStore["posts"]) : [],
    onlineEnabled: settings.onlineEnabled,
    slotWindowMinutes: globalPolicy.slotWindowMinutes,
    allowPostChoice: settings.allowPostChoice,
    allowMultipleWindows: globalPolicy.allowMultipleWindows,
    metricsId: settings.metricsId ?? "0",
    telegramChatId: settings.telegramChatId ?? "0",
  };
}

export async function getGlobalBookingPolicy(): Promise<{
  slotWindowMinutes: number;
  allowMultipleWindows: boolean;
}> {
  const settings = await prisma.bookingSettings.findFirst({
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      slotWindowMinutes: true,
      allowMultipleWindows: true,
    },
  });

  return {
    slotWindowMinutes: settings?.slotWindowMinutes ?? 15,
    allowMultipleWindows: settings?.allowMultipleWindows ?? false,
  };
}

export async function updateBookingSettingsForBranch(
  branchId: string,
  input: {
    publicSlug: string;
    posts: DemoBookingSettingsStore["posts"];
    onlineEnabled: boolean;
    slotWindowMinutes: number;
    allowPostChoice: boolean;
    allowMultipleWindows: boolean;
    metricsId: string;
    telegramChatId: string;
  },
) {
  const branch = await prisma.branch.findUniqueOrThrow({
    where: { id: branchId },
    select: { code: true },
  });

  const settings = await prisma.$transaction(async (tx) => {
    await tx.bookingSettings.updateMany({
      data: {
        slotWindowMinutes: input.slotWindowMinutes,
        allowMultipleWindows: input.allowMultipleWindows,
      },
    });

    return tx.bookingSettings.update({
      where: { branchId },
      data: {
        publicSlug: resolvePublicBookingSlug({
          storedValue: input.publicSlug,
          branchCode: getCanonicalBranchCode(branchId, branch.code),
        }),
        postsJson: input.posts,
        onlineEnabled: input.onlineEnabled,
        allowPostChoice: input.allowPostChoice,
        metricsId: input.metricsId || null,
        telegramChatId: input.telegramChatId || null,
      },
    });
  });

  return {
    publicSlug: resolvePublicBookingSlug({
      storedValue: settings.publicSlug,
      branchCode: getCanonicalBranchCode(branchId, branch.code),
    }),
    posts: settings.postsJson as DemoBookingSettingsStore["posts"],
    onlineEnabled: settings.onlineEnabled,
    slotWindowMinutes: input.slotWindowMinutes,
    allowPostChoice: settings.allowPostChoice,
    allowMultipleWindows: input.allowMultipleWindows,
    metricsId: settings.metricsId ?? "0",
    telegramChatId: settings.telegramChatId ?? "0",
  };
}

export async function getStorageSettingsForBranch(
  branchId: string,
): Promise<DemoStorageSettingsStore> {
  const settings = await prisma.storageSettings.findUniqueOrThrow({
    where: { branchId },
  });

  return {
    warehouses: Array.isArray(settings.warehousesJson)
      ? (settings.warehousesJson as DemoStorageSettingsStore["warehouses"])
      : [],
  };
}

export async function updateStorageSettingsForBranch(
  branchId: string,
  input: DemoStorageSettingsStore,
) {
  const settings = await prisma.storageSettings.update({
    where: { branchId },
    data: {
      warehousesJson: input.warehouses,
    },
  });

  return {
    warehouses: settings.warehousesJson as DemoStorageSettingsStore["warehouses"],
  };
}

export async function getClientSourceSettingsForBranch(
  branchId: string,
): Promise<DemoClientSourcesStore> {
  const existingSettings = await prisma.clientSourceSettings.findFirst({
    where: { branchId },
  });

  if (existingSettings) {
    return normalizeClientSourcesStore({
      sources: Array.isArray(existingSettings.sourcesJson) ? existingSettings.sourcesJson : [],
    });
  }

  try {
    const createdSettings = await prisma.clientSourceSettings.create({
      data: {
        branchId,
        sourcesJson: createInitialClientSourcesStore().sources,
      },
    });

    return normalizeClientSourcesStore({
      sources: Array.isArray(createdSettings.sourcesJson) ? createdSettings.sourcesJson : [],
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const concurrentSettings = await prisma.clientSourceSettings.findFirst({
        where: { branchId },
      });

      if (concurrentSettings) {
        return normalizeClientSourcesStore({
          sources: Array.isArray(concurrentSettings.sourcesJson)
            ? concurrentSettings.sourcesJson
            : [],
        });
      }
    }

    throw error;
  }
}

export async function updateClientSourceSettingsForBranch(
  branchId: string,
  input: DemoClientSourcesStore,
) {
  const normalized = normalizeClientSourcesStore(input);
  const settings = await prisma.clientSourceSettings.upsert({
    where: { branchId },
    update: {
      sourcesJson: normalized.sources,
    },
    create: {
      branchId,
      sourcesJson: normalized.sources,
    },
  });

  return normalizeClientSourcesStore({
    sources: Array.isArray(settings.sourcesJson) ? settings.sourcesJson : [],
  });
}

export async function getPrintSettingsForBranch(
  branchId: string,
): Promise<DemoBranchPrintSettings> {
  const settings = await prisma.branchPrintSettings.findUniqueOrThrow({
    where: { branchId },
  });

  return {
    branchId: settings.branchId,
    receiptTitle: settings.receiptTitle,
    footerNote: settings.footerNote ?? "",
    showPhone: settings.showPhone,
    showAddress: settings.showAddress,
  };
}

export async function updatePrintSettingsForBranch(
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
  };
}

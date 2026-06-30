import {
  getCanonicalBranchAddress,
  getCanonicalBranchCode,
  getCanonicalBranchDisplayName,
} from "@/features/branches/canonical";
import type { BookingPost } from "@/features/booking/types";
import { normalizePublicBookingSlugSegment, resolvePublicBookingSlug } from "@/features/booking/public-slug";
import { buildBookingPostsFromSettings } from "@/features/settings-booking/storage";
import type { DemoBookingSettingsStore } from "@/features/settings-booking/types";
import { prisma } from "@/server/db/prisma";
import { listDayBookingsForBranch } from "@/server/repositories/booking-read-repository";
import { getGlobalBookingPolicy } from "@/server/repositories/branch-settings-repository";

export type PublicBookingContext = {
  slug: string;
  branchId: string;
  branchName: string;
  phone: string;
  address: string;
  timezoneLabel: string;
  workStart: string;
  workEnd: string;
  onlineEnabled: boolean;
  slotWindowMinutes: number;
  allowPostChoice: boolean;
  allowMultipleWindows: boolean;
  posts: BookingPost[];
  entries: Awaited<ReturnType<typeof listDayBookingsForBranch>>["entries"];
};

export type PublicBookingBranchOption = {
  slug: string;
  branchId: string;
  branchName: string;
  address: string;
  phone: string;
  onlineEnabled: boolean;
};

export async function listPublicBookingBranches() {
  const settingsList = await prisma.bookingSettings.findMany({
    where: {
      branch: { isActive: true },
    },
    include: {
      branch: {
        include: {
          profile: true,
        },
      },
    },
    orderBy: {
      branch: {
        displayName: "asc",
      },
    },
  });

  return settingsList.map((settings) => {
    const profile = settings.branch.profile;

    return {
      slug: resolvePublicBookingSlug({
        storedValue: settings.publicSlug,
        branchCode: getCanonicalBranchCode(settings.branchId, settings.branch.code),
      }),
      branchId: settings.branchId,
      branchName: getCanonicalBranchDisplayName(
        settings.branchId,
        profile?.displayName?.trim() ||
          settings.branch.displayName.trim() ||
          settings.branch.name.trim(),
      ),
      address: getCanonicalBranchAddress(
        settings.branchId,
        profile?.address?.trim() || settings.branch.address.trim(),
      ),
      phone: profile?.phone?.trim() || settings.branch.phone?.trim() || "",
      onlineEnabled: settings.onlineEnabled,
    } satisfies PublicBookingBranchOption;
  });
}

export async function getPublicBookingContextBySlug(slug: string, dateKey: string) {
  const normalizedSlug = normalizePublicBookingSlugSegment(slug);

  if (!normalizedSlug) {
    return null;
  }

  const settingsList = await prisma.bookingSettings.findMany({
    where: {
      branch: { isActive: true },
    },
    include: {
      branch: {
        include: {
          profile: true,
        },
      },
    },
  });

  const settings = settingsList.find(
    (candidate) =>
      resolvePublicBookingSlug({
        storedValue: candidate.publicSlug,
        branchCode: getCanonicalBranchCode(candidate.branchId, candidate.branch.code),
      }) === normalizedSlug,
  );

  if (!settings) {
    return null;
  }

  const globalPolicy = await getGlobalBookingPolicy();

  const profile = settings.branch.profile;
  const postsStore = {
    publicSlug: settings.publicSlug,
    posts: Array.isArray(settings.postsJson)
      ? (settings.postsJson as DemoBookingSettingsStore["posts"])
      : [],
  } satisfies DemoBookingSettingsStore;

  return {
    slug: resolvePublicBookingSlug({
      storedValue: settings.publicSlug,
      branchCode: getCanonicalBranchCode(settings.branchId, settings.branch.code),
    }),
    branchId: settings.branchId,
    branchName: getCanonicalBranchDisplayName(
      settings.branchId,
      profile?.displayName?.trim() ||
        settings.branch.displayName.trim() ||
        settings.branch.name.trim(),
    ),
    phone: profile?.phone?.trim() || settings.branch.phone?.trim() || "",
    address: getCanonicalBranchAddress(
      settings.branchId,
      profile?.address?.trim() || settings.branch.address.trim(),
    ),
    timezoneLabel: profile?.timezoneLabel?.trim() || "",
    workStart: profile?.workStart?.trim() || "09:00",
    workEnd: profile?.workEnd?.trim() || "21:00",
    onlineEnabled: settings.onlineEnabled,
    slotWindowMinutes: globalPolicy.slotWindowMinutes,
    allowPostChoice: settings.allowPostChoice,
    allowMultipleWindows: globalPolicy.allowMultipleWindows,
    posts: buildBookingPostsFromSettings(postsStore),
    entries: (await listDayBookingsForBranch(settings.branchId, dateKey)).entries,
  } satisfies PublicBookingContext;
}

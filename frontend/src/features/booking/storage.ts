import {
  BOOKING_DAY_ENTRIES,
  BOOKING_MONTH_ENTRIES,
} from "@/features/booking/mock-data";
import type {
  BookingDraft,
  BookingEntry,
  BookingGroupView,
  BookingPost,
  DemoBookingStore,
} from "@/features/booking/types";
import type { DemoClient } from "@/features/clients/types";

const BOOKING_STORAGE_KEY = "pegas-demo-bookings";
const DEFAULT_BRANCH_ID = "branch-gotvalda-9";

function canUseStorage() {
  return typeof window !== "undefined";
}

function cloneEntry(entry: BookingEntry): BookingEntry {
  return { ...entry };
}

function normalizeBranchId(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : DEFAULT_BRANCH_ID;
}

function sortEntries(entries: BookingEntry[]) {
  return [...entries].sort((left, right) => {
    const dateDiff = left.date.localeCompare(right.date);

    if (dateDiff !== 0) {
      return dateDiff;
    }

    const postDiff = left.postId.localeCompare(right.postId);

    if (postDiff !== 0) {
      return postDiff;
    }

    const startDiff = left.startTime.localeCompare(right.startTime);

    if (startDiff !== 0) {
      return startDiff;
    }

    return left.id.localeCompare(right.id);
  });
}

function createInitialStore(): DemoBookingStore {
  return {
    entries: sortEntries(
      [...BOOKING_MONTH_ENTRIES, ...BOOKING_DAY_ENTRIES].map((entry) => ({
        ...cloneEntry(entry),
        branchId: normalizeBranchId((entry as Partial<BookingEntry>).branchId),
      })),
    ),
  };
}

export function filterDemoBookingEntriesByBranch(
  entries: BookingEntry[],
  branchId: string | null | undefined,
) {
  const normalizedBranchId = normalizeBranchId(branchId);
  return entries.filter((entry) => normalizeBranchId(entry.branchId) === normalizedBranchId);
}

export function getInitialDemoBookingStore(branchId?: string): DemoBookingStore {
  const store = createInitialStore();
  return {
    entries: branchId ? filterDemoBookingEntriesByBranch(store.entries, branchId) : store.entries,
  };
}

function normalizeEntry(value: unknown): BookingEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const entry = value as Partial<BookingEntry>;

  if (
    typeof entry.id !== "string" ||
    typeof entry.client !== "string" ||
    typeof entry.phone !== "string" ||
    typeof entry.car !== "string" ||
    typeof entry.date !== "string" ||
    typeof entry.startTime !== "string" ||
    typeof entry.endTime !== "string" ||
    typeof entry.postId !== "string" ||
    typeof entry.service !== "string"
  ) {
    return null;
  }

  return {
    id: entry.id,
    groupId: typeof entry.groupId === "string" && entry.groupId ? entry.groupId : entry.id,
    branchId: normalizeBranchId(entry.branchId),
    clientId: typeof entry.clientId === "string" && entry.clientId ? entry.clientId : null,
    anonymous: Boolean(entry.anonymous),
    client: entry.client,
    phone: entry.phone,
    car: entry.car,
    date: entry.date,
    startTime: entry.startTime,
    endTime: entry.endTime,
    postId: entry.postId,
    service: entry.service,
    comment: typeof entry.comment === "string" ? entry.comment : "",
    createdAt: typeof entry.createdAt === "string" ? entry.createdAt : undefined,
    updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : undefined,
    createdByEmployeeId:
      typeof entry.createdByEmployeeId === "string" && entry.createdByEmployeeId
        ? entry.createdByEmployeeId
        : null,
  };
}

function normalizeStore(value: unknown): DemoBookingStore {
  if (!value || typeof value !== "object" || !Array.isArray((value as DemoBookingStore).entries)) {
    return createInitialStore();
  }

  const entries = (value as DemoBookingStore).entries
    .map(normalizeEntry)
    .filter((entry): entry is BookingEntry => Boolean(entry));

  return {
    entries: sortEntries(entries),
  };
}

export function loadDemoBookingStore(): DemoBookingStore {
  if (!canUseStorage()) {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(BOOKING_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    const normalizedStore = normalizeStore(JSON.parse(rawValue));
    const normalizedRawValue = JSON.stringify(normalizedStore);

    if (normalizedRawValue !== rawValue) {
      window.localStorage.setItem(BOOKING_STORAGE_KEY, normalizedRawValue);
    }

    return normalizedStore;
  } catch {
    return createInitialStore();
  }
}

export function loadDemoBookingEntriesForBranch(branchId: string | null | undefined) {
  return filterDemoBookingEntriesByBranch(loadDemoBookingStore().entries, branchId);
}

export function saveDemoBookingStore(store: DemoBookingStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    BOOKING_STORAGE_KEY,
    JSON.stringify({
      entries: sortEntries(store.entries).map(cloneEntry),
    } satisfies DemoBookingStore),
  );
}

export function saveDemoBookingEntriesForBranch(input: {
  branchId: string | null | undefined;
  entries: BookingEntry[];
}) {
  const normalizedBranchId = normalizeBranchId(input.branchId);
  const currentStore = loadDemoBookingStore();
  const preservedEntries = currentStore.entries.filter(
    (entry) => normalizeBranchId(entry.branchId) !== normalizedBranchId,
  );

  saveDemoBookingStore({
    entries: [
      ...preservedEntries,
      ...input.entries.map((entry) => ({
        ...cloneEntry(entry),
        branchId: normalizedBranchId,
      })),
    ],
  });
}

export function countUniqueBookings(entries: BookingEntry[]) {
  return new Set(entries.map((entry) => entry.groupId)).size;
}

function normalizeBookingName(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/\s+/g, " ")
    .trim();
}

function formatBookingDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function buildBookingClientLabel(client: DemoClient) {
  const vehicle = client.vehicles[0] ?? null;
  const carLabel =
    vehicle && [vehicle.brand, vehicle.model, vehicle.plateNumber].some(Boolean)
      ? [vehicle.brand, vehicle.model, vehicle.plateNumber].filter(Boolean).join(" ")
      : "";

  return [client.name, carLabel, client.phone].filter(Boolean).join(" · ");
}

export function groupBookingEntries(
  entries: BookingEntry[],
  posts: BookingPost[],
) {
  const postsMap = new Map(posts.map((post) => [post.id, post.label]));
  const groups = new Map<string, BookingEntry[]>();

  entries.forEach((entry) => {
    if (!groups.has(entry.groupId)) {
      groups.set(entry.groupId, []);
    }

    groups.get(entry.groupId)?.push(entry);
  });

  return [...groups.entries()]
    .map(([groupId, groupEntries]) => {
      const sortedEntries = sortEntries(groupEntries);
      const first = sortedEntries[0];
      const last = sortedEntries[sortedEntries.length - 1];
      const postLabel = [...new Set(sortedEntries.map((entry) => postsMap.get(entry.postId) ?? entry.postId))]
        .join(", ");

      return {
        id: groupId,
        clientId: first.clientId,
        anonymous: first.anonymous,
        isOnline: first.service === "Онлайн-запись" || first.createdByEmployeeId === null,
        client: first.client,
        phone: first.phone,
        date: first.date,
        timeLabel: `${first.startTime}-${last.endTime}`,
        startTime: first.startTime,
        endTime: last.endTime,
        postLabel,
        comment: first.comment ?? "",
      } satisfies BookingGroupView;
    })
    .sort((left, right) => {
      const dateDiff = left.date.localeCompare(right.date);

      if (dateDiff !== 0) {
        return dateDiff;
      }

      return left.startTime.localeCompare(right.startTime);
    });
}

export function removeBookingGroup(entries: BookingEntry[], groupId: string) {
  return sortEntries(entries.filter((entry) => entry.groupId !== groupId));
}

export function getUpcomingBookingGroups(
  entries: BookingEntry[],
  posts: BookingPost[],
  activeDate: string,
  todayKey: string,
  currentTimeLabel: string,
  limit = 6,
) {
  const groupedEntries = groupBookingEntries(entries, posts);

  if (activeDate > todayKey) {
    return groupedEntries
      .filter((entry) => entry.date === activeDate)
      .slice(0, limit);
  }

  if (activeDate < todayKey) {
    return [];
  }

  return groupedEntries
    .filter((entry) => {
      if (entry.date !== activeDate) {
        return false;
      }

      return entry.endTime > currentTimeLabel;
    })
    .slice(0, limit);
}

export function getFallbackUpcomingBookingGroups(
  entries: BookingEntry[],
  posts: BookingPost[],
  activeDate: string,
  todayKey: string,
  currentTimeLabel: string,
  limit = 6,
) {
  const groupedEntries = groupBookingEntries(entries, posts);

  const candidateEntries = groupedEntries.filter((entry) => {
    if (activeDate > todayKey) {
      return entry.date > activeDate;
    }

    if (activeDate === todayKey) {
      return entry.date > todayKey;
    }

    if (entry.date > todayKey) {
      return true;
    }

    if (entry.date < todayKey) {
      return false;
    }

    return entry.endTime > currentTimeLabel;
  });

  const nearestDate = candidateEntries[0]?.date;

  if (!nearestDate) {
    return [];
  }

  return candidateEntries
    .filter((entry) => entry.date === nearestDate)
    .slice(0, limit);
}

export function getClientBookingItems(
  client: DemoClient,
  entries: BookingEntry[],
  posts: BookingPost[],
) {
  const baseBookings = client.bookings.map((booking) => ({ ...booking }));
  const clientPhoneDigits = client.phone.replace(/\D/g, "");
  const clientNames = new Set(
    [client.name, [client.firstName, client.lastName].filter(Boolean).join(" ").trim()]
      .map(normalizeBookingName)
      .filter(Boolean),
  );

  const dynamicBookings = groupBookingEntries(entries, posts)
    .filter((entry) => {
      if (entry.clientId && entry.clientId === client.id) {
        return true;
      }

      const entryPhoneDigits = entry.phone.replace(/\D/g, "");

      if (clientPhoneDigits && entryPhoneDigits && clientPhoneDigits === entryPhoneDigits) {
        return true;
      }

      const normalizedClient = normalizeBookingName(entry.client);

      return Boolean(normalizedClient && clientNames.has(normalizedClient));
    })
    .map((entry) => ({
      id: entry.id,
      date: `${formatBookingDateLabel(entry.date)}, ${entry.timeLabel}`,
      note: entry.comment || entry.postLabel,
    }));

  return [
    ...dynamicBookings,
    ...baseBookings.filter((booking) => !dynamicBookings.some((item) => item.id === booking.id)),
  ];
}

function resolveBookingClientSnapshot(
  clientId: string,
  clients: DemoClient[],
) {
  if (!clientId || clientId === "anonymous") {
    return {
      clientId: null,
      anonymous: true,
      client: "Анонимный клиент",
      phone: "",
      car: "Не указан",
    };
  }

  const client = clients.find((item) => item.id === clientId);
  const vehicle = client?.vehicles[0] ?? null;

  if (!client) {
    return {
      clientId: null,
      anonymous: true,
      client: "Анонимный клиент",
      phone: "",
      car: "Не указан",
    };
  }

  return {
    clientId: client.id,
    anonymous: false,
    client: client.name,
    phone: client.phone,
    car:
      vehicle && [vehicle.brand, vehicle.model, vehicle.plateNumber].some(Boolean)
        ? [vehicle.brand, vehicle.model, vehicle.plateNumber].filter(Boolean).join(" ")
        : "Не указан",
  };
}

export function createDemoBookingEntriesFromDraft(input: {
  branchId?: string | null;
  draft: BookingDraft;
  clients: DemoClient[];
  posts: BookingPost[];
  createdByEmployeeId?: string | null;
}) {
  const groupId = `booking-${Date.now()}`;
  const timestamp = new Date().toISOString();
  const clientSnapshot = resolveBookingClientSnapshot(input.draft.clientId, input.clients);
  const validPosts = new Set(input.posts.map((post) => post.id));

  return sortEntries(
    input.draft.segments.map((segment, index) => ({
      id: `${groupId}-${index + 1}`,
      groupId,
      branchId: normalizeBranchId(input.branchId),
      clientId: clientSnapshot.clientId,
      anonymous: clientSnapshot.anonymous,
      client: clientSnapshot.client,
      phone: clientSnapshot.phone,
      car: clientSnapshot.car,
      date: input.draft.date,
      startTime: segment.start,
      endTime: segment.end,
      postId: validPosts.has(segment.postId) ? segment.postId : input.posts[0]?.id ?? segment.postId,
      service: "Новая запись",
      comment: input.draft.note.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      createdByEmployeeId: input.createdByEmployeeId ?? null,
    })),
  );
}

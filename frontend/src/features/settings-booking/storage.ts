import type {
  DemoBookingSettingsPost,
  DemoBookingSettingsStore,
} from "@/features/settings-booking/types";

const BOOKING_SETTINGS_STORAGE_KEY = "pegas-demo-settings-booking";
const DEFAULT_PUBLIC_SLUG = "";

const INITIAL_POSTS: DemoBookingSettingsPost[] = [
  { id: "post-1", name: "Пост 1" },
  { id: "post-2", name: "Пост 2" },
  { id: "post-3", name: "Пост 3" },
];

function clonePost(post: DemoBookingSettingsPost): DemoBookingSettingsPost {
  return { ...post };
}

function createInitialStore(): DemoBookingSettingsStore {
  return {
    publicSlug: DEFAULT_PUBLIC_SLUG,
    posts: INITIAL_POSTS.map(clonePost),
  };
}

export function getInitialDemoBookingSettingsStore(): DemoBookingSettingsStore {
  return createInitialStore();
}

function canUseStorage() {
  return typeof window !== "undefined";
}

function normalizeStore(value: unknown): DemoBookingSettingsStore {
  if (!value || typeof value !== "object") {
    return createInitialStore();
  }

  const parsed = value as Partial<DemoBookingSettingsStore>;
  const posts = Array.isArray(parsed.posts)
    ? parsed.posts.filter(
        (post): post is DemoBookingSettingsPost =>
          Boolean(post) &&
          typeof post.id === "string" &&
          typeof post.name === "string" &&
          post.name.trim().length > 0,
      )
    : [];

  return {
    publicSlug:
      typeof parsed.publicSlug === "string" && parsed.publicSlug.trim()
        ? parsed.publicSlug.trim()
        : DEFAULT_PUBLIC_SLUG,
    posts: posts.length > 0 ? posts.map(clonePost) : createInitialStore().posts,
  };
}

export function loadDemoBookingSettingsStore(): DemoBookingSettingsStore {
  if (!canUseStorage()) {
    return createInitialStore();
  }

  try {
    const rawValue = window.localStorage.getItem(BOOKING_SETTINGS_STORAGE_KEY);

    if (!rawValue) {
      return createInitialStore();
    }

    return normalizeStore(JSON.parse(rawValue));
  } catch {
    return createInitialStore();
  }
}

export function saveDemoBookingSettingsStore(store: DemoBookingSettingsStore) {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(
    BOOKING_SETTINGS_STORAGE_KEY,
    JSON.stringify({
      publicSlug: store.publicSlug,
      posts: store.posts.map(clonePost),
    } satisfies DemoBookingSettingsStore),
  );
}

export function buildBookingPostsFromSettings(store: DemoBookingSettingsStore) {
  return store.posts.map((post) => ({
    id: post.id,
    label: post.name.toUpperCase(),
  }));
}

import { getInitialDemoClientsStore, loadDemoClientsStore } from "@/features/clients/storage";
import type { DemoClient } from "@/features/clients/types";
import type { DemoClientSourcesStore } from "@/features/settings-client-sources/types";
import {
  createInitialClientSourcesStore,
  normalizeClientSourceName,
  normalizeClientSourcesStore,
} from "@/features/settings-client-sources/defaults";

const CLIENT_SOURCES_STORAGE_KEY = "pegas-demo-settings-client-sources";

export function getInitialDemoClientSourcesStore(): DemoClientSourcesStore {
  return createInitialClientSourcesStore();
}

export function loadDemoClientSourcesStore(): DemoClientSourcesStore {
  if (typeof window === "undefined") {
    return createInitialClientSourcesStore();
  }

  try {
    const rawValue = window.localStorage.getItem(CLIENT_SOURCES_STORAGE_KEY);

    if (!rawValue) {
      return createInitialClientSourcesStore();
    }

    return normalizeClientSourcesStore(JSON.parse(rawValue));
  } catch {
    return createInitialClientSourcesStore();
  }
}

export function saveDemoClientSourcesStore(store: DemoClientSourcesStore) {
  window.localStorage.setItem(
    CLIENT_SOURCES_STORAGE_KEY,
    JSON.stringify({
      sources: store.sources.map((source) => ({ ...source })),
    } satisfies DemoClientSourcesStore),
  );
}

export function getClientSourceUsageCount(name: string, clients?: DemoClient[]) {
  const normalized = normalizeClientSourceName(name);
  const sourceClients =
    clients ??
    (typeof window === "undefined"
      ? getInitialDemoClientsStore().clients
      : loadDemoClientsStore().clients);

  return sourceClients.filter(
    (client) => normalizeClientSourceName(client.source) === normalized,
  ).length;
}

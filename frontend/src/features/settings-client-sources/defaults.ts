import type {
  DemoClientSourceRecord,
  DemoClientSourcesStore,
} from "@/features/settings-client-sources/types";

const DEFAULT_TIMESTAMP = "2026-03-18T09:00:00+05:00";

export const DEFAULT_CLIENT_SOURCE_TEMPLATES = [
  {
    id: "source-internet",
    name: "интернет",
    protected: true,
  },
] as const satisfies Array<Pick<DemoClientSourceRecord, "id" | "name" | "protected">>;

function cloneSource(source: DemoClientSourceRecord): DemoClientSourceRecord {
  return { ...source };
}

export function createInitialClientSourcesStore(): DemoClientSourcesStore {
  return {
    sources: DEFAULT_CLIENT_SOURCE_TEMPLATES.map((source) =>
      cloneSource({
        ...source,
        createdAt: DEFAULT_TIMESTAMP,
        updatedAt: DEFAULT_TIMESTAMP,
      }),
    ),
  };
}

export function normalizeClientSourcesStore(value: unknown): DemoClientSourcesStore {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as DemoClientSourcesStore).sources)
  ) {
    return createInitialClientSourcesStore();
  }

  const sources = (value as DemoClientSourcesStore).sources.filter(
    (source): source is DemoClientSourceRecord =>
      Boolean(source) &&
      typeof source.id === "string" &&
      typeof source.name === "string" &&
      typeof source.protected === "boolean" &&
      typeof source.createdAt === "string" &&
      typeof source.updatedAt === "string",
  );

  return {
    sources:
      sources.length > 0
        ? sources.map(cloneSource)
        : createInitialClientSourcesStore().sources,
  };
}

export function sanitizeClientSourceName(value: string) {
  return value.trim();
}

export function normalizeClientSourceName(value: string) {
  return sanitizeClientSourceName(value).toLocaleLowerCase("ru-RU");
}

export function formatClientCount(value: number) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return `${value} клиент`;
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) {
    return `${value} клиента`;
  }

  return `${value} клиентов`;
}

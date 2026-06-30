const DEMO_SQLITE_FILENAME = "demo-profile.sqlite";
const SQLITE_BUSY_TIMEOUT_MS = 5000;
const DEFAULT_SQLITE_JOURNAL_MODE = "WAL";
const ALLOWED_SQLITE_JOURNAL_MODES = new Set([
  "WAL",
  "DELETE",
  "TRUNCATE",
  "PERSIST",
  "MEMORY",
  "OFF",
]);

type PrismaPragmaClient = {
  $connect(): Promise<void>;
  $queryRawUnsafe(query: string): Promise<unknown>;
};

function extractSqliteFilename(databaseUrl: string | undefined): string | null {
  if (typeof databaseUrl !== "string") {
    return null;
  }

  const trimmedValue = databaseUrl.trim();
  if (!trimmedValue.startsWith("file:")) {
    return null;
  }

  const sqliteTarget = trimmedValue.slice("file:".length).split(/[?#]/, 1)[0];
  const pathSegments = sqliteTarget.replaceAll("\\", "/").split("/").filter(Boolean);
  return pathSegments.at(-1) ?? null;
}

function isDemoProfileSqliteRuntime(): boolean {
  if (process.env.CRM_AUTO_PRISMA_CLIENT !== "sqlite") {
    return false;
  }

  return extractSqliteFilename(process.env.SQLITE_DATABASE_URL) === DEMO_SQLITE_FILENAME;
}

function resolveSqliteJournalMode(rawValue = process.env.SQLITE_JOURNAL_MODE): string {
  const normalizedValue = String(rawValue ?? "").trim().toUpperCase();

  if (!normalizedValue) {
    return DEFAULT_SQLITE_JOURNAL_MODE;
  }

  if (ALLOWED_SQLITE_JOURNAL_MODES.has(normalizedValue)) {
    return normalizedValue;
  }

  console.warn(
    `[sqlite-demo-pragmas] unsupported SQLITE_JOURNAL_MODE="${normalizedValue}", fallback ${DEFAULT_SQLITE_JOURNAL_MODE}`,
  );

  return DEFAULT_SQLITE_JOURNAL_MODE;
}

export async function configureDemoProfileSqlitePragmas(
  prisma: PrismaPragmaClient,
): Promise<void> {
  if (!isDemoProfileSqliteRuntime()) {
    return;
  }

  const journalMode = resolveSqliteJournalMode();

  await prisma.$connect();
  await prisma.$queryRawUnsafe(`PRAGMA journal_mode = ${journalMode}`);
  await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = ${SQLITE_BUSY_TIMEOUT_MS}`);
  await prisma.$queryRawUnsafe("PRAGMA foreign_keys = ON");
}

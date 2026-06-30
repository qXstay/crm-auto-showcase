import process from "node:process";
import { PrismaClient } from "../node_modules/.prisma/sqlite-client/index.js";
import {
  configureDemoProfileSqlitePragmas,
  isDemoProfileSqliteUrl,
  isFileSqliteUrl,
} from "./sqlite-pragmas.mjs";

const sqliteDatabaseUrl = process.env.SQLITE_DATABASE_URL ?? "";

if (!isFileSqliteUrl(sqliteDatabaseUrl)) {
  console.error("[db:configure:sqlite] SQLITE_DATABASE_URL must use a file: SQLite URL.");
  process.exit(1);
}

if (!isDemoProfileSqliteUrl(sqliteDatabaseUrl)) {
  console.log("[db:configure:sqlite] Skipping PRAGMA bootstrap: demo-profile target not detected.");
  process.exit(0);
}

const prisma = new PrismaClient();

try {
  await configureDemoProfileSqlitePragmas(prisma);
  console.log("[db:configure:sqlite] Applied SQLite PRAGMA bootstrap for demo-profile.");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[db:configure:sqlite] Failed to apply SQLite PRAGMA bootstrap: ${message}`);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect().catch(() => undefined);
}

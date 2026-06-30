import { PrismaClient } from "@/server/db/prisma-client";
import { configureDemoProfileSqlitePragmas } from "@/server/db/sqlite-demo-pragmas";

declare global {
  var __pegasPrismaClient__: PrismaClient | undefined;
}

const prismaClient =
  globalThis.__pegasPrismaClient__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__pegasPrismaClient__ = prismaClient;
}

await configureDemoProfileSqlitePragmas(prismaClient);

export const prisma = prismaClient;

import path from "node:path";
import type { NextConfig } from "next";

const useSqlitePrismaClient = process.env.CRM_AUTO_PRISMA_CLIENT === "sqlite";
const useStandaloneOutput = process.env.CRM_AUTO_STANDALONE === "true";
const sqlitePrismaClientTurbopackAlias = "./src/server/db/prisma-client.sqlite.ts";
const sqlitePrismaClientAlias = path.resolve(
  __dirname,
  "src/server/db/prisma-client.sqlite.ts",
);
const standaloneTraceIncludes = [
  "./node_modules/.prisma/sqlite-client/**/*",
  "./node_modules/argon2/**/*",
  "./node_modules/@phc/format/**/*",
  "./node_modules/node-gyp-build/**/*",
  "./prisma/configure-sqlite.mjs",
  "./prisma/demo-reset-loop.mjs",
  "./prisma/initial-catalog.mjs",
  "./prisma/seed.mjs",
  "./prisma/sqlite-pragmas.mjs",
  "./prisma/start-demo-sqlite-hosted.mjs",
  "./prisma/start-demo-sqlite.mjs",
  "./prisma/schema.sqlite.prisma",
];

const nextConfig: NextConfig = {
  output: useStandaloneOutput ? "standalone" : undefined,
  ...(useStandaloneOutput
    ? {
        outputFileTracingIncludes: {
          "/**": standaloneTraceIncludes,
        },
      }
    : {}),
  turbopack: {
    ...(useSqlitePrismaClient
      ? {
          resolveAlias: {
            "@/server/db/prisma-client": sqlitePrismaClientTurbopackAlias,
          },
        }
      : {}),
  },
  webpack: (config) => {
    if (useSqlitePrismaClient) {
      config.resolve ??= {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        "@/server/db/prisma-client": sqlitePrismaClientAlias,
      };
    }

    return config;
  },
};

export default nextConfig;

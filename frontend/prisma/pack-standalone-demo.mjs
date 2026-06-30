import { cp, mkdir, readdir, readFile, rm, stat, symlink } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_OUT_DIR = ".next/deploy/demo-sqlite-standalone";
const runtimePrismaFiles = [
  "configure-sqlite.mjs",
  "demo-reset-loop.mjs",
  "initial-catalog.mjs",
  "seed.mjs",
  "sqlite-pragmas.mjs",
  "start-demo-sqlite-hosted.mjs",
  "start-demo-sqlite.mjs",
];
const runtimeSchemaFiles = ["schema.sqlite.prisma"];
const rootRuntimeModuleDirs = [
  "node_modules/.prisma/sqlite-client",
  "node_modules/argon2",
  "node_modules/@phc/format",
  "node_modules/node-gyp-build",
];

const packageRoot = path.resolve(process.cwd(), process.argv[2] ?? DEFAULT_OUT_DIR);

async function ensureExists(relativePath) {
  try {
    await stat(path.resolve(process.cwd(), relativePath));
  } catch {
    throw new Error(`Missing required path: ${relativePath}`);
  }
}

async function copyTree(sourceRelativePath, targetRelativePath) {
  const sourcePath = path.resolve(process.cwd(), sourceRelativePath);
  const targetPath = path.resolve(packageRoot, targetRelativePath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await cp(sourcePath, targetPath, { recursive: true });
}

async function copyLocalTree(sourceRelativePath, targetRelativePath) {
  const sourcePath = path.resolve(process.cwd(), sourceRelativePath);
  const targetPath = path.resolve(process.cwd(), targetRelativePath);

  await mkdir(path.dirname(targetPath), { recursive: true });
  await rm(targetPath, { recursive: true, force: true });
  await cp(sourcePath, targetPath, { recursive: true });
}

async function collectFilePaths(rootPath) {
  const directoryEntries = await readdir(rootPath, { withFileTypes: true });
  const filePaths = [];

  for (const entry of directoryEntries) {
    const entryPath = path.join(rootPath, entry.name);

    if (entry.isDirectory()) {
      filePaths.push(...(await collectFilePaths(entryPath)));
      continue;
    }

    if (entry.isFile()) {
      filePaths.push(entryPath);
    }
  }

  return filePaths;
}

async function findArgon2ExternalAliases() {
  const serverRoot = path.resolve(process.cwd(), ".next/standalone/.next/server");
  const filePaths = await collectFilePaths(serverRoot);
  const aliases = new Set();

  for (const filePath of filePaths) {
    if (!filePath.endsWith(".js") && !filePath.endsWith(".mjs")) {
      continue;
    }

    const fileContents = await readFile(filePath, "utf8");

    for (const match of fileContents.matchAll(/\bargon2-[a-f0-9]+\b/g)) {
      aliases.add(match[0]);
    }
  }

  return [...aliases].sort();
}

async function createArgon2AliasNode(targetRootPath, aliasName, nodeModulesRelativePath = "node_modules") {
  const nodeModulesPath = path.join(targetRootPath, nodeModulesRelativePath);
  const aliasPath = path.join(nodeModulesPath, aliasName);
  const relativeTargetPath = path.relative(nodeModulesPath, path.join(targetRootPath, "node_modules", "argon2"));

  await mkdir(nodeModulesPath, { recursive: true });
  await rm(aliasPath, { recursive: true, force: true });
  await symlink(relativeTargetPath || ".", aliasPath, "dir");
}

async function main() {
  await ensureExists(".next/standalone/server.js");
  await ensureExists(".next/static");
  await ensureExists("public");
  await ensureExists("package.json");

  for (const relativePath of runtimePrismaFiles) {
    await ensureExists(path.join("prisma", relativePath));
  }

  for (const relativePath of runtimeSchemaFiles) {
    await ensureExists(path.join("prisma", relativePath));
  }

  for (const relativePath of rootRuntimeModuleDirs) {
    await ensureExists(relativePath);
  }

  await copyLocalTree(".next/static", ".next/standalone/.next/static");
  await copyLocalTree("public", ".next/standalone/public");

  const argon2Aliases = await findArgon2ExternalAliases();

  for (const aliasName of argon2Aliases) {
    await createArgon2AliasNode(path.resolve(process.cwd(), ".next/standalone"), aliasName);
  }

  await rm(packageRoot, { recursive: true, force: true });
  await mkdir(packageRoot, { recursive: true });

  await copyTree(".next/standalone", ".next/standalone");
  await copyTree(".next/static", ".next/static");
  await copyTree(".next/static", ".next/standalone/.next/static");
  await copyTree("public", "public");
  await copyTree("public", ".next/standalone/public");
  await copyTree("package.json", "package.json");

  for (const relativePath of runtimePrismaFiles) {
    const sourcePath = path.join("prisma", relativePath);
    await copyTree(sourcePath, sourcePath);
  }

  for (const relativePath of runtimeSchemaFiles) {
    const sourcePath = path.join("prisma", relativePath);
    await copyTree(sourcePath, sourcePath);
  }

  for (const relativePath of runtimePrismaFiles) {
    const sourcePath = path.join("prisma", relativePath);
    await copyTree(sourcePath, path.join(".next/standalone", sourcePath));
  }

  for (const relativePath of runtimeSchemaFiles) {
    const sourcePath = path.join("prisma", relativePath);
    await copyTree(sourcePath, path.join(".next/standalone", sourcePath));
  }

  for (const relativePath of rootRuntimeModuleDirs) {
    await copyTree(relativePath, relativePath);
  }

  for (const aliasName of argon2Aliases) {
    await createArgon2AliasNode(path.resolve(packageRoot, ".next/standalone"), aliasName);
    await createArgon2AliasNode(path.resolve(packageRoot, ".next/standalone"), aliasName, ".next/node_modules");
  }

  console.log(`[pack:demo:sqlite:standalone] package ready at ${packageRoot}`);
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[pack:demo:sqlite:standalone] failed: ${message}`);
  process.exitCode = 1;
}

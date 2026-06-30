import process from "node:process";

const DEFAULT_LOOP_INTERVAL_SECONDS = 60;
const DEMO_SQLITE_FILENAME = "demo-profile.sqlite";

function isTrueEnvFlag(value) {
  return value === "true";
}

function resolveLoopIntervalSeconds() {
  const envValue = Number.parseInt(process.env.DEMO_RESET_LOOP_INTERVAL_SECONDS ?? "", 10);
  return Number.isFinite(envValue) && envValue > 0 ? envValue : DEFAULT_LOOP_INTERVAL_SECONDS;
}

function extractSqliteFilename() {
  const sqliteUrl =
    (process.env.SQLITE_DATABASE_URL ?? process.env.DATABASE_URL ?? "").trim();

  if (!sqliteUrl.startsWith("file:")) {
    return null;
  }

  const sqliteTarget = sqliteUrl.slice("file:".length).split(/[?#]/, 1)[0];
  const pathSegments = sqliteTarget.replaceAll("\\", "/").split("/").filter(Boolean);
  return pathSegments.at(-1) ?? null;
}

function isDemoProfileSqliteRuntime() {
  if (process.env.CRM_AUTO_PRISMA_CLIENT !== "sqlite") {
    return false;
  }

  return extractSqliteFilename() === DEMO_SQLITE_FILENAME;
}

async function main() {
  if (!isTrueEnvFlag(process.env.DEMO_RESET_LOOP_ENABLED)) {
    console.log("[demo-reset-loop] skipped: enable with DEMO_RESET_LOOP_ENABLED=true");
    return;
  }

  if (!isDemoProfileSqliteRuntime()) {
    console.log(
      "[demo-reset-loop] skipped: requires CRM_AUTO_PRISMA_CLIENT=sqlite and demo-profile SQLite target",
    );
    return;
  }

  const intervalSeconds = resolveLoopIntervalSeconds();
  const { resetDemoData } = await import("./seed.mjs");

  let loopStopped = false;
  let tickInFlight = false;
  let timer = null;

  const runTick = async (trigger) => {
    if (loopStopped) {
      return;
    }

    if (tickInFlight) {
      console.warn(`[demo-reset-loop] tick skipped: previous run still in flight (${trigger})`);
      return;
    }

    tickInFlight = true;

    try {
      const result = await resetDemoData({ reason: "reset-loop" });
      const status = result.resetPerformed ? "performed" : `skipped (${result.reason})`;

      console.log(
        `[demo-reset-loop] tick ${status}; trigger=${trigger}; activeSessions=${result.activeSessions}; lastResetAt=${result.lastResetAt ?? "none"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[demo-reset-loop] tick failed: ${message}`);
    } finally {
      tickInFlight = false;
    }
  };

  const stopLoop = (signal) => {
    if (loopStopped) {
      return;
    }

    loopStopped = true;
    clearInterval(timer);
    console.log(`[demo-reset-loop] stopping on ${signal}`);
    process.exit(0);
  };

  console.log(
    `[demo-reset-loop] started; intervalSeconds=${intervalSeconds}; guardedReset=true; target=${DEMO_SQLITE_FILENAME}`,
  );

  await runTick("startup");
  timer = setInterval(() => {
    void runTick("interval");
  }, intervalSeconds * 1000);

  process.on("SIGINT", () => stopLoop("SIGINT"));
  process.on("SIGTERM", () => stopLoop("SIGTERM"));
}

try {
  await main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[demo-reset-loop] fatal startup error: ${message}`);
  process.exitCode = 1;
}

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const nextArgs = process.argv.slice(2);
const nextBinPath = path.resolve(process.cwd(), "node_modules/next/dist/bin/next");
const resetLoopPath = path.resolve(process.cwd(), "prisma/demo-reset-loop.mjs");
const customServerScript = (process.env.CRM_AUTO_DEMO_SERVER_SCRIPT ?? "").trim();
const appBinPath = customServerScript
  ? path.resolve(process.cwd(), customServerScript)
  : nextBinPath;
const appArgs = customServerScript ? nextArgs : ["start", ...nextArgs];

let isShuttingDown = false;
let appExitHandled = false;

function spawnChild(label, filePath, args = []) {
  const child = spawn(process.execPath, [filePath, ...args], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });

  child.on("error", (error) => {
    console.error(`[start:demo:sqlite] ${label} failed to start: ${error.message}`);
  });

  return child;
}

function stopChild(child, signal = "SIGTERM") {
  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  child.kill(signal);
}

const appChild = spawnChild("app", appBinPath, appArgs);
const shouldStartLoop = process.env.DEMO_RESET_LOOP_ENABLED === "true";
const loopChild = shouldStartLoop ? spawnChild("demo reset loop", resetLoopPath) : null;

if (loopChild) {
  loopChild.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const exitLabel = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.warn(
      `[start:demo:sqlite] demo reset loop exited with ${exitLabel}; app keeps running`,
    );
  });
}

const shutdown = (signal) => {
  if (isShuttingDown) {
    return;
  }

  isShuttingDown = true;
  console.log(`[start:demo:sqlite] shutting down on ${signal}`);
  stopChild(loopChild, signal);
  stopChild(appChild, signal);

  setTimeout(() => {
    process.exit(0);
  }, 5000).unref();
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

appChild.on("exit", (code, signal) => {
  if (appExitHandled) {
    return;
  }

  appExitHandled = true;
  stopChild(loopChild);

  if (signal) {
    console.error(`[start:demo:sqlite] app exited on signal ${signal}`);
    process.exit(1);
  }

  process.exit(code ?? 0);
});

import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_PORT = "3000";

function resolveHost() {
  const candidates = [process.env.HOST, process.env.IP];

  for (const value of candidates) {
    const host = (value ?? "").trim();

    if (host) {
      return host;
    }
  }

  return DEFAULT_HOST;
}

function resolvePort() {
  const port = (process.env.PORT ?? "").trim();
  return port || DEFAULT_PORT;
}

const customServerScript = (process.env.CRM_AUTO_DEMO_SERVER_SCRIPT ?? "").trim();
const resolvedHost = resolveHost();
const resolvedPort = resolvePort();
const supervisorPath = path.resolve(process.cwd(), "prisma/start-demo-sqlite.mjs");
const forwardedArgs = process.argv.slice(2);
const supervisorArgs = [supervisorPath];

if (!customServerScript) {
  supervisorArgs.push("--hostname", resolvedHost, "--port", resolvedPort);
}

supervisorArgs.push(...forwardedArgs);

const child = spawn(process.execPath, supervisorArgs, {
  cwd: process.cwd(),
  env: {
    ...process.env,
    CRM_AUTO_PRISMA_CLIENT: "sqlite",
    ...(customServerScript
      ? {
          HOSTNAME: resolvedHost,
          PORT: resolvedPort,
        }
      : {}),
  },
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(`[start:demo:sqlite:hosted] failed to start: ${error.message}`);
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

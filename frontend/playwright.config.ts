import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

function loadLocalSmokeEnv() {
  const envFilePath = path.resolve(process.cwd(), ".env");

  if (!existsSync(envFilePath)) {
    return;
  }

  const envContents = readFileSync(envFilePath, "utf8");

  for (const rawLine of envContents.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();

    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadLocalSmokeEnv();

const DEFAULT_SMOKE_BASE_URL = "http://127.0.0.1:3000";
const smokeBaseUrl = process.env.SMOKE_BASE_URL || DEFAULT_SMOKE_BASE_URL;
const shouldManageLocalWebServer = smokeBaseUrl === DEFAULT_SMOKE_BASE_URL;

/**
 * Pegas Service Desk — project-local Playwright config.
 * Uses Chromium only (isolated from system Chrome / Edge).
 * Other projects in this WSL use their own Playwright installs.
 */
export default defineConfig({
  testDir: "./tests/smoke",
  outputDir: "./tests/smoke/results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never", outputFolder: "./tests/smoke/report" }]],

  use: {
    baseURL: smokeBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "pegas-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  ...(shouldManageLocalWebServer
    ? {
        webServer: {
          command: "npm run dev -- --hostname 127.0.0.1 --port 3000",
          url: DEFAULT_SMOKE_BASE_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});

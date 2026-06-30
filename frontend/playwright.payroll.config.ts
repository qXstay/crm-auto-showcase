import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/payroll",
  outputDir: "/tmp/pegas-service-desk-payroll-test-results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});

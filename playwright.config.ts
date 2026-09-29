import { defineConfig } from "@playwright/test";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://releasedate:releasedate@localhost:5432/releasedate_test";
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/release-calendar`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: TEST_DATABASE_URL, SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret-12345" },
  },
});

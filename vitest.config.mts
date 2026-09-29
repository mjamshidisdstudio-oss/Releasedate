import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://releasedate:releasedate@localhost:5432/releasedate_test";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/unit/**/*.test.{ts,tsx}", "tests/integration/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    env: { DATABASE_URL: TEST_DATABASE_URL, SESSION_SECRET: "test-secret-test-secret-test-secret-123" },
    // Integration tests share one database.
    fileParallelism: false,
  },
});

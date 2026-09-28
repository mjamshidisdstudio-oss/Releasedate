import { execSync } from "node:child_process";

/** Applies migrations to the test database before any test file runs. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://releasedate:releasedate@localhost:5432/releasedate_test";
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "inherit" });
}

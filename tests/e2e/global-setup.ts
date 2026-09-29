import { execSync } from "node:child_process";

/** Fresh, seeded test database for the browser tests. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://releasedate:releasedate@localhost:5432/releasedate_test";
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "inherit" });
  execSync("npx tsx tests/e2e/reset-db.ts", { env, stdio: "inherit" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "inherit" });
}

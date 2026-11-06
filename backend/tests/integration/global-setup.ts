import { execSync } from "node:child_process";

/**
 * When DATABASE_URL_TEST is set, apply migrations to that (disposable)
 * database before integration tests run. Without it, integration suites skip.
 */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) return;
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}

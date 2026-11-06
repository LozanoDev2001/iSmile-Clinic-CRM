import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

// Integration tests read DATABASE_URL_TEST from the root .env (only that key —
// unit tests must never see the real DATABASE_URL).
const rootEnv = path.resolve(root, "../.env");
if (!process.env.DATABASE_URL_TEST && fs.existsSync(rootEnv)) {
  const testUrl = parse(fs.readFileSync(rootEnv)).DATABASE_URL_TEST;
  if (testUrl) process.env.DATABASE_URL_TEST = testUrl;
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    // `server-only` throws outside the Next.js server bundle; tests run in Node.
    alias: { "server-only": path.resolve(root, "tests/helpers/empty-module.ts") },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    // next-auth's ESM imports `next/server` without an extension; let Vite resolve it.
    server: { deps: { inline: ["next-auth", "@auth/core"] } },
    // Integration tests share one database.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});

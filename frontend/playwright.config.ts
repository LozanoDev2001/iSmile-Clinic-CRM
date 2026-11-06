import { defineConfig, devices } from "@playwright/test";

/**
 * E2E tests run against a seeded development database:
 *   npm run db:deploy && npm run db:seed
 *   E2E_PASSWORD="<SEED_PASSWORD>" npm run test:e2e
 * First run: npx playwright install chromium
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
});

import { expect, test, type Page } from "@playwright/test";

/** Uses the users created by prisma/seed.ts. */
const PASSWORD = process.env.E2E_PASSWORD ?? "";

test.skip(!PASSWORD, "Set E2E_PASSWORD to the SEED_PASSWORD used for npm run db:seed");

/** Fills and submits the form on the current page (must already be /login). */
async function submitLogin(page: Page, email: string, password = PASSWORD) {
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

/** Signs in from a fresh /login and waits until the app has navigated away. */
async function login(page: Page, email: string) {
  await page.goto("/login");
  await submitLogin(page, email);
  await expect(page).not.toHaveURL(/\/login/);
}

test("redirects unauthenticated users to /login and back after sign-in", async ({ page }) => {
  await page.goto("/users");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fusers/);
  await submitLogin(page, "admin@ismile.test");
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole("heading", { name: "Staff accounts" })).toBeVisible();
});

test("rejects invalid credentials with a generic message", async ({ page }) => {
  await page.goto("/login");
  await submitLogin(page, "admin@ismile.test", "definitely the wrong password");
  await expect(page.getByRole("alert").first()).toContainText("Invalid email or password");
  await expect(page).toHaveURL(/\/login/);
});

test("validates the form on the client", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Enter your email or staff ID", { exact: true })).toBeVisible();
});

test("redirects signed-in users away from /login", async ({ page }) => {
  await login(page, "reception@ismile.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.goto("/login");
  await expect(page).toHaveURL(/\/dashboard/);
});

test("shows access denied for pages outside the role", async ({ page }) => {
  await login(page, "reception@ismile.test");
  await page.goto("/users");
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
});

test("protects API routes", async ({ request }) => {
  const res = await request.get("/api/patients");
  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
});

test("logout ends the session", async ({ page }) => {
  await login(page, "finance@ismile.test");
  await expect(page).toHaveURL(/\/dashboard/);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
});

test("sign out everywhere revokes the session in other browsers", async ({ page, browser }) => {
  await login(page, "crm@ismile.test");
  const other = await browser.newContext();
  const otherPage = await other.newPage();
  await login(otherPage, "crm@ismile.test");
  await expect(otherPage).toHaveURL(/\/dashboard/);

  await page.goto("/profile");
  await page.getByRole("button", { name: "Sign out of all devices" }).click();
  await expect(page).toHaveURL(/reason=signed-out-everywhere/);

  await otherPage.reload();
  await expect(otherPage).toHaveURL(/\/login\?reason=expired/);
  await other.close();
});

test("forgot password responds identically for unknown emails", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill("nobody-here@ismile.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
});

test("an invalid reset token is rejected", async ({ page }) => {
  await page.goto("/reset-password?token=not-a-real-token");
  await expect(page.getByRole("heading", { name: "This link is invalid or has expired" })).toBeVisible();
});

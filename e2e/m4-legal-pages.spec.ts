/**
 * E2E smoke for /legal/terms and /legal/privacy.
 *
 * Both pages are public — anonymous users MUST NOT be redirected to login.
 * Both render the voice-locked headings from LEGAL_COPY.
 * 375px viewport (MCP-Playwright smoke per Override A).
 */

import { test, expect } from "@playwright/test";

test.use({ viewport: { width: 375, height: 812 } });

test.describe("/legal/terms — public, anon-accessible", () => {
  test("returns 200 and renders heading without redirect", async ({ page }) => {
    const response = await page.goto("/legal/terms");
    expect(response?.status()).toBe(200);
    // Must NOT have redirected to /login
    expect(page.url()).toContain("/legal/terms");
  });

  test("renders the voice-locked heading", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { name: "The terms" })).toBeVisible();
  });

  test("renders all four sections", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(
      page.getByRole("heading", { name: "What this is" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your data" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Questions" })
    ).toBeVisible();
  });

  test("renders at 375px without layout overflow", async ({ page }) => {
    await page.goto("/legal/terms");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});

test.describe("/legal/privacy — public, anon-accessible", () => {
  test("returns 200 and renders heading without redirect", async ({ page }) => {
    const response = await page.goto("/legal/privacy");
    expect(response?.status()).toBe(200);
    expect(page.url()).toContain("/legal/privacy");
  });

  test("renders the voice-locked heading", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(
      page.getByRole("heading", { name: "What we keep" })
    ).toBeVisible();
  });

  test("renders all four sections", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(
      page.getByRole("heading", { name: "What we store" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Who we share it with" })
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Deleting your data" })
    ).toBeVisible();
  });

  test("renders at 375px without layout overflow", async ({ page }) => {
    await page.goto("/legal/privacy");
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});

test.describe("home page footer links to legal pages", () => {
  test("home page has links to /legal/terms and /legal/privacy", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Privacy" })).toBeVisible();
  });
});

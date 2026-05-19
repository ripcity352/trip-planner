/**
 * Playwright smoke for `/login` magic-link request.
 *
 * We don't actually receive a magic link — that depends on Supabase
 * reaching out + an inbox. Instead, we intercept the Supabase OTP
 * endpoint at the network boundary, return a synthetic 200, and assert
 * the form renders the success copy (`ERRORS.auth_link_sent`).
 *
 * The intercept lets the spec pass with or without Supabase env vars
 * (CI has them, local dev may not). If the env is unconfigured the
 * server action will return an error key; we cover the happy path here.
 */

import { test, expect } from "@playwright/test";

const SUCCESS_COPY = "Link's on its way. Check your email — it's quick.";

test.describe("login magic-link", () => {
  test.use({
    viewport: { width: 375, height: 812 }, // iPhone-class width
  });

  test("submitting a valid email shows the success copy", async ({ page }) => {
    // Intercept the Supabase OTP request that the server action makes on
    // our behalf. Any URL containing `auth/v1/otp` is the OTP endpoint.
    await page.route("**/auth/v1/otp**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: null }),
      });
    });

    await page.goto("/login");

    await expect(
      page.getByRole("heading", { name: /sign in/i })
    ).toBeVisible();

    await page.getByLabel(/email/i).fill("dave@example.com");
    await page.getByRole("button", { name: /send the link/i }).click();

    // Success copy lands; form disappears.
    await expect(page.getByText(SUCCESS_COPY)).toBeVisible();
  });

  test("error query param renders the auth_failed note", async ({ page }) => {
    await page.goto("/login?error=auth");
    await expect(
      page.getByText("Link's stale. Hop back to /login and try again.")
    ).toBeVisible();
  });
});

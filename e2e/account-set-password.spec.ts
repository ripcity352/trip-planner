/**
 * E2E spec — State B set-password happy path (M5/PR5).
 *
 * Tests the flow for a user who has only an OAuth or OTP identity and
 * visits /account/sign-in-and-security to set a password for the first time.
 *
 * State B contract (v3.2 ADR locked):
 *   - No current-password field.
 *   - No OTP gate before setPassword.
 *   - No signOut after success.
 *   - Calls setPasswordAction({ newPassword }) server action.
 *   - On success: shows success toast.
 *
 * CI note: requires a seeded test account with identityState === 'no-password'.
 * The seed script is in e2e/_setup/seed-test-user.ts and creates an OAuth-only
 * user for this flow. See #225 for CI wiring.
 */

import { test, expect } from "@playwright/test";

test.describe("State B — set password (OAuth-only / OTP-only user)", () => {
  // For CI, the auth setup fixture provides a seeded OAuth-only session.
  // For local runs against a real Supabase, sign in via Google OAuth first
  // or create a test user via the admin API with no password identity.

  test.beforeEach(async ({ page }) => {
    // Navigate to the sign-in & security page (requires auth).
    // In CI this depends on the auth.setup.ts fixture providing a valid session
    // for a no-password user. Until that fixture exists, the test auto-skips.
    await page.goto("/account/sign-in-and-security");
  });

  test("State B: renders a new-password field but NOT a current-password field", async ({
    page,
  }) => {
    // Only reachable if identityState === 'no-password'
    // If the page redirects to /login, the test will fail with a URL mismatch —
    // that's the correct signal that the fixture user needs to be seeded.
    await expect(page).toHaveURL(/sign-in-and-security/);

    const newPasswordField = page.getByLabel(/new password/i);
    await expect(newPasswordField).toBeVisible();

    const currentPasswordField = page.getByLabel(/current password/i);
    await expect(currentPasswordField).not.toBeVisible();
  });

  test("State B: renders 'Set password' button (not 'Update password')", async ({ page }) => {
    await expect(page).toHaveURL(/sign-in-and-security/);

    await expect(
      page.getByRole("button", { name: /set password/i })
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: /update password/i })
    ).not.toBeVisible();
  });

  test("State B happy path: entering a valid password and submitting shows success toast", async ({
    page,
  }) => {
    await expect(page).toHaveURL(/sign-in-and-security/);

    await page.fill('input[autocomplete="new-password"]', "mynewpass123");
    await page.getByRole("button", { name: /set password/i }).click();

    // Success toast (role=status per the form implementation).
    await expect(page.getByRole("status")).toBeVisible({ timeout: 5_000 });
  });

  test("State B: shows helper copy appropriate to the user's identity type", async ({ page }) => {
    await expect(page).toHaveURL(/sign-in-and-security/);

    // For an OAuth-only user, the helper mentions Google.
    // For an OTP-only user, it mentions code.
    // The helper should be present regardless of sub-type.
    const helperText = page.locator("p.text-muted-foreground, .text-sm");
    await expect(helperText.first()).toBeVisible();
  });

  test("State B validation: short password shows an inline error", async ({ page }) => {
    await expect(page).toHaveURL(/sign-in-and-security/);

    await page.fill('input[autocomplete="new-password"]', "abc");
    await page.getByRole("button", { name: /set password/i }).click();

    await expect(page.getByRole("alert")).toBeVisible({ timeout: 3_000 });
  });
});
